import "server-only";
import { HttpError, draftSpec, getAccess, publishedSpec, type ProjectRow } from "../access";
import { audit } from "../audit";
import { notifyStaff } from "../notify";
import { adminClient } from "../supabase/admin";
import { projectLocked } from "../unlock";
import { orderReference, zp, zpConfig, ZpError, type ZpConfig, type ZpPayment } from "../zingopay";
import { runOp, type OpContext } from "./engine";
import { availableOf, normPhone, ORDER_STATUS, settingsOf, totalAvailable, variantLabel, type Category, type Doc, type Order, type Product, type Settings } from "./model";
import { SupabaseStore } from "./supabase-store";

/**
 * Accès public à la boutique en ligne (/shop/:slug). Aucune session client : seules les données
 * publiques sortent d'ici (jamais prix d'achat, stock exact, clients, ventes), et les écritures
 * passent par les opérations « publiques » du moteur, au nom du propriétaire (traçabilité).
 */

export type PublicShop = { project: ProjectRow; demo: boolean; store: SupabaseStore; settings: Settings; zp: ZpConfig | null };

const SLUG = /^[a-z0-9][a-z0-9-]{2,60}$/;

async function load(slug: string): Promise<ProjectRow> {
  if (!SLUG.test(slug)) throw new HttpError(404, "Boutique introuvable.");
  const { data } = await adminClient().from("projects").select("*").eq("slug", slug).maybeSingle();
  if (!data) throw new HttpError(404, "Boutique introuvable.");
  return data as ProjectRow;
}

/**
 * Boutique par son adresse publique. `wantDemo` : aperçu avec les données de test, réservé au
 * propriétaire et aux administrateurs connectés. Sans cela, seules les données réelles d'une
 * boutique publiée (et non suspendue) sont servies.
 */
export async function publicShop(slug: string, wantDemo: boolean): Promise<PublicShop> {
  const project = await load(slug);
  let demo = false;
  if (wantDemo) {
    const access = await getAccess(project.id).catch(() => null);
    if (!access || (access.role !== "owner" && access.role !== "admin")) throw new HttpError(403, "L'aperçu est réservé au propriétaire de la boutique, connecté.");
    demo = true;
  }
  if (!demo && project.status === "suspended") throw new HttpError(423, "Cette boutique est temporairement fermée.");
  if (!demo && (await projectLocked(project))) throw new HttpError(423, "Cette boutique est temporairement fermée.");
  const spec = demo ? (draftSpec(project) ?? publishedSpec(project)) : publishedSpec(project);
  if (!spec || spec.module !== "shop") throw new HttpError(404, "Boutique introuvable.");
  const store = new SupabaseStore(project.id, demo, project.owner_id);
  const settings = settingsOf((await store.list("settings"))[0], spec.name || project.name);
  const zpc = await zpConfig(project.id).catch(() => null);
  return { project, demo, store, settings, zp: zpc?.enabled ? zpc : null };
}

/** Même boutique pour un appel serveur à serveur (notification ZingoPay), jeu de données imposé par la référence. */
export async function serverShop(slug: string, demo: boolean): Promise<PublicShop | null> {
  const project = await load(slug);
  const spec = publishedSpec(project) ?? draftSpec(project);
  if (!spec || spec.module !== "shop") return null;
  const store = new SupabaseStore(project.id, demo, project.owner_id);
  const settings = settingsOf((await store.list("settings"))[0], spec.name || project.name);
  return { project, demo, store, settings, zp: await zpConfig(project.id).catch(() => null) };
}

export const publicCtx = (p: PublicShop): OpContext => ({ store: p.store, actor: { id: p.project.owner_id, role: "employee" }, public: true, zingopay: Boolean(p.zp) });
export const internalCtx = (p: PublicShop): OpContext => ({ store: p.store, actor: { id: p.project.owner_id, role: "employee" }, internal: "zingopay", zingopay: Boolean(p.zp) });

