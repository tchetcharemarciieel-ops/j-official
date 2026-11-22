import { z } from "zod";
import { SHOP_OP_PERMS, opDenied } from "../op-perms";
import type { Permission } from "../team";
import {
  EXPENSE_CATS,
  LEVEL,
  ORDER_FLOW,
  PAY_METHODS,
  ORDER_STATUS,
  SHOP_TYPE_IDS,
  availableOf,
  costOf,
  dueOf,
  expectedCash,
  findVariant,
  hasVariants,
  lineTotal,
  normPhone,
  paidOf,
  poDue,
  priceOf,
  refundOutOf,
  refundedOf,
  returnValue,
  returnedQty,
  round2,
  saleTotals,
  settingsOf,
  stockOf,
  variantLabel,
  type Category,
  type Col,
  type Customer,
  type Doc,
  type Expense,
  type Lot,
  type Move,
  type MoveType,
  type Order,
  type OrderLine,
  type OrderStatus,
  type Pay,
  type PayMethod,
  type Po,
  type Product,
  type Register,
  type Sale,
  type SaleLine,
  type Settings,
  type ShopRole,
  type Supplier,
  type Variant,
} from "./model";

/**
 * Moteur des opérations de MiniSoft Shop. Chaque opération vérifie le rôle et le poste,
 * valide les données, applique les règles métier et n'écrit qu'à travers le `ShopStore` :
 * - mises à jour conditionnelles (`cas`) : deux caissiers simultanés ne s'écrasent jamais ;
 * - clés d'opération : un mouvement de stock n'est jamais appliqué deux fois ;
 * - identifiant de vente fourni par l'appareil : une vente renvoyée deux fois (réseau coupé,
 *   synchronisation hors connexion) n'est enregistrée qu'une seule fois.
 */

export interface ShopStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  /** N'écrit que si la fiche n'a pas changé depuis `doc.updated_at` ; sinon renvoie null. */
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  nextSeq(key: string): Promise<number>;
}

export type Actor = { id: string; role: ShopRole };
export type OpContext = {
  store: ShopStore;
  actor: Actor;
  perms?: Permission[] | null;
  now?: () => Date;
  uuid?: () => string;
  /** Opération venue de la boutique publique (client sans compte). */
  public?: boolean;
  /** Opération interne, après vérification auprès du prestataire de paiement. */
  internal?: "zingopay";
  zingopay?: boolean;
};
export type Effect = { type: "order"; number: string; total: number; name: string } | { type: "low_stock"; names: string[] };
export type OpResult = { message: string; id?: string; number?: string; token?: string; effects: Effect[]; duplicate?: boolean; data?: unknown };

export class OpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const txt = (max: number) => z.string().trim().max(max).default("");
const req = (max: number, label: string) => z.string().trim().min(1, `${label} obligatoire`).max(max);
const id = z.string().min(1).max(64);
const optId = z.string().max(64).nullish().transform((v) => v || null);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Identifiant invalide");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optDate = z.union([date, z.literal(""), z.null()]).optional().transform((v) => v || null);
const amount = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform((n) => Math.round(n));
const pos = z.coerce.number().finite().positive("Montant supérieur à 0 attendu").max(1e12).transform((n) => Math.round(n));
const qty = z.coerce.number().finite().positive("Quantité supérieure à 0 attendue").max(1e6).transform(round2);
const qty0 = z.coerce.number().finite().min(0).max(1e6).transform(round2);
const idem = z.string().min(8).max(80);
const payMethod = z.enum(["especes", "mobile_money", "carte", "autre"]);

const nowIso = (ctx: OpContext) => (ctx.now?.() ?? new Date()).toISOString();
const nowMs = (ctx: OpContext) => (ctx.now?.() ?? new Date()).getTime();
const newId = (ctx: OpContext) => (ctx.uuid ?? (() => crypto.randomUUID()))();
const year = (ctx: OpContext) => (ctx.now?.() ?? new Date()).getFullYear();
const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, effects: [], ...extra });

async function number(ctx: OpContext, prefix: string) {
  const n = await ctx.store.nextSeq(`${prefix}-${year(ctx)}`);
  return `${prefix}-${year(ctx)}-${String(n).padStart(4, "0")}`;
}

async function must<T>(ctx: OpContext, col: Col, docId: string, label: string): Promise<Doc<T>> {
  const d = await ctx.store.get(col, docId);
  if (!d) throw new OpError(404, `${label} introuvable.`);
  return d as Doc<T>;
}

/** Lit, transforme et réécrit une fiche avec contrôle de version ; recommence en cas d'accès simultané. */
async function mutate<T>(ctx: OpContext, col: Col, docId: string, label: string, fn: (data: T, doc: Doc<T>) => T | null): Promise<{ doc: Doc<T>; written: boolean }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc = await must<T>(ctx, col, docId, label);
    const next = fn(structuredClone(doc.data), doc);
    if (next === null) return { doc, written: false };
    const saved = await ctx.store.cas(col, doc as unknown as Doc, next as object);
    if (saved) return { doc: saved as Doc<T>, written: true };
  }
  throw new OpError(409, "Cette fiche est modifiée en même temps par un autre utilisateur. Réessayez.");
}

async function settings(ctx: OpContext): Promise<{ doc: Doc | null; s: Settings }> {
  const doc = (await ctx.store.list("settings"))[0] ?? null;
  return { doc, s: settingsOf(doc ?? undefined) };
}

function needManager(ctx: OpContext, what: string) {
  if (LEVEL[ctx.actor.role] < 2) throw new OpError(403, `Seul un responsable (ou le propriétaire) peut ${what}.`);
}

// ---------- Stock ----------

/** Retire les réservations expirées (une commande non confirmée à temps libère son stock). */
const prune = (p: Product, now: number) => ({ ...p, reservations: p.reservations.filter((r) => Date.parse(r.until) > now) });

type StockArgs = {
  product_id: string;
  variant_id: string | null;
  delta: number;
  type: MoveType;
  reason: string;
  ref?: string;
  op_key: string;
  unit_cost?: number | null;
  /** Inventaire / ajustement : quantité comptée (le mouvement est la différence). */
  setQty?: number;
  /** Vente hors connexion déjà faite : le stock peut devenir négatif (conflit signalé). */
  allowNegative?: boolean;
  /** Commande en ligne remise : sa réservation est levée dans la même écriture. */
  releaseKey?: string;
  lot?: { number: string; expiry: string | null } | null;
};

/**
 * Mouvement de stock appliqué une seule fois par clé d'opération, par mise à jour
 * conditionnelle : deux ventes simultanées ne peuvent pas vendre la même unité.
 * Les sorties ne prennent jamais le stock réservé par une commande en ligne.
 */
async function applyStock(ctx: OpContext, m: StockArgs): Promise<{ move: Doc<Move> | null; negative: boolean }> {
  let applied = false;
  let delta = m.delta;
  let after = 0;
  let cost: number | null = m.unit_cost ?? null;
  let label = "";
  let negative = false;
  const now = nowMs(ctx);
  const { written } = await mutate<Product>(ctx, "product", m.product_id, "Produit", (raw) => {
    let p = prune(raw, now);
    if (p.op_keys.includes(m.op_key)) {
      applied = true;
      return null;
    }
    if (m.releaseKey) p = { ...p, reservations: p.reservations.filter((r) => !(r.key === m.releaseKey && (r.variant_id ?? null) === (m.variant_id ?? null))) };
    const v = findVariant(p, m.variant_id);
    if (hasVariants(p) && !v) throw new OpError(422, `Choisissez une variante de « ${p.name} ».`);
    label = v ? `${p.name} — ${variantLabel(v)}` : p.name;
    const cur = stockOf(p, m.variant_id);
    if (m.setQty !== undefined) delta = round2(m.setQty - cur);
    after = round2(cur + delta);
    const free = round2(availableOf(p, m.variant_id, now) + delta);
    if (delta < 0 && m.setQty === undefined && free < 0) {
      if (!m.allowNegative) throw new OpError(409, `Stock insuffisant pour « ${label} » : ${Math.max(0, availableOf(p, m.variant_id, now))} disponible(s), ${Math.abs(delta)} demandé(s).`);
      negative = true;
    }
    if (cost === null || m.unit_cost === undefined) cost = costOf(p, m.variant_id);
    // Lots : une entrée crée (ou complète) un lot ; une sortie consomme d'abord les lots qui périment le plus tôt.
    let lots = p.lots;
    if (!v && p.track_expiry) {
      if (delta > 0 && m.lot) {
        const same = lots.find((l) => l.number === m.lot!.number && l.expiry === m.lot!.expiry);
        lots = same ? lots.map((l) => (l === same ? { ...l, qty: round2(l.qty + delta) } : l)) : [...lots, { id: crypto.randomUUID(), number: m.lot.number || "—", expiry: m.lot.expiry, qty: delta } satisfies Lot];
      } else if (delta < 0) {
        let left = -delta;
        lots = [...lots]
          .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"))
          .map((l) => {
            const take = Math.min(l.qty, left);
            left = round2(left - take);
            return { ...l, qty: round2(l.qty - take) };
          })
          .filter((l) => l.qty > 0);
      }
    }
    const lastCost = delta > 0 && m.unit_cost !== undefined && m.unit_cost !== null && (m.type === "reception" || m.type === "entree");
    if (v) {
      p = { ...p, variants: p.variants.map((x) => (x.id === v.id ? { ...x, stock: after, ...(lastCost ? { buy_price: m.unit_cost! } : {}) } : x)) };
    } else p = { ...p, stock: after, ...(lastCost ? { buy_price: m.unit_cost! } : {}) };
    return { ...p, lots, op_keys: [...p.op_keys, m.op_key].slice(-400) };
  });
  if (applied || !written) return { move: null, negative: false };
  const move: Move = { product_id: m.product_id, variant_id: m.variant_id, type: m.type, qty: delta, after, unit_cost: cost, reason: m.reason || label, ref: m.ref ?? "", lot: m.lot?.number ?? null, by: ctx.actor.id, at: nowIso(ctx), op_key: m.op_key };
  return { move: (await ctx.store.insert("move", move)) as Doc<Move>, negative };
}

