import "server-only";
import { HttpError, draftSpec, getAccess, publishedSpec, type ProjectRow } from "../access";
import { adminClient } from "../supabase/admin";
import { projectLocked } from "../unlock";
import type { OpContext } from "./engine";
import { ORDER_FLOW, ORDER_STATUS, PROGRESS, TRANSPORT_TYPES, settingsOf, type Courier, type Doc, type Order, type Settings } from "./model";
import { SupabaseStore } from "./supabase-store";

/**
 * Accès public (page de demande et de suivi, /livraison/:slug). Aucune session client : seules des
 * données publiques sortent d'ici (jamais les adresses complètes d'autrui, ni les téléphones, ni les
 * montants des autres commandes), et les écritures passent par les opérations « publiques » du moteur.
 */
export type PublicCompany = { project: ProjectRow; demo: boolean; store: SupabaseStore; settings: Settings };
const SLUG = /^[a-z0-9][a-z0-9-]{2,60}$/;

export async function publicCompany(slug: string, wantDemo: boolean): Promise<PublicCompany> {
  if (!SLUG.test(slug)) throw new HttpError(404, "Entreprise introuvable.");
  const { data } = await adminClient().from("projects").select("*").eq("slug", slug).maybeSingle();
  if (!data) throw new HttpError(404, "Entreprise introuvable.");
  const project = data as ProjectRow;
  let demo = false;
  if (wantDemo) {
    const access = await getAccess(project.id).catch(() => null);
    if (!access || (access.role !== "owner" && access.role !== "admin")) throw new HttpError(403, "L'aperçu est réservé au propriétaire, connecté.");
    demo = true;
  }
  if (!demo && (project.status === "suspended" || (await projectLocked(project)))) throw new HttpError(423, "Ce service est temporairement fermé.");
  const spec = demo ? (draftSpec(project) ?? publishedSpec(project)) : publishedSpec(project);
  if (!spec || spec.module !== "transport") throw new HttpError(404, "Entreprise introuvable.");
  const store = new SupabaseStore(project.id, demo, project.owner_id);
  return { project, demo, store, settings: settingsOf((await store.list("settings"))[0], spec.name || project.name) };
}
export const publicCtx = (p: PublicCompany): OpContext => ({ store: p.store, actor: { id: p.project.owner_id, role: "employee" }, public: true, members: [] });

/** Informations publiques : nom, contact, zones, types de colis, options de paiement. Aucun tarif détaillé interne n'est exposé hors multiplicateurs nécessaires au calcul serveur. */
export function publicInfo(p: PublicCompany) {
  const s = p.settings;
  return {
    name: s.name, slug: p.project.slug, type: TRANSPORT_TYPES[s.transport_type]?.label ?? "", phone: s.phone, email: s.email, address: s.address, primary: s.primary, logo: s.logo_id ? true : false,
    currency: s.currency, open: s.online.open || p.demo, zones: s.tariff.zones.map((z) => z.name), parcel_types: s.tariff.parcel_types.map((x) => x.name),
    urgency: { normal: s.hours.normal, express: s.hours.express, urgent: s.hours.urgent },
    pay: { delivery: s.online.pay_delivery, cash: s.online.pay_cash, mobile: s.online.pay_mobile, mobile_info: s.online.pay_mobile ? s.online.mobile_money_info : "" },
    priced: s.tariff.base > 0 || s.tariff.per_km > 0 || s.tariff.per_kg > 0 || s.tariff.min_price > 0 || s.tariff.zones.some((z) => z.fee > 0),
    demo: p.demo,
  };
}

export async function publicLogo(p: PublicCompany): Promise<{ type: string; bytes: Buffer } | null> {
  if (!p.settings.logo_id) return null;
  const f = await p.store.get("file", p.settings.logo_id);
  if (!f || !/^image\/(png|jpeg|webp)$/.test(String(f.data.mime))) return null;
  return { type: String(f.data.mime), bytes: Buffer.from(String(f.data.data), "base64") };
}

/** Suivi par numéro de suivi (code aléatoire non devinable) : jamais d'adresse, de téléphone ni de montant d'un tiers. */
export async function trackOrder(p: PublicCompany, tracking: string) {
  const t = tracking.trim().toUpperCase();
  if (!/^TR[A-Z2-9]{9}$/.test(t)) return null;
  const o = ((await p.store.list("order")) as Doc<Order>[]).find((x) => x.data.tracking === t);
  if (!o) return null;
  const d = o.data;
  const courier = d.courier_id && p.settings.tracking.show_courier ? (((await p.store.get("courier", d.courier_id)) as Doc<Courier> | null)?.data.name.split(" ")[0] ?? null) : null;
  return {
    company: p.settings.name, number: d.number, tracking: d.tracking, status: d.status, status_label: ORDER_STATUS[d.status], progress: PROGRESS[d.status],
    steps: ORDER_FLOW.filter((s) => s !== "attente").map((s) => ({ status: s, label: ORDER_STATUS[s], done: d.history.some((h) => h.to === s) || (s === "affecte" && Boolean(d.courier_id)) })),
    at: d.at, eta: p.settings.tracking.show_eta && !["livre", "annule", "retour"].includes(d.status) ? d.eta : null, delivered_at: d.delivered_at,
    courier, history: d.history.filter((h) => h.from !== h.to).map((h) => ({ status: h.to, label: ORDER_STATUS[h.to], at: h.at })),
    failed: d.status === "echec" ? "La livraison n'a pas abouti : l'entreprise vous contactera." : null,
    price: d.price, paid: d.payments.filter((x) => x.status === "confirme").reduce((a, x) => a + x.amount, 0), currency: p.settings.currency,
  };
}

/** Facture de la commande, téléchargeable par son client (numéro de suivi + téléphone de l'expéditeur ou du destinataire). */
export async function orderForInvoice(p: PublicCompany, tracking: string, phone: string): Promise<Doc<Order> | null> {
  const t = tracking.trim().toUpperCase();
  const last = (s: string) => s.replace(/\D/g, "").slice(-6);
  if (!/^TR[A-Z2-9]{9}$/.test(t) || last(phone).length < 6) return null;
  const o = ((await p.store.list("order")) as Doc<Order>[]).find((x) => x.data.tracking === t);
  if (!o || o.data.status === "annule") return null;
  return last(o.data.sender.phone) === last(phone) || last(o.data.recipient.phone) === last(phone) ? o : null;
}