/** Catalogue public : produits visibles et disponibles, sans prix d'achat ni quantités exactes. */
export async function catalog(p: PublicShop) {
  const [products, categories] = await Promise.all([p.store.list("product") as Promise<Doc<Product>[]>, p.store.list("category") as Promise<Doc<Category>[]>]);
  const s = p.settings;
  const now = Date.now();
  const visible = products.filter((x) => x.data.online && x.data.active && !x.data.archived);
  const used = new Set(visible.flatMap((x) => x.data.photo_ids));
  const items = visible.map((x) => {
    const d = x.data;
    const avail = totalAvailable(d, now);
    return {
      id: x.id,
      name: d.name,
      description: d.description,
      category_id: d.category_id,
      price: d.sell_price,
      unit: d.unit,
      photos: d.photo_ids,
      available: avail > 0,
      /** « Plus que N » seulement quand c'est vraiment peu (aucune quantité exacte autrement). */
      few: avail > 0 && avail <= Math.max(3, d.min_qty) ? Math.floor(avail) : null,
      attrs: d.variant_attrs,
      variants: d.variants.filter((v) => v.active).map((v) => ({ id: v.id, label: variantLabel(v), values: v.values, price: v.price ?? d.sell_price, available: availableOf(d, v.id, now) > 0 })),
    };
  });
  const catsUsed = new Set(items.map((i) => i.category_id).filter(Boolean));
  return {
    shop: {
      name: s.name,
      slug: p.project.slug,
      description: s.description,
      welcome: s.welcome,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.email,
      address: s.address,
      hours: s.hours,
      primary: s.primary,
      logo: s.logo_id,
      banner: s.banner_id,
      type: s.type,
    },
    published: s.online.published,
    ordering: s.online.published && s.online.ordering,
    delivery: s.delivery.enabled ? { fee: s.delivery.fee, info: s.delivery.info } : null,
    pickup: s.pickup.enabled ? { info: s.pickup.info } : null,
    payments: { delivery: s.online.pay_delivery, pickup: s.online.pay_pickup, zingopay: s.online.zingopay && Boolean(p.zp), zingopayTest: p.zp?.mode === "test" },
    demo: p.demo,
    categories: categories.filter((c) => catsUsed.has(c.id)).sort((a, b) => a.data.sort - b.data.sort).map((c) => ({ id: c.id, name: c.data.name })),
    items: s.online.published || p.demo ? items : [],
    // Images autorisées (produits visibles, logo, bannière) : rien d'autre n'est servi.
    allowed: [...used, s.logo_id, s.banner_id].filter(Boolean) as string[],
  };
}

export async function publicImage(p: PublicShop, id: string): Promise<{ type: string; bytes: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = await catalog(p);
  if (!c.allowed.includes(id)) return null;
  const doc = await p.store.get("photo", id);
  const m = doc ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(doc.data.data)) : null;
  return m ? { type: m[1]!, bytes: Buffer.from(m[2]!, "base64") } : null;
}

/** Suivi : le client reçoit un lien secret (jeton) ; sans lien, numéro de commande + téléphone de la commande. */
export async function findOrder(p: PublicShop, q: { token?: string | null; number?: string | null; phone?: string | null }): Promise<Doc<Order> | null> {
  const orders = (await p.store.list("order")) as Doc<Order>[];
  if (q.token) return /^[A-Za-z0-9]{12,64}$/.test(q.token) ? (orders.find((o) => o.data.tracking_token === q.token) ?? null) : null;
  const num = (q.number ?? "").trim().toUpperCase();
  const phone = normPhone(q.phone ?? "");
  if (!num || phone.length < 6) return null;
  return orders.find((o) => o.data.number.toUpperCase() === num && normPhone(o.data.customer.phone).slice(-6) === phone.slice(-6)) ?? null;
}

/** Vue publique d'une commande : statuts et montants, sans identifiants internes. */
export function publicOrder(o: Doc<Order>, shopName: string) {
  const d = o.data;
  return {
    number: d.number,
    shop: shopName,
    status: d.status,
    status_label: ORDER_STATUS[d.status],
    mode: d.mode,
    pay_mode: d.pay_mode,
    pay_status: d.pay_status,
    total: d.total,
    delivery_fee: d.delivery_fee,
    items: d.items.map((l) => ({ name: l.name, qty: l.qty, unit_price: l.unit_price })),
    history: d.history.map((h) => ({ status: h.to, label: ORDER_STATUS[h.to], at: h.at })),
    at: d.at,
    pay_url: d.zp && d.pay_status !== "paye" && d.status !== "annulee" ? d.zp.pay_url : null,
    customer_name: d.customer.name,
  };
}