/** Annule un mouvement appliqué (vente interrompue) : le stock revient et la clé est libérée pour un nouvel essai. */
async function undoStock(ctx: OpContext, productId: string, variantId: string | null, delta: number, opKey: string, ref: string) {
  const { written } = await mutate<Product>(ctx, "product", productId, "Produit", (p) => {
    if (!p.op_keys.includes(opKey)) return null;
    const v = findVariant(p, variantId);
    const op_keys = p.op_keys.filter((k) => k !== opKey);
    if (v) return { ...p, op_keys, variants: p.variants.map((x) => (x.id === v.id ? { ...x, stock: round2(x.stock - delta) } : x)) };
    return { ...p, op_keys, stock: round2(p.stock - delta) };
  });
  if (written) await ctx.store.insert("move", { product_id: productId, variant_id: variantId, type: "annulation", qty: -delta, after: 0, unit_cost: null, reason: "Vente interrompue : stock rétabli", ref, lot: null, by: ctx.actor.id, at: nowIso(ctx), op_key: `${opKey}:undo:${Date.now()}` } satisfies Move);
}

/** Réserve le stock d'une commande en ligne ; tout ou rien (les réservations déjà faites sont levées en cas d'échec). */
async function reserve(ctx: OpContext, orderId: string, lines: OrderLine[], until: string) {
  const done: OrderLine[] = [];
  const now = nowMs(ctx);
  try {
    for (const l of lines) {
      await mutate<Product>(ctx, "product", l.product_id, "Produit", (raw) => {
        const p = prune(raw, now);
        const rest = p.reservations.filter((r) => !(r.key === orderId && (r.variant_id ?? null) === l.variant_id));
        const free = availableOf({ ...p, reservations: rest }, l.variant_id, now);
        if (free < l.qty) throw new OpError(409, `Stock insuffisant pour « ${l.name} » : ${Math.max(0, free)} disponible(s).`);
        return { ...p, reservations: [...rest, { key: orderId, variant_id: l.variant_id, qty: l.qty, until }] };
      });
      done.push(l);
    }
  } catch (e) {
    await release(ctx, orderId, done);
    throw e;
  }
}

async function release(ctx: OpContext, orderId: string, lines: OrderLine[]) {
  for (const pid of new Set(lines.map((l) => l.product_id))) {
    await mutate<Product>(ctx, "product", pid, "Produit", (p) => (p.reservations.some((r) => r.key === orderId) ? { ...p, reservations: p.reservations.filter((r) => r.key !== orderId) } : null)).catch(() => undefined);
  }
}

function lowStockEffect(products: Doc<Product>[]): Effect[] {
  const names = products.filter((p) => !p.data.archived && hasVariants(p.data) === false && p.data.stock <= p.data.min_qty).map((p) => p.data.name);
  return names.length ? [{ type: "low_stock", names: names.slice(0, 5) }] : [];
}

// ---------- Clients ----------

async function findOrCreateCustomer(ctx: OpContext, c: { name: string; phone: string; address?: string }, source: Customer["source"]): Promise<Doc<Customer> | null> {
  const phone = normPhone(c.phone);
  if (!c.name && !phone) return null;
  const all = (await ctx.store.list("customer")) as Doc<Customer>[];
  const found = phone ? all.find((x) => normPhone(x.data.phone) === phone) : all.find((x) => x.data.name.toLowerCase() === c.name.toLowerCase());
  if (found) return found;
  return (await ctx.store.insert("customer", { name: c.name || phone, phone: c.phone, address: c.address ?? "", notes: "", source } satisfies Customer)) as Doc<Customer>;
}

// ---------- Opérations ----------

const variantIn = z.object({ id: z.string().max(64).optional(), values: z.record(z.string().max(30), z.string().trim().max(40)), sku: txt(60), barcode: txt(60), price: z.union([amount, z.null(), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)), buy_price: z.union([amount, z.null(), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)), active: z.boolean().default(true), initial: qty0.optional() });

const productIn = z.object({
  id: z.string().max(64).optional(),
  name: req(120, "Nom"),
  description: txt(2000),
  category_id: optId,
  buy_price: amount.default(0),
  sell_price: amount,
  unit: req(30, "Unité"),
  min_qty: qty0.default(0),
  sku: txt(60),
  barcode: txt(60),
  supplier_id: optId,
  active: z.boolean().default(true),
  online: z.boolean().default(true),
  photo_ids: z.array(id).max(6).default([]),
  variant_attrs: z.array(z.string().trim().min(1).max(30)).max(3).default([]),
  variants: z.array(variantIn).max(60).default([]),
  track_expiry: z.boolean().default(false),
  initial_stock: qty0.optional(),
  initial_lot: z.object({ number: txt(40), expiry: optDate }).nullish(),
});

const HANDLERS: Record<string, (ctx: OpContext, raw: unknown) => Promise<OpResult>> = {
  // ----- Réglages -----
  async "settings.save"(ctx, raw) {
    const i = z
      .object({
        type: z.enum(SHOP_TYPE_IDS as [string, ...string[]]),
        name: req(80, "Nom de la boutique"),
        description: txt(600),
        welcome: txt(300),
        phone: txt(30),
        whatsapp: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, "Numéro WhatsApp invalide").default(""),
        email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""),
        address: txt(200),
        hours: txt(200),
        primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
        logo_id: optId,
        banner_id: optId,
        units: z.array(z.string().trim().min(1).max(30)).min(1).max(30),
        low_stock_default: qty0.default(3),
        receipt_note: txt(200),
        allow_credit: z.boolean().default(false),
        delivery: z.object({ enabled: z.boolean(), fee: amount.default(0), info: txt(300) }),
        pickup: z.object({ enabled: z.boolean(), info: txt(300) }),
        online: z.object({ published: z.boolean(), ordering: z.boolean(), pay_delivery: z.boolean(), zingopay: z.boolean() }),
        reservation_minutes: z.coerce.number().int().min(15).max(10080).default(120),
      })
      .parse(raw);
    if (i.online.published && i.online.ordering && !i.delivery.enabled && !i.pickup.enabled) throw new OpError(422, "Activez la livraison ou le retrait en boutique pour recevoir des commandes en ligne.");
    if (i.online.published && i.online.ordering && !i.online.pay_delivery && !i.online.zingopay) throw new OpError(422, "Activez au moins un moyen de paiement : paiement à la livraison ou ZingoPay.");
    const units = [...new Set(i.units)];
    const { doc } = await settings(ctx);
    const data = { ...i, units } as Settings;
    if (doc) await mutate<Settings>(ctx, "settings", doc.id, "Réglages", (cur) => ({ ...cur, ...data }));
    else await ctx.store.insert("settings", data);
    return ok("Réglages enregistrés.");
  },

  // ----- Catégories -----
  async "category.save"(ctx, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(60, "Nom"), sort: z.coerce.number().int().min(0).max(999).default(0) }).parse(raw);
    const all = (await ctx.store.list("category")) as Doc<Category>[];
    if (all.some((c) => c.id !== i.id && c.data.name.toLowerCase() === i.name.toLowerCase())) throw new OpError(409, "Cette catégorie existe déjà.");
    if (i.id) {
      await mutate<Category>(ctx, "category", i.id, "Catégorie", (c) => ({ ...c, name: i.name, sort: i.sort }));
      return ok("Catégorie modifiée.", { id: i.id });
    }
    const d = await ctx.store.insert("category", { name: i.name, sort: i.sort || all.length } satisfies Category);
    return ok("Catégorie ajoutée.", { id: d.id });
  },
  async "category.delete"(ctx, raw) {
    const i = z.object({ id }).parse(raw);
    await must(ctx, "category", i.id, "Catégorie");
    for (const p of (await ctx.store.list("product")) as Doc<Product>[]) if (p.data.category_id === i.id) await mutate<Product>(ctx, "product", p.id, "Produit", (x) => ({ ...x, category_id: null }));
    await ctx.store.remove("category", i.id);
    return ok("Catégorie supprimée (ses produits restent, sans catégorie).");
  },

  // ----- Produits -----
  async "product.save"(ctx, raw) {
    const i = productIn.parse(raw);
    const { s } = await settings(ctx);
    if (!s.units.includes(i.unit)) throw new OpError(422, `Unité « ${i.unit} » inconnue : ajoutez-la dans les réglages.`);
    const all = (await ctx.store.list("product")) as Doc<Product>[];
    const codes = (p: Product) => [p.sku, p.barcode, ...p.variants.flatMap((v) => [v.sku, v.barcode])].filter(Boolean);
    const mine = [i.sku, i.barcode, ...i.variants.flatMap((v) => [v.sku, v.barcode])].filter(Boolean);
    if (new Set(mine).size !== mine.length) throw new OpError(409, "Une référence ou un code-barres est saisi deux fois.");
    for (const o of all) if (o.id !== i.id) for (const c of codes(o.data)) if (mine.includes(c)) throw new OpError(409, `La référence ou le code-barres « ${c} » est déjà utilisé par « ${o.data.name} ».`);
    if (i.category_id) await must(ctx, "category", i.category_id, "Catégorie");
    if (i.supplier_id) await must(ctx, "supplier", i.supplier_id, "Fournisseur");
    const attrs = i.variants.length ? i.variant_attrs : [];
    const seen = new Set<string>();
    for (const v of i.variants) {
      const k = attrs.map((a) => (v.values[a] ?? "").toLowerCase()).join("|");
      if (!attrs.some((a) => v.values[a])) throw new OpError(422, "Chaque variante doit avoir au moins une valeur (ex. taille M).");
      if (seen.has(k)) throw new OpError(409, `La variante « ${variantLabel(v)} » est saisie deux fois.`);
      seen.add(k);
    }
    const base = { name: i.name, description: i.description, category_id: i.category_id, buy_price: i.buy_price, sell_price: i.sell_price, unit: i.unit, min_qty: i.min_qty, sku: i.sku, barcode: i.barcode, supplier_id: i.supplier_id, active: i.active, online: i.online, photo_ids: i.photo_ids, variant_attrs: attrs, track_expiry: i.track_expiry && i.variants.length === 0 };
    const clean = (v: z.infer<typeof variantIn>, stock: number): Variant => ({ id: v.id || newId(ctx), values: Object.fromEntries(attrs.map((a) => [a, v.values[a] ?? ""])), sku: v.sku, barcode: v.barcode, price: v.price, buy_price: v.buy_price, active: v.active, stock });
    if (i.id) {
      await mutate<Product>(ctx, "product", i.id, "Produit", (p) => {
        if (p.variants.length === 0 && i.variants.length > 0 && p.stock !== 0) throw new OpError(409, `Ce produit a encore ${p.stock} ${p.unit} en stock : mettez le stock à zéro (inventaire) avant de créer des variantes.`);
        if (p.variants.length > 0 && i.variants.length === 0 && p.variants.some((v) => v.stock !== 0)) throw new OpError(409, "Des variantes ont encore du stock : mettez-le à zéro avant de les supprimer.");
        const variants = i.variants.map((v) => clean(v, p.variants.find((x) => x.id === v.id)?.stock ?? 0));
        for (const old of p.variants) if (!variants.some((v) => v.id === old.id) && (old.stock !== 0 || p.reservations.some((r) => r.variant_id === old.id))) throw new OpError(409, `La variante « ${variantLabel(old)} » a encore du stock ou une commande en cours : désactivez-la plutôt.`);
        return { ...p, ...base, variants };
      });
      return ok("Produit modifié.", { id: i.id });
    }
    const pid = newId(ctx);
    const variants = i.variants.map((v) => clean(v, 0));
    const doc = await ctx.store.insert("product", { ...base, archived: false, variants, stock: 0, lots: [], reservations: [], op_keys: [] } satisfies Product, pid);
    if (variants.length) {
      for (const [k, v] of i.variants.entries()) if (v.initial) await applyStock(ctx, { product_id: doc.id, variant_id: variants[k]!.id, delta: v.initial, type: "entree", reason: "Stock initial", op_key: `init:${doc.id}:${variants[k]!.id}`, unit_cost: variants[k]!.buy_price ?? i.buy_price });
    } else if (i.initial_stock) await applyStock(ctx, { product_id: doc.id, variant_id: null, delta: i.initial_stock, type: "entree", reason: "Stock initial", op_key: `init:${doc.id}`, unit_cost: i.buy_price, lot: i.track_expiry && i.initial_lot ? { number: i.initial_lot.number, expiry: i.initial_lot.expiry } : null });
    return ok("Produit ajouté.", { id: doc.id });
  },
  async "product.archive"(ctx, raw) {
    const i = z.object({ id, archived: z.boolean() }).parse(raw);
    await mutate<Product>(ctx, "product", i.id, "Produit", (p) => {
      if (i.archived && p.reservations.some((r) => Date.parse(r.until) > nowMs(ctx))) throw new OpError(409, "Une commande en ligne en cours réserve ce produit : traitez-la avant d'archiver.");
      return { ...p, archived: i.archived, online: i.archived ? false : p.online };
    });
    return ok(i.archived ? "Produit archivé : retiré du catalogue, historique conservé." : "Produit remis au catalogue.");
  },
  async "product.delete"(ctx, raw) {
    const i = z.object({ id }).parse(raw);
    const p = await must<Product>(ctx, "product", i.id, "Produit");
    const used = ((await ctx.store.list("move")) as Doc<Move>[]).some((m) => m.data.product_id === i.id && m.data.reason !== "Stock initial") || ((await ctx.store.list("sale")) as Doc<Sale>[]).some((s) => s.data.items.some((l) => l.product_id === i.id)) || ((await ctx.store.list("order")) as Doc<Order>[]).some((o) => o.data.items.some((l) => l.product_id === i.id));
    if (used) throw new OpError(409, `« ${p.data.name} » a déjà été vendu ou commandé : archivez-le pour garder l'historique.`);
    await ctx.store.remove("product", i.id);
    for (const ph of p.data.photo_ids) await ctx.store.remove("photo", ph);
    return ok("Produit supprimé.");
  },
  async "product.import"(ctx, raw) {
    const row = z.object({ name: req(120, "Nom"), category: txt(60), sell_price: amount, buy_price: amount.default(0), stock: qty0.default(0), unit: txt(30), sku: txt(60), barcode: txt(60), min_qty: qty0.optional(), description: txt(2000) });
    const i = z.object({ rows: z.array(z.unknown()).min(1).max(1000) }).parse(raw);
    const { s } = await settings(ctx);
    const cats = (await ctx.store.list("category")) as Doc<Category>[];
    const products = (await ctx.store.list("product")) as Doc<Product>[];
    const codes = new Set(products.flatMap((p) => [p.data.sku, p.data.barcode]).filter(Boolean));
    const names = new Set(products.map((p) => p.data.name.toLowerCase()));
    let created = 0;
    const errors: string[] = [];
    for (const [n, r] of i.rows.entries()) {
      const parsed = row.safeParse(r);
      if (!parsed.success) {
        errors.push(`Ligne ${n + 2} : ${parsed.error.issues[0]?.message ?? "invalide"}`);
        continue;
      }
      const x = parsed.data;
      if (names.has(x.name.toLowerCase()) || (x.sku && codes.has(x.sku)) || (x.barcode && codes.has(x.barcode))) {
        errors.push(`Ligne ${n + 2} : « ${x.name} » existe déjà (ignoré).`);
        continue;
      }
      let catId: string | null = null;
      if (x.category) {
        let c = cats.find((k) => k.data.name.toLowerCase() === x.category.toLowerCase());
        if (!c) {
          c = (await ctx.store.insert("category", { name: x.category, sort: cats.length } satisfies Category)) as Doc<Category>;
          cats.push(c);
        }
        catId = c.id;
      }
      const unit = x.unit && s.units.includes(x.unit) ? x.unit : s.units[0]!;
      const doc = await ctx.store.insert("product", { name: x.name, description: x.description, category_id: catId, buy_price: x.buy_price, sell_price: x.sell_price, unit, min_qty: x.min_qty ?? s.low_stock_default, sku: x.sku, barcode: x.barcode, supplier_id: null, active: true, archived: false, online: true, photo_ids: [], variant_attrs: [], variants: [], stock: 0, track_expiry: false, lots: [], reservations: [], op_keys: [] } satisfies Product);
      if (x.stock > 0) await applyStock(ctx, { product_id: doc.id, variant_id: null, delta: x.stock, type: "entree", reason: "Stock initial (import)", op_key: `init:${doc.id}`, unit_cost: x.buy_price });
      names.add(x.name.toLowerCase());
      if (x.sku) codes.add(x.sku);
      if (x.barcode) codes.add(x.barcode);
      created++;
    }
    return ok(`${created} produit(s) importé(s)${errors.length ? `, ${errors.length} ligne(s) ignorée(s)` : ""}.`, { data: { created, errors: errors.slice(0, 50) } });
  },

  // ----- Photos -----
  async "photo.add"(ctx, raw) {
    const i = z.object({ data: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Image invalide"), kind: z.enum(["product", "logo", "banner", "receipt"]) }).parse(raw);
    const d = await ctx.store.insert("photo", i);
    return ok("Image enregistrée.", { id: d.id });
  },
  async "photo.delete"(ctx, raw) {
    const i = z.object({ id }).parse(raw);
    await ctx.store.remove("photo", i.id);
    return ok("Image supprimée.");
  },

  // ----- Stock -----
  async "stock.move"(ctx, raw) {
    const i = z.object({ product_id: id, variant_id: optId, type: z.enum(["entree", "sortie", "perte", "endommage", "ajustement"]), qty: qty0, reason: txt(200), unit_cost: z.union([amount, z.null(), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? undefined : v)), lot: z.object({ number: txt(40), expiry: optDate }).nullish(), op_key: idem }).parse(raw);
    if (i.type !== "ajustement" && i.qty <= 0) throw new OpError(422, "Quantité supérieure à 0 attendue.");
    if (i.type === "ajustement" && !i.reason) throw new OpError(422, "Indiquez la raison de l'ajustement.");
    const r = await applyStock(ctx, { product_id: i.product_id, variant_id: i.variant_id, delta: i.type === "entree" ? i.qty : -i.qty, setQty: i.type === "ajustement" ? i.qty : undefined, type: i.type, reason: i.reason, op_key: i.op_key, unit_cost: i.type === "entree" ? i.unit_cost : undefined, lot: i.lot ?? null });
    if (!r.move) return ok("Mouvement déjà enregistré.", { duplicate: true });
    return ok(`Stock mis à jour : ${r.move.data.after} restant(s).`, { id: r.move.id });
  },
  async "stock.inventory"(ctx, raw) {
    const i = z.object({ counts: z.array(z.object({ product_id: id, variant_id: optId, counted: qty0 })).min(1).max(2000), note: txt(200), op_key: idem }).parse(raw);
    let changed = 0;
    for (const c of i.counts) {
      const r = await applyStock(ctx, { product_id: c.product_id, variant_id: c.variant_id, delta: 0, setQty: c.counted, type: "inventaire", reason: i.note || "Inventaire", op_key: `${i.op_key}:${c.product_id}:${c.variant_id ?? "-"}` });
      if (r.move && r.move.data.qty !== 0) changed++;
    }
    return ok(`Inventaire enregistré : ${changed} écart(s) corrigé(s).`);
  },

  // ----- Caisse -----
  async "register.open"(ctx, raw) {
    const i = z.object({ float: amount.default(0) }).parse(raw);
    const open = ((await ctx.store.list("register")) as Doc<Register>[]).find((r) => r.data.status === "ouverte" && r.data.opened_by === ctx.actor.id);
    if (open) throw new OpError(409, "Vous avez déjà une caisse ouverte : fermez-la avant d'en ouvrir une autre.");
    const d = await ctx.store.insert("register", { status: "ouverte", opened_by: ctx.actor.id, opened_at: nowIso(ctx), float: i.float, moves: [], closed_at: null, closed_by: null, counted: null, expected: null, note: "" } satisfies Register);
    return ok("Caisse ouverte.", { id: d.id });
  },
  async "register.move"(ctx, raw) {
    const i = z.object({ register_id: id, type: z.enum(["entree", "sortie"]), amount: pos, reason: req(200, "Motif") }).parse(raw);
    await mutate<Register>(ctx, "register", i.register_id, "Caisse", (r) => {
      if (r.status !== "ouverte") throw new OpError(409, "Cette caisse est fermée.");
      return { ...r, moves: [...r.moves, { id: newId(ctx), type: i.type, amount: i.amount, reason: i.reason, at: nowIso(ctx), by: ctx.actor.id }] };
    });
    return ok(i.type === "entree" ? "Entrée d'argent enregistrée." : "Sortie d'argent enregistrée.");
  },
  async "register.close"(ctx, raw) {
    const i = z.object({ register_id: id, counted: amount, note: txt(300) }).parse(raw);
    const sales = (await ctx.store.list("sale")) as Doc<Sale>[];
    let diff = 0;
    await mutate<Register>(ctx, "register", i.register_id, "Caisse", (r, doc) => {
      if (r.status !== "ouverte") throw new OpError(409, "Cette caisse est déjà fermée.");
      if (r.opened_by !== ctx.actor.id && LEVEL[ctx.actor.role] < 2) throw new OpError(403, "Seule la personne qui a ouvert la caisse, ou un responsable, peut la fermer.");
      const expected = expectedCash(doc, sales);
      diff = i.counted - expected;
      return { ...r, status: "fermee", closed_at: nowIso(ctx), closed_by: ctx.actor.id, counted: i.counted, expected, note: i.note };
    });
    return ok(diff === 0 ? "Caisse fermée : le montant compté correspond." : `Caisse fermée : écart de ${diff > 0 ? "+" : ""}${diff.toLocaleString("fr-FR")} FCFA entre le compté et le théorique.`);
  },

  // ----- Ventes -----
  async "sale.create"(ctx, raw) {
    const i = z
      .object({
        id: uuid,
        items: z.array(z.object({ product_id: id, variant_id: optId, qty, discount: amount.default(0) })).min(1, "Panier vide").max(200),
        discount: amount.default(0),
        payments: z.array(z.object({ method: payMethod, amount: pos, ref: txt(80) })).max(5).default([]),
        customer_id: optId,
        customer: z.object({ name: txt(80), phone: txt(30) }).nullish(),
        register_id: optId,
        offline_at: z.string().datetime().nullish(),
        note: txt(300),
      })
      .parse(raw);
    if (await ctx.store.get("sale", i.id)) return ok("Vente déjà enregistrée.", { id: i.id, duplicate: true });
    const { s } = await settings(ctx);
    const offline = Boolean(i.offline_at);
    const conflicts: string[] = [];
    if ((i.discount > 0 || i.items.some((l) => l.discount > 0)) && !allowed(ctx.perms, ctx.actor.role, "remises")) throw new OpError(403, "Les remises demandent l'autorisation « Remises, retours et annulations » : demandez à un responsable.");
    // Lignes au prix enregistré du produit (jamais au prix envoyé par l'appareil).
    const lines: SaleLine[] = [];
    const need = new Map<string, number>();
    for (const l of i.items) {
      const p = await must<Product>(ctx, "product", l.product_id, "Produit");
      const v = findVariant(p.data, l.variant_id);
      if (hasVariants(p.data) && !v) throw new OpError(422, `Choisissez une variante de « ${p.data.name} ».`);
      if (p.data.archived || !p.data.active || (v && !v.active)) {
        if (!offline) throw new OpError(409, `« ${p.data.name} » n'est plus disponible à la vente.`);
        conflicts.push(`« ${p.data.name} » n'était plus disponible`);
      }
      const unit_price = priceOf(p.data, l.variant_id);
      if (l.discount > l.qty * unit_price) throw new OpError(422, `Remise supérieure au prix de « ${p.data.name} ».`);
      lines.push({ product_id: p.id, variant_id: v?.id ?? null, name: v ? `${p.data.name} — ${variantLabel(v)}` : p.data.name, unit: p.data.unit, qty: l.qty, unit_price, buy_price: costOf(p.data, l.variant_id), discount: l.discount });
      const k = `${p.id}:${v?.id ?? ""}`;
      need.set(k, round2((need.get(k) ?? 0) + l.qty));
    }
    // Vérification du stock avant toute écriture (les ventes hors connexion sont enregistrées quand même, avec un conflit signalé).
    if (!offline) {
      for (const [k, q] of need) {
        const [pid, vid] = k.split(":");
        const p = (await must<Product>(ctx, "product", pid!, "Produit")).data;
        const free = availableOf(p, vid || null, nowMs(ctx));
        if (free < q) throw new OpError(409, `Stock insuffisant pour « ${p.name} » : ${Math.max(0, free)} disponible(s), ${q} demandé(s).`);
      }
    }
    const { subtotal, total } = saleTotals(lines, i.discount);
    if (i.discount > subtotal) throw new OpError(422, "La remise dépasse le montant du panier.");
    const paid = i.payments.reduce((a, p) => a + p.amount, 0);
    if (paid > total) throw new OpError(422, "Les paiements dépassent le total : pour les espèces, indiquez le montant de la vente (la monnaie est calculée à part).");
    let customerId = i.customer_id;
    if (customerId) await must(ctx, "customer", customerId, "Client");
    else if (i.customer && (i.customer.name || i.customer.phone)) customerId = (await findOrCreateCustomer(ctx, { name: i.customer.name, phone: i.customer.phone }, "caisse"))?.id ?? null;
    if (paid < total) {
      if (!s.allow_credit && !offline) throw new OpError(422, `Il manque ${(total - paid).toLocaleString("fr-FR")} FCFA. Le paiement différé n'est pas activé dans les réglages de la boutique.`);
      if (!customerId) throw new OpError(422, "Paiement partiel ou différé : indiquez le client (nom et téléphone) pour suivre ce qu'il doit.");
    }
    let registerId = i.register_id;
    if (registerId) {
      const reg = await ctx.store.get("register", registerId);
      if (!reg || (reg.data as Register).status !== "ouverte") {
        if (!offline) throw new OpError(409, "Cette caisse est fermée : ouvrez une caisse pour encaisser.");
        conflicts.push("la caisse avait été fermée entre-temps");
        registerId = null;
      }
    } else if (i.payments.some((p) => p.method === "especes") && !offline) throw new OpError(409, "Ouvrez la caisse (fond de caisse) avant d'encaisser des espèces.");
    const num = await number(ctx, "V");
    const done: { line: SaleLine; key: string }[] = [];
    try {
      for (const [n, l] of lines.entries()) {
        const key = `sale:${i.id}:${n}`;
        const r = await applyStock(ctx, { product_id: l.product_id, variant_id: l.variant_id, delta: -l.qty, type: "vente", reason: l.name, ref: num, op_key: key, allowNegative: offline });
        if (r.negative) conflicts.push(`stock insuffisant pour « ${l.name} » (stock devenu négatif)`);
        done.push({ line: l, key });
      }
    } catch (e) {
      for (const d of done) await undoStock(ctx, d.line.product_id, d.line.variant_id, -d.line.qty, d.key, num);
      throw e;
    }
    const at = nowIso(ctx);
    const customer = customerId ? ((await ctx.store.get("customer", customerId)) as Doc<Customer> | null) : null;
    const sale: Sale = {
      number: num,
      at: i.offline_at ?? at,
      channel: "caisse",
      items: lines,
      subtotal,
      discount: i.discount,
      total,
      payments: i.payments.map((p) => ({ id: newId(ctx), method: p.method, amount: p.amount, ref: p.ref, at: i.offline_at ?? at, by: ctx.actor.id, register_id: registerId, verified: false })),
      returns: [],
      status: "validee",
      customer_id: customerId,
      customer_name: customer?.data.name ?? "",
      register_id: registerId,
      by: ctx.actor.id,
      order_id: null,
      note: i.note,
      invoice_number: null,
      offline_at: i.offline_at ?? null,
      conflict: conflicts.length ? conflicts.join(" ; ") : null,
    };
    try {
      await ctx.store.insert("sale", sale, i.id);
    } catch (e) {
      if (await ctx.store.get("sale", i.id)) return ok("Vente déjà enregistrée.", { id: i.id, duplicate: true });
      throw e;
    }
    const products = (await ctx.store.list("product")) as Doc<Product>[];
    const touched = products.filter((p) => lines.some((l) => l.product_id === p.id));
    return ok(`Vente ${num} enregistrée.`, { id: i.id, number: num, effects: lowStockEffect(touched) });
  },
  async "sale.pay"(ctx, raw) {
    const i = z.object({ sale_id: id, method: payMethod, amount: pos, ref: txt(80), register_id: optId }).parse(raw);
    if (i.method === "especes") {
      const reg = i.register_id ? await ctx.store.get("register", i.register_id) : null;
      if (!reg || (reg.data as Register).status !== "ouverte") throw new OpError(409, "Ouvrez la caisse pour encaisser des espèces.");
    }
    await mutate<Sale>(ctx, "sale", i.sale_id, "Vente", (s) => {
      if (s.status !== "validee") throw new OpError(409, "Cette vente est annulée.");
      const due = dueOf(s);
      if (due <= 0) throw new OpError(409, "Cette vente est déjà entièrement payée.");
      if (i.amount > due) throw new OpError(422, `Le client ne doit que ${due.toLocaleString("fr-FR")} FCFA.`);
      return { ...s, payments: [...s.payments, { id: newId(ctx), method: i.method, amount: i.amount, ref: i.ref, at: nowIso(ctx), by: ctx.actor.id, register_id: i.register_id, verified: false } satisfies Pay] };
    });
    return ok("Paiement enregistré.");
  },
  async "sale.return"(ctx, raw) {
    const i = z.object({ sale_id: id, lines: z.array(z.object({ index: z.coerce.number().int().min(0), qty })).min(1), method: payMethod, reason: req(200, "Motif"), restock: z.boolean().default(true), register_id: optId, op_key: idem }).parse(raw);
    let rec: Sale["returns"][number] | null = null;
    let sale: Doc<Sale> | null = null;
    const { written, doc } = await mutate<Sale>(ctx, "sale", i.sale_id, "Vente", (s) => {
      if (s.returns.some((r) => r.id === i.op_key)) return null;
      if (s.status !== "validee") throw new OpError(409, "Cette vente est annulée.");
      let value = 0;
      for (const l of i.lines) {
        const line = s.items[l.index];
        if (!line || line.product_id === "__livraison") throw new OpError(422, "Article introuvable dans cette vente.");
        const left = round2(line.qty - returnedQty(s, l.index));
        if (l.qty > left) throw new OpError(422, `On ne peut retourner que ${left} « ${line.name} ».`);
        value += returnValue(s, l.index, l.qty);
      }
      // Argent rendu : seulement ce que le client avait payé au-delà de ce qu'il doit encore.
      const net = s.total - refundedOf(s);
      const paidNet = paidOf(s) - refundOutOf(s);
      const refund = Math.max(0, Math.min(value, paidNet - (net - value)));
      if (refund > 0 && i.method === "especes") {
        if (!i.register_id) throw new OpError(409, "Ouvrez la caisse pour rembourser en espèces.");
      }
      rec = { id: i.op_key, at: nowIso(ctx), by: ctx.actor.id, lines: i.lines, amount: value, refund, method: i.method, reason: i.reason, restock: i.restock, register_id: i.register_id };
      return { ...s, returns: [...s.returns, rec] };
    });
    sale = doc;
    if (!written) return ok("Retour déjà enregistré.", { duplicate: true });
    if (i.restock)
      for (const l of i.lines) {
        const line = sale.data.items[l.index]!;
        await applyStock(ctx, { product_id: line.product_id, variant_id: line.variant_id, delta: l.qty, type: "retour", reason: `Retour : ${i.reason}`, ref: sale.data.number, op_key: `ret:${i.op_key}:${l.index}` }).catch(() => undefined);
      }
    const r = rec as unknown as Sale["returns"][number];
    return ok(r.refund > 0 ? `Retour enregistré : ${r.refund.toLocaleString("fr-FR")} FCFA à rendre au client.` : "Retour enregistré : le montant dû par le client est réduit.");
  },
  async "sale.cancel"(ctx, raw) {
    const i = z.object({ sale_id: id, reason: req(200, "Motif"), register_id: optId }).parse(raw);
    const { written, doc } = await mutate<Sale>(ctx, "sale", i.sale_id, "Vente", (s) => {
      if (s.status === "annulee") return null;
      if (s.returns.length) throw new OpError(409, "Cette vente a déjà des retours : enregistrez un retour pour le reste plutôt qu'une annulation.");
      const cash = s.payments.filter((p) => p.method === "especes").reduce((a, p) => a + p.amount, 0);
      const other = paidOf(s) - cash;
      if (cash > 0 && !i.register_id) throw new OpError(409, "Ouvrez la caisse pour rendre les espèces de cette vente.");
      return { ...s, status: "annulee", cancel: { at: nowIso(ctx), by: ctx.actor.id, reason: i.reason, register_id: cash > 0 ? i.register_id : null, cash_refund: cash, other_refund: other } };
    });
    if (!written) return ok("Vente déjà annulée.", { duplicate: true });
    for (const [n, l] of doc.data.items.entries()) if (l.product_id !== "__livraison") await applyStock(ctx, { product_id: l.product_id, variant_id: l.variant_id, delta: l.qty, type: "annulation", reason: `Annulation : ${i.reason}`, ref: doc.data.number, op_key: `cancel:${i.sale_id}:${n}` }).catch(() => undefined);
    return ok("Vente annulée : stock rétabli. La vente reste visible dans l'historique.");
  },
  async "sale.invoice"(ctx, raw) {
    const i = z.object({ sale_id: id }).parse(raw);
    const cur = await must<Sale>(ctx, "sale", i.sale_id, "Vente");
    if (cur.data.invoice_number) return ok("Facture déjà créée.", { number: cur.data.invoice_number });
    const num = await number(ctx, "F");
    let final = num;
    await mutate<Sale>(ctx, "sale", i.sale_id, "Vente", (s) => {
      if (s.invoice_number) {
        final = s.invoice_number;
        return null;
      }
      return { ...s, invoice_number: num };
    });
    return ok(`Facture ${final} créée.`, { number: final });
  },

  // ----- Clients et fournisseurs -----
  async "customer.save"(ctx, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(80, "Nom"), phone: txt(30), address: txt(200), notes: txt(1000) }).parse(raw);
    const all = (await ctx.store.list("customer")) as Doc<Customer>[];
    const ph = normPhone(i.phone);
    if (ph && all.some((c) => c.id !== i.id && normPhone(c.data.phone) === ph)) throw new OpError(409, "Un client avec ce numéro existe déjà.");
    if (i.id) {
      await mutate<Customer>(ctx, "customer", i.id, "Client", (c) => ({ ...c, name: i.name, phone: i.phone, address: i.address, notes: i.notes }));
      return ok("Client modifié.", { id: i.id });
    }
    const d = await ctx.store.insert("customer", { name: i.name, phone: i.phone, address: i.address, notes: i.notes, source: "manuel" } satisfies Customer);
    return ok("Client ajouté.", { id: d.id });
  },
  async "supplier.save"(ctx, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(80, "Nom"), phone: txt(30), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""), address: txt(200), notes: txt(1000) }).parse(raw);
    const data: Supplier = { name: i.name, phone: i.phone, email: i.email, address: i.address, notes: i.notes };
    if (i.id) {
      await mutate<Supplier>(ctx, "supplier", i.id, "Fournisseur", () => data);
      return ok("Fournisseur modifié.", { id: i.id });
    }
    const d = await ctx.store.insert("supplier", data);
    return ok("Fournisseur ajouté.", { id: d.id });
  },

  // ----- Bons de commande fournisseurs -----
  async "po.save"(ctx, raw) {
    const i = z.object({ id: z.string().max(64).optional(), supplier_id: id, items: z.array(z.object({ product_id: id, variant_id: optId, qty, cost: amount })).min(1, "Ajoutez au moins un produit").max(200), expected_date: optDate, note: txt(500) }).parse(raw);
    await must(ctx, "supplier", i.supplier_id, "Fournisseur");
    const items: Po["items"] = [];
    for (const l of i.items) {
      const p = await must<Product>(ctx, "product", l.product_id, "Produit");
      const v = findVariant(p.data, l.variant_id);
      if (hasVariants(p.data) && !v) throw new OpError(422, `Choisissez une variante de « ${p.data.name} ».`);
      items.push({ product_id: p.id, variant_id: v?.id ?? null, name: v ? `${p.data.name} — ${variantLabel(v)}` : p.data.name, qty: l.qty, cost: l.cost, received: 0 });
    }
    const total = Math.round(items.reduce((a, l) => a + l.qty * l.cost, 0));
    if (i.id) {
      await mutate<Po>(ctx, "po", i.id, "Bon de commande", (po) => {
        if (po.status !== "brouillon" && po.status !== "commandee") throw new OpError(409, "Ce bon de commande n'est plus modifiable.");
        if (po.items.some((l) => l.received > 0)) throw new OpError(409, "Des marchandises ont déjà été reçues : ce bon n'est plus modifiable.");
        return { ...po, supplier_id: i.supplier_id, items, total, expected_date: i.expected_date, note: i.note };
      });
      return ok("Bon de commande modifié.", { id: i.id });
    }
    const num = await number(ctx, "BC");
    const d = await ctx.store.insert("po", { number: num, supplier_id: i.supplier_id, status: "brouillon", items, total, payments: [], expected_date: i.expected_date, note: i.note, by: ctx.actor.id, at: nowIso(ctx) } satisfies Po);
    return ok(`Bon de commande ${num} créé.`, { id: d.id, number: num });
  },
  async "po.status"(ctx, raw) {
    const i = z.object({ id, to: z.enum(["commandee", "annulee"]) }).parse(raw);
    await mutate<Po>(ctx, "po", i.id, "Bon de commande", (po) => {
      if (i.to === "commandee" && po.status !== "brouillon") throw new OpError(409, "Seul un brouillon peut être envoyé au fournisseur.");
      if (i.to === "annulee" && po.items.some((l) => l.received > 0)) throw new OpError(409, "Des marchandises ont déjà été reçues : ce bon ne peut plus être annulé.");
      if (po.status === "annulee" || po.status === "recue") throw new OpError(409, "Ce bon de commande est clôturé.");
      return { ...po, status: i.to };
    });
    return ok(i.to === "commandee" ? "Bon de commande marqué comme envoyé au fournisseur." : "Bon de commande annulé.");
  },
  async "po.receive"(ctx, raw) {
    const i = z.object({ id, lines: z.array(z.object({ index: z.coerce.number().int().min(0), qty, lot: txt(40), expiry: optDate })).min(1), op_key: idem }).parse(raw);
    const { written, doc } = await mutate<Po & { receipt_keys?: string[] }>(ctx, "po", i.id, "Bon de commande", (po) => {
      if ((po.receipt_keys ?? []).includes(i.op_key)) return null;
      if (po.status === "annulee" || po.status === "recue") throw new OpError(409, "Ce bon de commande est clôturé.");
      const items = po.items.map((l) => ({ ...l }));
      for (const r of i.lines) {
        const l = items[r.index];
        if (!l) throw new OpError(422, "Ligne introuvable.");
        const left = round2(l.qty - l.received);
        if (r.qty > left) throw new OpError(422, `Il ne reste que ${left} « ${l.name} » à recevoir.`);
        l.received = round2(l.received + r.qty);
      }
      const all = items.every((l) => l.received >= l.qty);
      return { ...po, items, status: all ? "recue" : "partielle", receipt_keys: [...(po.receipt_keys ?? []), i.op_key].slice(-100) };
    });
    if (!written) return ok("Réception déjà enregistrée.", { duplicate: true });
    for (const r of i.lines) {
      const l = doc.data.items[r.index]!;
      await applyStock(ctx, { product_id: l.product_id, variant_id: l.variant_id, delta: r.qty, type: "reception", reason: `Réception ${doc.data.number}`, ref: doc.data.number, op_key: `${i.op_key}:${r.index}`, unit_cost: l.cost, lot: r.lot || r.expiry ? { number: r.lot, expiry: r.expiry } : null });
    }
    return ok(doc.data.status === "recue" ? "Marchandises reçues : stock mis à jour, bon de commande clôturé." : "Réception partielle enregistrée : stock mis à jour.");
  },
  async "po.pay"(ctx, raw) {
    const i = z.object({ id, amount: pos }).parse(raw);
    await mutate<Po>(ctx, "po", i.id, "Bon de commande", (po) => {
      const due = poDue(po);
      if (i.amount > due) throw new OpError(422, `Il ne reste que ${due.toLocaleString("fr-FR")} FCFA à payer pour les marchandises reçues.`);
      return { ...po, payments: [...po.payments, { id: newId(ctx), amount: i.amount, at: nowIso(ctx), by: ctx.actor.id }] };
    });
    return ok("Paiement au fournisseur enregistré.");
  },

  // ----- Commandes en ligne -----
  async "order.status"(ctx, raw) {
    const i = z.object({ id, to: z.enum(Object.keys(ORDER_STATUS) as [OrderStatus, ...OrderStatus[]]), note: txt(300), register_id: optId }).parse(raw);
    const cur = await must<Order>(ctx, "order", i.id, "Commande");
    const o = cur.data;
    if (o.status === i.to) return ok("Statut déjà à jour.", { duplicate: true });
    if (!ORDER_FLOW[o.status].includes(i.to)) throw new OpError(409, `Impossible de passer de « ${ORDER_STATUS[o.status]} » à « ${ORDER_STATUS[i.to]} ».`);
    if (i.to === "remboursee" && !allowed(ctx.perms, ctx.actor.role, "remises")) throw new OpError(403, "Le remboursement demande l'autorisation « Remises, retours et annulations ».");
    if (i.to === "livraison" && o.mode !== "livraison") throw new OpError(409, "Cette commande est à retirer en boutique.");
    if (i.to === "retiree" && o.mode !== "retrait") throw new OpError(409, "Cette commande est à livrer.");
    // Refus : le client doit savoir pourquoi ; une commande ZingoPay non payée ne se confirme pas.
    if (i.to === "annulee" && (o.status === "nouvelle" || o.status === "attente") && !i.note.trim()) throw new OpError(422, "Indiquez le motif du refus : il est montré au client.");
    if (o.pay_mode === "zingopay" && o.pay_status !== "paye" && i.to !== "annulee") throw new OpError(409, "Le paiement ZingoPay de cette commande n'est pas confirmé par ZingoPay : attendez la confirmation ou refusez la commande.");
    const now = nowMs(ctx);
    const far = new Date(now + 30 * 86_400_000).toISOString();
    let saleId = o.sale_id;
    if (i.to === "confirmee") {
      // Réservation expirée (commande confirmée tard) : le stock est réservé de nouveau s'il est disponible.
      await reserve(ctx, cur.id, o.items.filter((l) => l.product_id !== "__livraison"), far);
    }
    if (i.to === "annulee") await release(ctx, cur.id, o.items);
    if (i.to === "livree" || i.to === "retiree") {
      saleId = saleId ?? newId(ctx);
      await mutate<Order>(ctx, "order", cur.id, "Commande", (x) => (x.sale_id ? null : { ...x, sale_id: saleId }));
      const fresh = await must<Order>(ctx, "order", cur.id, "Commande");
      saleId = fresh.data.sale_id!;
      if (!(await ctx.store.get("sale", saleId))) {
        const num = await number(ctx, "V");
        const lines: SaleLine[] = [];
        for (const [n, l] of o.items.entries()) {
          if (l.product_id === "__livraison") {
            lines.push({ ...l, unit: "", buy_price: 0, discount: 0 });
            continue;
          }
          const p = await must<Product>(ctx, "product", l.product_id, "Produit");
          await applyStock(ctx, { product_id: l.product_id, variant_id: l.variant_id, delta: -l.qty, type: "commande", reason: l.name, ref: o.number, op_key: `order:${cur.id}:${n}`, releaseKey: cur.id, allowNegative: true });
          lines.push({ product_id: l.product_id, variant_id: l.variant_id, name: l.name, unit: p.data.unit, qty: l.qty, unit_price: l.unit_price, buy_price: costOf(p.data, l.variant_id), discount: 0 });
        }
        // Le paiement n'entre dans la vente que s'il a été encaissé (confirmé par le commerçant ou par ZingoPay) ;
        // sinon la vente reste à encaisser (« reste dû ») jusqu'à « J'ai reçu l'argent ».
        const payments = (cur.data.payments ?? []).map((x) => ({ ...x }));
        const sale: Sale = { number: num, at: nowIso(ctx), channel: "en_ligne", items: lines, subtotal: o.total, discount: 0, total: o.total, payments, returns: [], status: "validee", customer_id: o.customer_id, customer_name: o.customer.name, register_id: payments.find((x) => x.register_id)?.register_id ?? null, by: ctx.actor.id, order_id: cur.id, note: `Commande en ligne ${o.number}`, invoice_number: null, offline_at: null, conflict: null };
        try {
          await ctx.store.insert("sale", sale, saleId);
        } catch (e) {
          if (!(await ctx.store.get("sale", saleId))) throw e;
        }
      }
    }
    if (i.to === "remboursee" && saleId) {
      const s = await ctx.store.get("sale", saleId);
      if (s && (s.data as Sale).status === "validee") await HANDLERS["sale.cancel"]!(ctx, { sale_id: saleId, reason: i.note || `Commande ${o.number} remboursée`, register_id: i.register_id });
    }
    await mutate<Order>(ctx, "order", cur.id, "Commande", (x) => ({
      ...x,
      status: i.to,
      reserved_until: i.to === "confirmee" ? far : ["annulee", "livree", "retiree", "remboursee"].includes(i.to) ? null : x.reserved_until,
      // Payée puis refusée : l'argent doit être rendu au client (à faire par le commerçant, hors du logiciel).
      pay_status: i.to === "remboursee" ? "rembourse" : i.to === "annulee" && x.pay_status === "paye" ? "a_rembourser" : x.pay_status,
      history: [...x.history, { to: i.to, at: nowIso(ctx), by: ctx.actor.id, note: i.note }],
    }));
    return ok(i.to === "annulee" ? `Commande ${o.number} refusée.` : `Commande ${o.number} : ${ORDER_STATUS[i.to].toLowerCase()}.`, { id: cur.id });
  },
  /**
   * Paiement à la livraison : l'argent n'est « encaissé » que lorsque le commerçant confirme l'avoir reçu
   * (jamais à la commande). Les espèces entrent dans la caisse ouverte de la personne qui encaisse.
   */
  async "order.collect"(ctx, raw) {
    const i = z.object({ id, method: payMethod, ref: txt(80), register_id: optId }).parse(raw);
    const cur = await must<Order>(ctx, "order", i.id, "Commande");
    const o = cur.data;
    if (o.pay_mode === "zingopay") throw new OpError(409, "Cette commande se paie par ZingoPay : elle est marquée payée uniquement après confirmation de ZingoPay.");
    if (o.pay_status === "paye") return ok("Paiement déjà encaissé.", { duplicate: true });
    if (!["confirmee", "preparation", "prete", "livraison", "livree", "retiree"].includes(o.status)) throw new OpError(409, "Confirmez d'abord la commande avant d'enregistrer le paiement reçu.");
    if (i.method === "especes") {
      const reg = i.register_id ? await ctx.store.get("register", i.register_id) : null;
      if (!reg || (reg.data as Register).status !== "ouverte") throw new OpError(409, "Ouvrez la caisse (page Caisse) pour enregistrer des espèces reçues.");
    }
    const pay: Pay = { id: newId(ctx), method: i.method, amount: o.total, ref: i.ref, at: nowIso(ctx), by: ctx.actor.id, register_id: i.method === "especes" ? i.register_id : null, verified: false };
    const { written, doc } = await mutate<Order>(ctx, "order", cur.id, "Commande", (x) => {
      if (x.pay_status === "paye") return null;
      return { ...x, payments: [...(x.payments ?? []), pay], pay_status: "paye", history: [...x.history, { to: x.status, at: pay.at, by: ctx.actor.id, note: `Paiement encaissé : ${o.total.toLocaleString("fr-FR")} FCFA (${PAY_METHODS[i.method]}), reçu confirmé par le commerçant` }] };
    });
    if (!written) return ok("Paiement déjà encaissé.", { duplicate: true });
    // Vente déjà créée (livrée avant l'encaissement) : le paiement y est ajouté.
    if (doc.data.sale_id && (await ctx.store.get("sale", doc.data.sale_id)))
      await mutate<Sale>(ctx, "sale", doc.data.sale_id, "Vente", (sl) => (sl.payments.some((x) => x.id === pay.id) ? null : { ...sl, payments: [...sl.payments, pay], register_id: sl.register_id ?? pay.register_id }));
    return ok("Paiement encaissé : la commande est marquée payée.", { id: cur.id });
  },
  /** Remboursement d'une commande payée puis refusée : effectué par le commerçant, noté ici. */
  async "order.refund_done"(ctx, raw) {
    const i = z.object({ id, note: txt(300) }).parse(raw);
    if (!allowed(ctx.perms, ctx.actor.role, "remises")) throw new OpError(403, "Le remboursement demande l'autorisation « Remises, retours et annulations ».");
    await mutate<Order>(ctx, "order", i.id, "Commande", (o) => {
      if (o.pay_status !== "a_rembourser") throw new OpError(409, "Cette commande n'est pas à rembourser.");
      return { ...o, pay_status: "rembourse", history: [...o.history, { to: o.status, at: nowIso(ctx), by: ctx.actor.id, note: `Remboursement effectué${i.note ? ` : ${i.note}` : ""}` }] };
    });
    return ok("Remboursement noté.");
  },

  // ----- Dépenses -----
  async "expense.save"(ctx, raw) {
    const i = z.object({ id: z.string().max(64).optional(), amount: pos, category: z.enum(Object.keys(EXPENSE_CATS) as [string, ...string[]]), date, description: txt(300), photo_id: optId }).parse(raw);
    const data = { amount: i.amount, category: i.category, date: i.date, description: i.description, photo_id: i.photo_id, by: ctx.actor.id } as Expense;
    if (i.id) {
      await mutate<Expense>(ctx, "expense", i.id, "Dépense", (e) => ({ ...data, by: e.by }));
      return ok("Dépense modifiée.", { id: i.id });
    }
    const d = await ctx.store.insert("expense", data);
    return ok("Dépense enregistrée.", { id: d.id });
  },
  async "expense.delete"(ctx, raw) {
    const i = z.object({ id }).parse(raw);
    const e = await must<Expense>(ctx, "expense", i.id, "Dépense");
    await ctx.store.remove("expense", i.id);
    if (e.data.photo_id) await ctx.store.remove("photo", e.data.photo_id);
    return ok("Dépense supprimée.");
  },
};