// ---------- ZingoPay ----------

/** Crée (ou retrouve) le paiement ZingoPay de la commande, au montant exact. */
export async function startZpPayment(p: PublicShop, orderId: string): Promise<string> {
  if (!p.zp) throw new ZpError(409, "disabled", "Le paiement ZingoPay n'est pas activé par cette boutique.");
  const o = (await p.store.get("order", orderId)) as Doc<Order> | null;
  if (!o || o.data.pay_mode !== "zingopay") throw new ZpError(404, "not_found", "Commande introuvable.");
  if (o.data.pay_status === "paye") throw new ZpError(409, "paid", "Cette commande est déjà payée.");
  if (o.data.zp && o.data.zp.status === "pending" && (!o.data.zp.expires_at || Date.parse(o.data.zp.expires_at) > Date.now() + 60_000)) return o.data.zp.pay_url;
  const reference = orderReference(o.id, p.demo);
  let pay: ZpPayment;
  try {
    pay = await zp.create(p.zp.apiKey, { amount: o.data.total, reference, description: `${p.settings.name} · commande ${o.data.number}`.slice(0, 120), expires_in_minutes: 45 });
  } catch (e) {
    if (e instanceof ZpError && e.code === "reference_conflict") {
      const prev = await zp.byReference(p.zp.apiKey, reference);
      if (!prev) throw e;
      pay = prev;
    } else throw e;
  }
  if (!pay.pay_url) throw new ZpError(502, "no_url", "ZingoPay n'a pas renvoyé de lien de paiement.");
  await runOp(internalCtx(p), "order.zp_attach", { order_id: o.id, zp: { id: pay.id, pay_url: pay.pay_url, status: pay.status, expires_at: pay.expires_at } });
  if (pay.status === "paid") await confirmIfPaid(p, o.id, pay);
  return pay.pay_url;
}

/** Relit le statut chez ZingoPay ; la commande n'est payée que si ZingoPay le confirme (même référence et même montant). */
export async function verifyZpOrder(p: PublicShop, orderId: string): Promise<"paid" | "pending" | "expired" | "cancelled" | "none"> {
  if (!p.zp) return "none";
  const o = (await p.store.get("order", orderId)) as Doc<Order> | null;
  if (!o?.data.zp) return "none";
  if (o.data.pay_status === "paye") return "paid";
  const pay = await zp.get(p.zp.apiKey, o.data.zp.id);
  if (pay.status === "paid") return (await confirmIfPaid(p, o.id, pay)) ? "paid" : "pending";
  return pay.status;
}

async function confirmIfPaid(p: PublicShop, orderId: string, pay: ZpPayment) {
  const o = (await p.store.get("order", orderId)) as Doc<Order> | null;
  if (!o) return false;
  const reference = orderReference(o.id, p.demo);
  if (pay.status !== "paid" || pay.reference !== reference || pay.amount_xaf !== o.data.total) {
    await audit("zingopay.mismatch", { projectId: p.project.id, level: "warning", details: { order: o.data.number, status: pay.status, reference: pay.reference, expected: reference, amount: pay.amount_xaf, total: o.data.total } });
    return false;
  }
  const already = o.data.pay_status === "paye";
  await runOp(internalCtx(p), "order.zp_paid", { order_id: o.id, payment_id: pay.id });
  if (!already && !p.demo) await notifyStaff(p.project.id, ["commandes", "caisse", "finances"], { type: "info", title: `Paiement ZingoPay reçu : ${o.data.number}`, body: `${pay.amount_xaf.toLocaleString("fr-FR")} FCFA, vérifié auprès de ZingoPay.`, link: `/apps/${p.project.slug}` });
  return true;
}