// ---------- Opérations publiques (boutique en ligne, sans compte) ----------

const PUBLIC: Record<string, (ctx: OpContext, raw: unknown) => Promise<OpResult>> = {
  async "public.order"(ctx, raw) {
    const i = z
      .object({
        id: uuid,
        items: z.array(z.object({ product_id: id, variant_id: optId, qty: z.coerce.number().int().min(1).max(999) })).min(1, "Panier vide").max(50),
        customer: z.object({ name: req(80, "Votre nom"), phone: z.string().trim().min(6, "Votre téléphone").max(30).regex(/^[+0-9 ().-]+$/, "Téléphone invalide"), address: txt(300) }),
        mode: z.enum(["livraison", "retrait"]),
        pay_mode: z.enum(["livraison", "zingopay"]),
        note: txt(300),
      })
      .parse(raw);
    const existing = (await ctx.store.get("order", i.id)) as Doc<Order> | null;
    if (existing) return ok("Commande déjà enregistrée.", { id: existing.id, number: existing.data.number, token: existing.data.tracking_token, duplicate: true });
    const { s } = await settings(ctx);
    if (!s.online.published || !s.online.ordering) throw new OpError(423, "Cette boutique ne prend pas de commandes en ligne pour le moment.");
    if (i.mode === "livraison" && !s.delivery.enabled) throw new OpError(422, "La livraison n'est pas proposée par cette boutique.");
    if (i.mode === "retrait" && !s.pickup.enabled) throw new OpError(422, "Le retrait en boutique n'est pas proposé.");
    if (i.mode === "livraison" && !i.customer.address) throw new OpError(422, "Indiquez l'adresse de livraison.");
    const payOk = (i.pay_mode === "zingopay" && s.online.zingopay && ctx.zingopay) || (i.pay_mode === "livraison" && s.online.pay_delivery);
    if (!payOk) throw new OpError(422, "Ce moyen de paiement n'est pas proposé pour ce mode de remise.");
    const lines: OrderLine[] = [];
    for (const l of i.items) {
      const p = (await ctx.store.get("product", l.product_id)) as Doc<Product> | null;
      if (!p || p.data.archived || !p.data.active || !p.data.online) throw new OpError(409, "Un produit du panier n'est plus disponible : actualisez la page.");
      const v = findVariant(p.data, l.variant_id);
      if (hasVariants(p.data) && (!v || !v.active)) throw new OpError(409, `Choisissez une variante disponible de « ${p.data.name} ».`);
      const same = lines.find((x) => x.product_id === p.id && x.variant_id === (v?.id ?? null));
      if (same) same.qty += l.qty;
      else lines.push({ product_id: p.id, variant_id: v?.id ?? null, name: v ? `${p.data.name} — ${variantLabel(v)}` : p.data.name, qty: l.qty, unit_price: priceOf(p.data, l.variant_id) });
    }
    const subtotal = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
    const fee = i.mode === "livraison" ? s.delivery.fee : 0;
    const until = new Date(nowMs(ctx) + s.reservation_minutes * 60_000).toISOString();
    await reserve(ctx, i.id, lines, until);
    const all = fee > 0 ? [...lines, { product_id: "__livraison", variant_id: null, name: "Frais de livraison", qty: 1, unit_price: fee }] : lines;
    const customer = await findOrCreateCustomer(ctx, { name: i.customer.name, phone: i.customer.phone, address: i.customer.address }, "en_ligne");
    const num = await number(ctx, "CMD");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");
    // Dans les deux cas la commande arrive « En attente de confirmation » ; aucun paiement n'est encaissé à la commande.
    const status: OrderStatus = "attente";
    const order: Order = { number: num, at: nowIso(ctx), items: all, subtotal, delivery_fee: fee, total: subtotal + fee, customer: i.customer, customer_id: customer?.id ?? null, mode: i.mode, pay_mode: i.pay_mode, pay_status: "en_attente", payments: [], status, history: [{ to: status, at: nowIso(ctx), by: null, note: "" }], tracking_token: token, reserved_until: until, sale_id: null, note: i.note };
    try {
      await ctx.store.insert("order", order, i.id);
    } catch (e) {
      await release(ctx, i.id, lines);
      const again = (await ctx.store.get("order", i.id)) as Doc<Order> | null;
      if (again) return ok("Commande déjà enregistrée.", { id: again.id, number: again.data.number, token: again.data.tracking_token, duplicate: true });
      throw e;
    }
    return ok(`Commande ${num} envoyée à la boutique.`, { id: i.id, number: num, token, effects: [{ type: "order", number: num, total: order.total, name: i.customer.name }] });
  },
};

const INTERNAL: Record<string, (ctx: OpContext, raw: unknown) => Promise<OpResult>> = {
  async "order.zp_attach"(ctx, raw) {
    const i = z.object({ order_id: id, zp: z.object({ id: z.string().max(80), pay_url: z.string().url().max(500), status: z.string().max(20), expires_at: z.string().nullish().transform((v) => v ?? null) }) }).parse(raw);
    await mutate<Order>(ctx, "order", i.order_id, "Commande", (o) => ({ ...o, zp: i.zp, zp_error: null, pay_status: o.pay_status === "non_confirme" ? "en_attente" : o.pay_status }));
    return ok("Paiement préparé.");
  },
  /** Appelé seulement après vérification du statut « paid » auprès de ZingoPay (référence et montant identiques). */
  async "order.zp_paid"(ctx, raw) {
    const i = z.object({ order_id: id, payment_id: z.string().max(80) }).parse(raw);
    const far = new Date(nowMs(ctx) + 30 * 86_400_000).toISOString();
    const { doc } = await mutate<Order>(ctx, "order", i.order_id, "Commande", (o) => {
      if (o.pay_status === "paye") return null;
      const at = nowIso(ctx);
      const pay: Pay = { id: newId(ctx), method: "zingopay", amount: o.total, ref: i.payment_id, at, by: "zingopay", register_id: null, verified: true };
      // La commande reste « En attente de confirmation » : c'est le commerçant qui la confirme.
      return { ...o, pay_status: "paye", zp_error: null, payments: [...(o.payments ?? []), pay], zp: o.zp ? { ...o.zp, status: "paid" } : o.zp, history: [...o.history, { to: o.status, at, by: null, note: "Paiement ZingoPay confirmé par ZingoPay" }] };
    });
    // Commande payée : le stock reste réservé jusqu'à la remise, même au-delà du délai habituel.
    await reserve(ctx, doc.id, doc.data.items.filter((l) => l.product_id !== "__livraison"), far).catch(() => undefined);
    return ok("Paiement confirmé.");
  },
  /** Échec, expiration ou annulation du paiement ZingoPay : la commande est conservée, paiement « non confirmé ». */
  async "order.zp_failed"(ctx, raw) {
    const i = z.object({ order_id: id, reason: z.string().max(300), status: z.string().max(20).optional() }).parse(raw);
    await mutate<Order>(ctx, "order", i.order_id, "Commande", (o) => {
      if (o.pay_status === "paye" || o.pay_status === "non_confirme") return null;
      return { ...o, pay_status: "non_confirme", zp_error: i.reason, zp: o.zp && i.status ? { ...o.zp, status: i.status } : o.zp, history: [...o.history, { to: o.status, at: nowIso(ctx), by: null, note: `Paiement ZingoPay non confirmé : ${i.reason}` }] };
    });
    return ok("Paiement marqué non confirmé.");
  },
};

export const SHOP_OPS = Object.keys(HANDLERS);
/** Réservées aux responsables, sauf poste qui a reçu explicitement la permission correspondante. */
const SENSITIVE = new Set(["settings.save", "sale.return", "sale.cancel", "expense.save", "expense.delete", "po.pay", "product.delete", "category.delete"]);
/** Permission sensible : donnée explicitement au poste, ou rôle de responsable pour un membre sans poste. */
export const allowed = (perms: Permission[] | null | undefined, role: ShopRole, p: Permission) => (perms ? perms.includes(p) : LEVEL[role] >= 2);

export async function runOp(ctx: OpContext, op: string, input: unknown): Promise<OpResult> {
  try {
    if (ctx.internal === "zingopay") {
      const h = INTERNAL[op];
      if (!h) throw new OpError(403, "Opération non autorisée.");
      return await h(ctx, input);
    }
    if (ctx.public) {
      const h = PUBLIC[op];
      if (!h) throw new OpError(403, "Opération non autorisée.");
      return await h(ctx, input);
    }
    const h = HANDLERS[op];
    if (!h) throw new OpError(400, "Opération inconnue.");
    if (LEVEL[ctx.actor.role] < 1) throw new OpError(403, "Votre rôle (lecture seule) ne permet pas de modifier la boutique.");
    const denied = opDenied(SHOP_OP_PERMS, op, ctx.perms);
    if (denied) throw new OpError(403, denied);
    // Membre sans poste : les opérations sensibles restent aux responsables (et aux postes qui les ont reçues).
    if (!ctx.perms && SENSITIVE.has(op)) needManager(ctx, "faire cette action");
    return await h(ctx, input);
  } catch (e) {
    if (e instanceof z.ZodError) throw new OpError(422, e.issues[0]?.message ?? "Données invalides.");
    throw e;
  }
}
