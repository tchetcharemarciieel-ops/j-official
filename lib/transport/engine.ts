import { z } from "zod";
import { TRANSPORT_OP_PERMS, opDenied } from "../op-perms";
import type { Permission } from "../team";
import {
  ACTIVE, COURIER_STEPS, CURRENCIES, LEVEL, ORDER_STATUS, PAY_METHODS, TERMINAL, TRANSITIONS, TRANSPORT_TYPE_IDS, TX_CATEGORIES, URGENCY, VEHICLE_KINDS, VEHICLE_STATE,
  computePrice, dueOf, haversineKm, round2, settingsOf, today,
  type Col, type Courier, type Doc, type FileDoc, type HistoryEntry, type Order, type OrderStatus, type Payment, type PayMethod, type Settings, type Transaction, type TransportRole, type Vehicle,
} from "./model";

/**
 * Moteur des opérations de MiniSoft Transport & Delivery. Chaque opération vérifie le rôle et le
 * poste, valide les données, applique les règles métier (transitions de statut, mission du livreur,
 * paiements) et n'écrit qu'à travers le `TransportStore` : mises à jour conditionnelles (`cas`),
 * numéros uniques, paiements sans doublon.
 */

export interface TransportStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  nextSeq(key: string): Promise<number>;
}
export type OpContext = { store: TransportStore; actor: { id: string; role: TransportRole }; perms?: Permission[] | null; members: string[]; now?: () => Date; uuid?: () => string; /** Appel de la page publique (demande de livraison) : seules les opérations publiques sont permises. */ public?: boolean };
export type OpResult = { message: string; id?: string; number?: string; tracking?: string; data?: unknown; /** Événement métier : sert aux notifications. */ event?: { kind: "new" | "assigned" | "pickup" | "en_route" | "delivered" | "failed" | "cancelled" | "problem"; order_id: string; courier_id?: string | null } };

export class OpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const txt = (max: number) => z.string().trim().max(max).default("");
const req = (max: number, label: string) => z.string().trim().min(1, `${label} obligatoire`).max(max);
const id = z.string().min(1).max(64);
const optId = z.string().max(64).nullish().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optDate = z.union([date, z.literal(""), z.null()]).optional().transform((v) => v || null);
const dtIso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Date et heure invalides");
const amt = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform(round2);
const pos = z.coerce.number().finite().positive("Montant supérieur à 0 attendu").max(1e12).transform(round2);
const optNum = (min: number, max: number) => z.union([z.literal(""), z.null(), z.coerce.number().finite().min(min).max(max)]).optional().transform((v) => (v === "" || v === null || v === undefined ? null : v));
const oneOf = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);
const phone = z.string().trim().min(6, "Numéro de téléphone obligatoire").max(30);
const lat = optNum(-90, 90);
const lng = optNum(-180, 180);
const place = z.object({ address: req(240, "Adresse"), lat, lng });

const nowD = (c: OpContext) => c.now?.() ?? new Date();
const nowIso = (c: OpContext) => nowD(c).toISOString();
const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, ...extra });
const isMgr = (c: OpContext) => LEVEL[c.actor.role] >= 2;
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}

async function must<T>(c: OpContext, col: Col, docId: string, label: string): Promise<Doc<T>> {
  const d = await c.store.get(col, docId);
  if (!d) throw new OpError(404, `${label} introuvable.`);
  return d as Doc<T>;
}
async function mutate<T>(c: OpContext, col: Col, docId: string, label: string, fn: (data: T, doc: Doc<T>) => T | null): Promise<{ doc: Doc<T>; written: boolean }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc = await must<T>(c, col, docId, label);
    const next = fn(structuredClone(doc.data), doc);
    if (next === null) return { doc, written: false };
    const saved = await c.store.cas(col, doc as unknown as Doc, next as object);
    if (saved) return { doc: saved as Doc<T>, written: true };
  }
  throw new OpError(409, "Cette fiche est modifiée en même temps par un autre utilisateur. Réessayez.");
}
const settings = async (c: OpContext) => {
  const doc = (await c.store.list("settings"))[0] ?? null;
  return { doc, s: settingsOf(doc ?? undefined) };
};
async function myCourier(c: OpContext): Promise<Doc<Courier> | null> {
  return ((await c.store.list("courier")) as Doc<Courier>[]).find((x) => x.data.user_id === c.actor.id) ?? null;
}
function entry(c: OpContext, from: OrderStatus | null, to: OrderStatus, note = ""): HistoryEntry {
  return { at: nowIso(c), by: c.actor.id, from, to, note: note.slice(0, 300) };
}
async function filesExist(c: OpContext, ids: string[]) {
  for (const f of ids) await must(c, "file", f, "Photo");
}
const orderLike = (o: Order) => o.status;

/** Le livreur ne touche qu'à sa propre mission ; les gestionnaires passent par `order.status`. */
async function missionFor(c: OpContext, orderId: string) {
  const me = await myCourier(c);
  if (!me) throw new OpError(403, "Votre compte n'est lié à aucun livreur : demandez à votre responsable de relier votre profil.");
  const o = await must<Order>(c, "order", orderId, "Mission");
  if (o.data.courier_id !== me.id) throw new OpError(403, "Cette mission ne vous est pas affectée.");
  return { me, o };
}

async function addPayment(c: OpContext, orderId: string, p: { pid: string; amount: number; method: PayMethod; status: Payment["status"]; ref: string; note: string; date?: string }) {
  const o = await must<Order>(c, "order", orderId, "Commande");
  if (o.data.payments.some((x) => x.id === p.pid)) return false;
  const day = p.date ?? today(nowD(c));
  let txId: string | null = null;
  if (p.status === "confirme") {
    const tx = await c.store.insert("transaction", { type: "recette", amount: p.amount, category: "livraison", date: day, description: `Livraison ${o.data.number}`, method: p.method, order_id: o.id, courier_id: o.data.courier_id, vehicle_id: null, by: c.actor.id } satisfies Transaction);
    txId = tx.id;
  }
  const payment: Payment = { id: p.pid, amount: p.amount, method: p.method, status: p.status, ref: p.ref, date: day, by: c.actor.id, note: p.note, tx_id: txId };
  try {
    const { written } = await mutate<Order>(c, "order", orderId, "Commande", (v) => {
      if (v.payments.some((x) => x.id === p.pid)) return null;
      return { ...v, payments: [...v.payments, payment] };
    });
    if (!written && txId) await c.store.remove("transaction", txId);
    return written;
  } catch (e) {
    if (txId) await c.store.remove("transaction", txId);
    throw e;
  }
}

const orderFields = z.object({
  sender: z.object({ name: req(120, "Nom de l'expéditeur"), phone }),
  recipient: z.object({ name: req(120, "Nom du destinataire"), phone }),
  pickup: place,
  dropoff: place,
  parcel: z.object({ desc: req(400, "Description du colis"), weight_kg: optNum(0, 100000), dims: txt(60), type: txt(60), photo_ids: z.array(id).max(4).default([]) }),
  zone: txt(60),
  urgency: oneOf(URGENCY).default("normal"),
  vehicle_kind: oneOf(VEHICLE_KINDS).default("moto"),
  distance_km: optNum(0, 100000),
  instructions: txt(600),
  pay_mode: oneOf(PAY_METHODS).default("livraison"),
});
type OrderIn = z.infer<typeof orderFields>;

function priced(i: OrderIn, s: Settings) {
  let km = i.distance_km;
  if (km === null && i.pickup.lat !== null && i.pickup.lng !== null && i.dropoff.lat !== null && i.dropoff.lng !== null) km = haversineKm({ lat: i.pickup.lat, lng: i.pickup.lng }, { lat: i.dropoff.lat, lng: i.dropoff.lng });
  const r = computePrice({ distance_km: km, zone: i.zone, parcel_type: i.parcel.type, weight_kg: i.parcel.weight_kg, vehicle_kind: i.vehicle_kind, urgency: i.urgency }, s.tariff, s.currency);
  return { km, ...r };
}
const zoneCheck = (i: OrderIn, s: Settings) => {
  if (i.zone && s.tariff.zones.length && !s.tariff.zones.some((z) => z.name === i.zone)) throw new OpError(422, "Zone non desservie par cette entreprise.");
};

async function newOrderNumber(c: OpContext) {
  const y = nowD(c).getFullYear();
  const n = await c.store.nextSeq(`LIV-${y}`);
  return `LIV-${y}-${String(n).padStart(4, "0")}`;
}
async function newTracking(c: OpContext) {
  const used = new Set(((await c.store.list("order")) as Doc<Order>[]).map((o) => o.data.tracking));
  for (let i = 0; i < 20; i++) {
    const t = `TR${randomCode(9)}`;
    if (!used.has(t)) return t;
  }
  throw new OpError(500, "Génération du numéro de suivi impossible, réessayez.");
}

async function buildOrder(c: OpContext, i: OrderIn, source: "interne" | "public", s: Settings, priceOverride: number | null): Promise<Order> {
  zoneCheck(i, s);
  const p = priced(i, s);
  const at = nowIso(c);
  const price = priceOverride ?? p.total;
  return {
    number: await newOrderNumber(c), tracking: await newTracking(c), status: "nouvelle",
    sender: i.sender, recipient: i.recipient, pickup: i.pickup, dropoff: i.dropoff,
    parcel: { desc: i.parcel.desc, weight_kg: i.parcel.weight_kg, dims: i.parcel.dims, type: i.parcel.type, photo_ids: i.parcel.photo_ids },
    zone: i.zone, urgency: i.urgency, vehicle_kind: i.vehicle_kind, distance_km: p.km, price, price_lines: priceOverride !== null ? [{ label: "Prix fixé par l'entreprise", amount: priceOverride }] : p.lines,
    instructions: i.instructions, courier_id: null, accepted: false,
    eta: new Date(nowD(c).getTime() + s.hours[i.urgency] * 3_600_000).toISOString(),
    pay_mode: i.pay_mode, payments: [], proof: null, fail_reason: "", problem: null,
    history: [{ at, by: c.actor.id, from: null, to: "nouvelle", note: source === "public" ? "Demande reçue depuis la page publique" : "Commande enregistrée" }],
    source, created_by: c.actor.id, at, delivered_at: null,
  };
}

const HANDLERS: Record<string, (c: OpContext, raw: unknown) => Promise<OpResult>> = {
  async "settings.save"(c, raw) {
    const i = z.object({
      name: req(80, "Nom de l'entreprise"), transport_type: z.enum(TRANSPORT_TYPE_IDS as [string, ...string[]]), address: txt(200), phone: txt(30), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""),
      logo_id: optId, logo: z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(520_000).regex(/^[A-Za-z0-9+/=]+$/, "Logo invalide") }).nullish(),
      couriers_count: z.coerce.number().int().min(0).max(100000).default(1), vehicles_count: z.coerce.number().int().min(0).max(100000).default(1),
      goods: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
      currency: z.enum(Object.keys(CURRENCIES) as [string, ...string[]]), primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
      tariff: z.object({
        base: amt, per_km: amt, per_kg: amt, free_kg: amt, min_price: amt,
        zones: z.array(z.object({ name: req(60, "Nom de la zone"), fee: amt })).max(60),
        parcel_types: z.array(z.object({ name: req(60, "Type de colis"), mult: z.coerce.number().min(0.1).max(20) })).max(30),
        vehicle_mult: z.object({ moto: z.coerce.number().min(0.1).max(20), voiture: z.coerce.number().min(0.1).max(20), camionnette: z.coerce.number().min(0.1).max(20), camion: z.coerce.number().min(0.1).max(20) }),
        urgency_mult: z.object({ normal: z.coerce.number().min(0.1).max(20), express: z.coerce.number().min(0.1).max(20), urgent: z.coerce.number().min(0.1).max(20) }),
      }),
      hours: z.object({ normal: z.coerce.number().min(0.5).max(720), express: z.coerce.number().min(0.5).max(720), urgent: z.coerce.number().min(0.5).max(720) }),
      commission_rate: z.coerce.number().min(0).max(100).default(0),
      tracking: z.object({ show_courier: z.boolean(), show_eta: z.boolean() }),
      online: z.object({ open: z.boolean(), mobile_money_info: txt(300), pay_delivery: z.boolean(), pay_cash: z.boolean(), pay_mobile: z.boolean() }),
      invoice_note: txt(300),
    }).parse(raw);
    const { logo, ...fields } = i;
    if (logo) {
      const size = Math.floor((logo.data.length * 3) / 4) - (logo.data.endsWith("==") ? 2 : logo.data.endsWith("=") ? 1 : 0);
      if (size > 380_000) throw new OpError(413, "Logo trop lourd (380 Ko maximum).");
      const f = await c.store.insert("file", { name: "logo", mime: logo.mime, size, data: logo.data } satisfies FileDoc);
      fields.logo_id = f.id;
    }
    const { doc } = await settings(c);
    if (doc) await mutate<Settings>(c, "settings", doc.id, "Réglages", (cur) => ({ ...cur, ...fields }) as unknown as Settings);
    else await c.store.insert("settings", fields);
    return ok("Configuration enregistrée.");
  },

  // ----- Photos (colis, preuves) -----
  async "photo.add"(c, raw) {
    const i = z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(520_000).regex(/^[A-Za-z0-9+/=]+$/, "Photo invalide") }).parse(raw);
    const size = Math.floor((i.data.length * 3) / 4) - (i.data.endsWith("==") ? 2 : i.data.endsWith("=") ? 1 : 0);
    if (size > 380_000) throw new OpError(413, "Photo trop lourde (380 Ko maximum) : réduisez sa taille.");
    const f = await c.store.insert("file", { name: "photo", mime: i.mime, size, data: i.data } satisfies FileDoc);
    return ok("Photo ajoutée.", { id: f.id });
  },

  // ----- Prix et commandes -----
  async "order.quote"(c, raw) {
    const i = orderFields.pick({ zone: true, urgency: true, vehicle_kind: true, distance_km: true }).extend({ parcel: z.object({ weight_kg: optNum(0, 100000), type: txt(60) }), pickup: z.object({ lat, lng }).optional(), dropoff: z.object({ lat, lng }).optional() }).parse(raw);
    const { s } = await settings(c);
    let km = i.distance_km;
    if (km === null && i.pickup?.lat != null && i.pickup.lng != null && i.dropoff?.lat != null && i.dropoff.lng != null) km = haversineKm({ lat: i.pickup.lat, lng: i.pickup.lng }, { lat: i.dropoff.lat, lng: i.dropoff.lng });
    const r = computePrice({ distance_km: km, zone: i.zone, parcel_type: i.parcel.type, weight_kg: i.parcel.weight_kg, vehicle_kind: i.vehicle_kind, urgency: i.urgency }, s.tariff, s.currency);
    return ok(r.configured ? "Prix calculé." : "Aucun tarif n'est encore défini par l'entreprise.", { data: { ...r, distance_km: km } });
  },
  async "order.save"(c, raw) {
    const i = orderFields.extend({ id: z.string().max(64).optional(), price: z.union([z.literal(""), z.null(), amt]).optional(), eta: z.union([dtIso, z.literal(""), z.null()]).optional() }).parse(raw);
    const { s } = await settings(c);
    const override = i.price === "" || i.price === null || i.price === undefined ? null : i.price;
    await filesExist(c, i.parcel.photo_ids);
    if (!i.id) {
      const o = await buildOrder(c, i, "interne", s, override);
      if (i.eta) o.eta = new Date(i.eta).toISOString();
      const d = await c.store.insert("order", o);
      return ok(`Commande ${o.number} enregistrée.`, { id: d.id, number: o.number, tracking: o.tracking, event: { kind: "new", order_id: d.id } });
    }
    zoneCheck(i, s);
    const p = priced(i, s);
    const { doc } = await mutate<Order>(c, "order", i.id, "Commande", (o) => {
      if (TERMINAL.includes(o.status)) throw new OpError(409, "Une commande terminée ou annulée ne peut plus être modifiée.");
      const price = override ?? p.total;
      return { ...o, sender: i.sender, recipient: i.recipient, pickup: i.pickup, dropoff: i.dropoff, parcel: { ...o.parcel, desc: i.parcel.desc, weight_kg: i.parcel.weight_kg, dims: i.parcel.dims, type: i.parcel.type, photo_ids: i.parcel.photo_ids }, zone: i.zone, urgency: i.urgency, vehicle_kind: i.vehicle_kind, distance_km: p.km, price, price_lines: override !== null ? [{ label: "Prix fixé par l'entreprise", amount: override }] : p.lines, instructions: i.instructions, pay_mode: i.pay_mode, eta: i.eta ? new Date(i.eta).toISOString() : o.eta };
    });
    return ok(`Commande ${doc.data.number} modifiée.`, { id: doc.id, number: doc.data.number });
  },
  /** Demande de livraison faite par un client depuis la page publique : statut « Nouvelle commande ». */
  async "order.request"(c, raw) {
    if (!c.public) throw new OpError(403, "Opération réservée à la page publique.");
    const i = orderFields.extend({ hp: z.string().max(0).optional() }).parse(raw);
    const { s } = await settings(c);
    if (!s.online.open) throw new OpError(403, "Cette entreprise n'accepte pas de demandes en ligne pour le moment.");
    const allowed: PayMethod[] = [...(s.online.pay_delivery ? (["livraison"] as PayMethod[]) : []), ...(s.online.pay_cash ? (["especes"] as PayMethod[]) : []), ...(s.online.pay_mobile ? (["mobile_money"] as PayMethod[]) : [])];
    if (!allowed.includes(i.pay_mode)) throw new OpError(422, "Ce mode de paiement n'est pas proposé par l'entreprise.");
    const o = await buildOrder(c, { ...i, distance_km: i.distance_km ?? null, parcel: { ...i.parcel, photo_ids: [] } }, "public", s, null);
    const d = await c.store.insert("order", o);
    return ok("Demande envoyée.", { id: d.id, number: o.number, tracking: o.tracking, event: { kind: "new", order_id: d.id } });
  },
  async "order.delete"(c, raw) {
    if (!isMgr(c)) throw new OpError(403, "Seul un responsable ou un administrateur peut supprimer une commande.");
    const i = z.object({ id }).parse(raw);
    const o = await must<Order>(c, "order", i.id, "Commande");
    if (!["nouvelle", "annule"].includes(o.data.status) || o.data.payments.some((p) => p.status === "confirme")) throw new OpError(409, "Seule une commande nouvelle ou annulée, sans paiement encaissé, peut être supprimée. Annulez-la sinon : elle reste dans l'historique.");
    await c.store.remove("order", i.id);
    return ok("Commande supprimée.");
  },
  async "order.assign"(c, raw) {
    const i = z.object({ id, courier_id: optId, force: z.boolean().optional() }).parse(raw);
    const doc = await must<Order>(c, "order", i.id, "Commande");
    if (!i.courier_id) {
      if (doc.data.status !== "affecte") throw new OpError(409, "Seule une commande avec livreur affecté peut être désaffectée.");
      await mutate<Order>(c, "order", i.id, "Commande", (o) => ({ ...o, courier_id: null, accepted: false, status: "attente", history: [...o.history, entry(c, o.status, "attente", "Livreur retiré")] }));
      return ok("Livreur retiré : commande en attente d'affectation.");
    }
    const cr = await must<Courier>(c, "courier", i.courier_id, "Livreur");
    if (cr.data.status !== "actif") throw new OpError(422, "Ce livreur est inactif.");
    if (!cr.data.available && !i.force) throw new OpError(409, "Ce livreur est indisponible. Confirmez pour l'affecter quand même.");
    const res = await mutate<Order>(c, "order", i.id, "Commande", (o) => {
      if (!["nouvelle", "attente", "affecte", "echec"].includes(o.status)) throw new OpError(409, `Impossible d'affecter une commande « ${ORDER_STATUS[o.status]} ».`);
      return { ...o, courier_id: cr.id, accepted: false, status: "affecte", history: [...o.history, entry(c, o.status, "affecte", `Affectée à ${cr.data.name}`)] };
    });
    return ok(`Commande affectée à ${cr.data.name}.`, { id: res.doc.id, event: { kind: "assigned", order_id: res.doc.id, courier_id: cr.id } });
  },
  /** Changement de statut par un gestionnaire : respecte les transitions autorisées et garde l'historique. */
  async "order.status"(c, raw) {
    const i = z.object({ id, status: oneOf(ORDER_STATUS), note: txt(300) }).parse(raw);
    let ev: OpResult["event"];
    const { doc } = await mutate<Order>(c, "order", i.id, "Commande", (o) => {
      if (!TRANSITIONS[o.status].includes(i.status)) throw new OpError(409, `Passage impossible : « ${ORDER_STATUS[o.status]} » → « ${ORDER_STATUS[i.status]} ».`);
      if (i.status === "affecte" && !o.courier_id) throw new OpError(422, "Choisissez d'abord un livreur (affectation).");
      if ((i.status === "echec" || i.status === "annule") && !i.note.trim()) throw new OpError(422, i.status === "echec" ? "Indiquez le motif de l'échec." : "Indiquez le motif de l'annulation.");
      if (i.status === "attente") return { ...o, status: i.status, courier_id: null, accepted: false, history: [...o.history, entry(c, o.status, i.status, i.note)] };
      const next: Order = { ...o, status: i.status, history: [...o.history, entry(c, o.status, i.status, i.note)] };
      if (i.status === "livre") next.delivered_at = nowIso(c);
      if (i.status === "echec") next.fail_reason = i.note.trim();
      ev = { kind: i.status === "recupere" ? "pickup" : i.status === "en_cours" ? "en_route" : i.status === "livre" ? "delivered" : i.status === "echec" ? "failed" : i.status === "annule" ? "cancelled" : "assigned", order_id: i.id, courier_id: o.courier_id };
      return next;
    });
    return ok(`Statut : ${ORDER_STATUS[doc.data.status]}.`, { id: doc.id, event: ev });
  },
  async "order.cancel"(c, raw) {
    const i = z.object({ id, reason: z.string().trim().min(2, "Indiquez le motif").max(300) }).parse(raw);
    const { doc } = await mutate<Order>(c, "order", i.id, "Commande", (o) => {
      if (!TRANSITIONS[o.status].includes("annule")) throw new OpError(409, "Cette commande ne peut plus être annulée.");
      if (o.payments.some((p) => p.status === "confirme") && !isMgr(c)) throw new OpError(403, "Une commande déjà encaissée ne peut être annulée que par un responsable.");
      return { ...o, status: "annule", history: [...o.history, entry(c, o.status, "annule", i.reason)] };
    });
    return ok("Commande annulée.", { id: doc.id, event: { kind: "cancelled", order_id: doc.id, courier_id: doc.data.courier_id } });
  },
  async "order.eta"(c, raw) {
    const i = z.object({ id, eta: dtIso }).parse(raw);
    await mutate<Order>(c, "order", i.id, "Commande", (o) => (TERMINAL.includes(o.status) ? o : { ...o, eta: new Date(i.eta).toISOString() }));
    return ok("Date estimée mise à jour.");
  },

  // ----- Mission du livreur -----
  async "order.accept"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const { o } = await missionFor(c, i.id);
    if (o.data.status !== "affecte") throw new OpError(409, "Cette mission n'attend pas d'acceptation.");
    if (o.data.accepted) return ok("Mission déjà acceptée.");
    await mutate<Order>(c, "order", i.id, "Mission", (v) => (v.accepted ? null : { ...v, accepted: true, history: [...v.history, entry(c, v.status, v.status, "Mission acceptée par le livreur")] }));
    return ok("Mission acceptée.");
  },
  async "order.problem"(c, raw) {
    const i = z.object({ id, note: z.string().trim().min(3, "Décrivez le problème").max(300) }).parse(raw);
    const { o } = await missionFor(c, i.id);
    if (o.data.status !== "affecte") throw new OpError(409, "Un problème avant la récupération renvoie la mission au responsable ; après la récupération, déclarez un échec.");
    await mutate<Order>(c, "order", i.id, "Mission", (v) => ({ ...v, courier_id: null, accepted: false, status: "attente", problem: { note: i.note, at: nowIso(c), by: c.actor.id }, history: [...v.history, entry(c, v.status, "attente", `Problème signalé par le livreur : ${i.note}`)] }));
    return ok("Problème signalé : la mission est renvoyée au responsable.", { event: { kind: "problem", order_id: i.id, courier_id: null } });
  },
  async "order.step"(c, raw) {
    const i = z.object({ id, status: z.enum(["recupere", "en_cours", "arrive"]), note: txt(300) }).parse(raw);
    const { o } = await missionFor(c, i.id);
    if (!(COURIER_STEPS[o.data.status] ?? []).includes(i.status)) throw new OpError(409, `Étape impossible : la mission est « ${ORDER_STATUS[o.data.status]} ».`);
    if (!o.data.accepted && o.data.status === "affecte") { /* récupérer vaut acceptation */ }
    await mutate<Order>(c, "order", i.id, "Mission", (v) => ({ ...v, accepted: true, status: i.status, history: [...v.history, entry(c, v.status, i.status, i.note)] }));
    return ok(`Mission : ${ORDER_STATUS[i.status]}.`, { event: { kind: i.status === "recupere" ? "pickup" : "en_route", order_id: i.id, courier_id: o.data.courier_id } });
  },
  async "order.deliver"(c, raw) {
    const i = z.object({ id, note: txt(300), proof_photo_id: optId, collect: z.boolean().optional() }).parse(raw);
    const { o } = await missionFor(c, i.id);
    if (!["en_cours", "arrive"].includes(o.data.status)) throw new OpError(409, "Récupérez et acheminez le colis avant de confirmer la livraison.");
    if (!i.proof_photo_id && !i.note.trim()) throw new OpError(422, "Ajoutez une photo de preuve ou un commentaire pour confirmer la livraison.");
    if (i.proof_photo_id) await filesExist(c, [i.proof_photo_id]);
    const due = dueOf(o.data);
    if (i.collect && due > 0) await addPayment(c, o.id, { pid: `collect-${o.id}`.slice(0, 64), amount: due, method: "especes", status: "confirme", ref: "", note: "Encaissé par le livreur à la livraison" });
    await mutate<Order>(c, "order", i.id, "Mission", (v) => {
      if (v.status === "livre") return null;
      return { ...v, status: "livre", delivered_at: nowIso(c), proof: { photo_id: i.proof_photo_id, note: i.note, at: nowIso(c), by: c.actor.id }, history: [...v.history, entry(c, v.status, "livre", i.note || "Livraison confirmée")] };
    });
    return ok("Livraison confirmée. Merci !", { event: { kind: "delivered", order_id: i.id, courier_id: o.data.courier_id } });
  },
  async "order.fail"(c, raw) {
    const i = z.object({ id, reason: z.string().trim().min(3, "Indiquez le motif de l'échec").max(300), proof_photo_id: optId }).parse(raw);
    const { o } = await missionFor(c, i.id);
    if (!(COURIER_STEPS[o.data.status] ?? []).includes("echec")) throw new OpError(409, "Cette mission ne peut pas être déclarée en échec à ce stade.");
    if (i.proof_photo_id) await filesExist(c, [i.proof_photo_id]);
    await mutate<Order>(c, "order", i.id, "Mission", (v) => ({ ...v, status: "echec", fail_reason: i.reason, proof: i.proof_photo_id ? { photo_id: i.proof_photo_id, note: i.reason, at: nowIso(c), by: c.actor.id } : v.proof, history: [...v.history, entry(c, v.status, "echec", i.reason)] }));
    return ok("Échec enregistré. Le responsable est prévenu.", { event: { kind: "failed", order_id: i.id, courier_id: o.data.courier_id } });
  },

  // ----- Paiements -----
  /**
   * Paiement d'une commande. Espèces et « déjà payé » sont confirmés tout de suite par le personnel.
   * Mobile et en ligne ne sont confirmés qu'avec un numéro de transaction vérifié sur le relevé du
   * fournisseur ; sinon ils restent « en attente » (aucun fournisseur n'est connecté automatiquement).
   */
  async "order.payment"(c, raw) {
    const i = z.object({ id, pid: id, amount: pos, method: oneOf(PAY_METHODS), ref: txt(80), verified: z.boolean().optional(), note: txt(200), date: date.optional() }).parse(raw);
    const o = await must<Order>(c, "order", i.id, "Commande");
    if (o.data.status === "annule") throw new OpError(409, "Cette commande est annulée.");
    if (o.data.payments.some((p) => p.id === i.pid)) return ok("Paiement déjà enregistré.");
    const needRef = i.method === "mobile_money" || i.method === "en_ligne";
    let status: Payment["status"] = "confirme";
    if (i.method === "livraison") status = "en_attente";
    else if (needRef) status = i.ref.trim() && i.verified ? "confirme" : "en_attente";
    if (status === "confirme" && i.amount > dueOf(o.data)) throw new OpError(422, `Il ne reste que ${dueOf(o.data).toLocaleString("fr-FR")} à payer sur cette commande.`);
    await addPayment(c, i.id, { pid: i.pid, amount: i.amount, method: i.method, status, ref: i.ref, note: i.note, date: i.date });
    return ok(status === "confirme" ? "Paiement confirmé et enregistré en recette." : needRef ? "Paiement noté « en attente » : il ne sera confirmé qu'avec un numéro de transaction vérifié." : "Paiement à la livraison noté « en attente ».");
  },
  /** Confirme un paiement noté « en attente » (numéro de transaction obligatoire pour mobile et en ligne). */
  async "order.payment_confirm"(c, raw) {
    const i = z.object({ id, pid: id, ref: txt(80), verified: z.boolean().optional() }).parse(raw);
    const o = await must<Order>(c, "order", i.id, "Commande");
    const p = o.data.payments.find((x) => x.id === i.pid);
    if (!p) throw new OpError(404, "Paiement introuvable.");
    if (p.status === "confirme") return ok("Paiement déjà confirmé.");
    if ((p.method === "mobile_money" || p.method === "en_ligne") && !(i.ref.trim() && i.verified)) throw new OpError(422, "Saisissez le numéro de transaction et confirmez l'avoir vérifié chez le fournisseur.");
    if (p.amount > dueOf(o.data)) throw new OpError(422, "Le montant dépasse le reste à payer.");
    const tx = await c.store.insert("transaction", { type: "recette", amount: p.amount, category: "livraison", date: today(nowD(c)), description: `Livraison ${o.data.number}`, method: p.method, order_id: o.id, courier_id: o.data.courier_id, vehicle_id: null, by: c.actor.id } satisfies Transaction);
    try {
      const { written } = await mutate<Order>(c, "order", i.id, "Commande", (v) => {
        const cur = v.payments.find((x) => x.id === i.pid);
        if (!cur || cur.status === "confirme") return null;
        return { ...v, payments: v.payments.map((x) => (x.id === i.pid ? { ...x, status: "confirme", ref: i.ref || x.ref, tx_id: tx.id, date: today(nowD(c)) } : x)) };
      });
      if (!written) await c.store.remove("transaction", tx.id);
    } catch (e) { await c.store.remove("transaction", tx.id); throw e; }
    return ok("Paiement confirmé et enregistré en recette.");
  },
  async "order.payment_cancel"(c, raw) {
    if (!isMgr(c)) throw new OpError(403, "Seul un responsable peut annuler un paiement.");
    const i = z.object({ id, pid: id, reason: z.string().trim().min(2, "Motif obligatoire").max(300) }).parse(raw);
    const o = await must<Order>(c, "order", i.id, "Commande");
    const p = o.data.payments.find((x) => x.id === i.pid);
    if (!p) throw new OpError(404, "Paiement introuvable.");
    await mutate<Order>(c, "order", i.id, "Commande", (v) => ({ ...v, payments: v.payments.filter((x) => x.id !== i.pid), history: [...v.history, entry(c, v.status, v.status, `Paiement de ${p.amount} annulé : ${i.reason}`)] }));
    if (p.tx_id) await c.store.remove("transaction", p.tx_id);
    return ok("Paiement annulé.");
  },

  // ----- Livreurs -----
  async "courier.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom"), phone: txt(30), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""), user_id: optId, zones: z.array(z.string().trim().max(60)).max(60).default([]), vehicle_id: optId, available: z.boolean().default(true), status: z.enum(["actif", "inactif"]).default("actif"), commission_rate: optNum(0, 100), notes: txt(1000) }).parse(raw);
    if (i.user_id && !c.members.includes(i.user_id)) throw new OpError(422, "Ce compte ne fait pas partie de l'équipe.");
    if (i.vehicle_id) await must(c, "vehicle", i.vehicle_id, "Véhicule");
    const all = (await c.store.list("courier")) as Doc<Courier>[];
    if (i.user_id && all.some((x) => x.data.user_id === i.user_id && x.id !== i.id)) throw new OpError(409, "Ce compte est déjà relié à un autre livreur.");
    const base = { name: i.name, phone: i.phone, email: i.email, user_id: i.user_id, zones: i.zones, vehicle_id: i.vehicle_id, available: i.available && i.status === "actif", status: i.status, commission_rate: i.commission_rate, notes: i.notes };
    if (!i.id) {
      const d = await c.store.insert("courier", { ...base, sharing: false, pos: null } satisfies Courier);
      return ok("Livreur ajouté.", { id: d.id });
    }
    await mutate<Courier>(c, "courier", i.id, "Livreur", (v) => ({ ...v, ...base }));
    return ok("Livreur modifié.", { id: i.id });
  },
  async "courier.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const orders = (await c.store.list("order")) as Doc<Order>[];
    if (orders.some((o) => o.data.courier_id === i.id)) throw new OpError(409, "Ce livreur a des missions enregistrées : passez-le « inactif » pour garder l'historique.");
    await c.store.remove("courier", i.id);
    return ok("Livreur supprimé.");
  },
  /** Disponibilité : le livreur gère la sienne ; un gestionnaire peut gérer celle de n'importe qui. */
  async "courier.availability"(c, raw) {
    const i = z.object({ id: optId, available: z.boolean() }).parse(raw);
    const me = await myCourier(c);
    const target = i.id ?? me?.id;
    if (!target) throw new OpError(403, "Votre compte n'est lié à aucun livreur.");
    if (target !== me?.id && !(c.perms === null || c.perms === undefined || c.perms.includes("livreurs"))) throw new OpError(403, "Vous ne pouvez modifier que votre propre disponibilité.");
    await mutate<Courier>(c, "courier", target, "Livreur", (v) => (v.status === "actif" ? { ...v, available: i.available } : v));
    return ok(i.available ? "Vous êtes disponible." : "Vous êtes indisponible.");
  },
  /** Position : seulement si le livreur a activé le partage ; elle remplace la précédente (aucun historique conservé). */
  async "courier.sharing"(c, raw) {
    const i = z.object({ on: z.boolean() }).parse(raw);
    const me = await myCourier(c);
    if (!me) throw new OpError(403, "Votre compte n'est lié à aucun livreur.");
    await mutate<Courier>(c, "courier", me.id, "Livreur", (v) => ({ ...v, sharing: i.on, pos: i.on ? v.pos : null }));
    return ok(i.on ? "Partage de position activé." : "Partage de position arrêté.");
  },
  async "courier.locate"(c, raw) {
    const i = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(raw);
    const me = await myCourier(c);
    if (!me) throw new OpError(403, "Votre compte n'est lié à aucun livreur.");
    if (!me.data.sharing) throw new OpError(403, "Activez d'abord le partage de votre position.");
    await mutate<Courier>(c, "courier", me.id, "Livreur", (v) => (v.sharing ? { ...v, pos: { lat: i.lat, lng: i.lng, at: nowIso(c) } } : null));
    return ok("Position envoyée.");
  },

  // ----- Véhicules -----
  async "vehicle.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), brand: req(60, "Marque"), model: txt(60), plate: req(30, "Immatriculation"), kind: oneOf(VEHICLE_KINDS), driver_id: optId, state: oneOf(VEHICLE_STATE).default("bon"), available: z.boolean().default(true), next_maintenance: optDate, notes: txt(1000) }).parse(raw);
    if (i.driver_id) await must(c, "courier", i.driver_id, "Livreur");
    const all = (await c.store.list("vehicle")) as Doc<Vehicle>[];
    if (all.some((v) => v.id !== i.id && v.data.plate.replace(/\s/g, "").toUpperCase() === i.plate.replace(/\s/g, "").toUpperCase())) throw new OpError(409, "Cette immatriculation existe déjà.");
    const base = { brand: i.brand, model: i.model, plate: i.plate.toUpperCase(), kind: i.kind, driver_id: i.driver_id, state: i.state, available: i.available && i.state !== "panne" && i.state !== "reforme", next_maintenance: i.next_maintenance, notes: i.notes };
    if (!i.id) { const d = await c.store.insert("vehicle", { ...base, maintenance: [], fuel: [] } satisfies Vehicle); return ok("Véhicule ajouté.", { id: d.id }); }
    await mutate<Vehicle>(c, "vehicle", i.id, "Véhicule", (v) => ({ ...v, ...base }));
    return ok("Véhicule modifié.", { id: i.id });
  },
  async "vehicle.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const couriers = (await c.store.list("courier")) as Doc<Courier>[];
    if (couriers.some((x) => x.data.vehicle_id === i.id)) throw new OpError(409, "Ce véhicule est attribué à un livreur : retirez l'attribution d'abord.");
    await c.store.remove("vehicle", i.id);
    return ok("Véhicule supprimé.");
  },
  /** Entretien : enregistré sur le véhicule ; le coût est aussi inscrit en dépense (une seule fois par identifiant). */
  async "vehicle.maintenance"(c, raw) {
    const i = z.object({ id, eid: id, date, kind: req(80, "Nature de l'entretien"), cost: amt, note: txt(300), next: optDate }).parse(raw);
    const v = await must<Vehicle>(c, "vehicle", i.id, "Véhicule");
    if (v.data.maintenance.some((m) => m.id === i.eid)) return ok("Entretien déjà enregistré.");
    if (i.cost > 0) await c.store.insert("transaction", { type: "depense", amount: i.cost, category: "entretien", date: i.date, description: `Entretien ${v.data.plate} : ${i.kind}`, method: "especes", order_id: null, courier_id: null, vehicle_id: i.id, by: c.actor.id } satisfies Transaction, undefined);
    await mutate<Vehicle>(c, "vehicle", i.id, "Véhicule", (x) => (x.maintenance.some((m) => m.id === i.eid) ? null : { ...x, maintenance: [...x.maintenance, { id: i.eid, date: i.date, kind: i.kind, cost: i.cost, note: i.note }], next_maintenance: i.next ?? x.next_maintenance, state: x.state === "entretien" ? "bon" : x.state }));
    return ok("Entretien enregistré.");
  },
  async "vehicle.fuel"(c, raw) {
    const i = z.object({ id, eid: id, date, liters: optNum(0, 100000), cost: pos }).parse(raw);
    const v = await must<Vehicle>(c, "vehicle", i.id, "Véhicule");
    if (v.data.fuel.some((m) => m.id === i.eid)) return ok("Plein déjà enregistré.");
    await c.store.insert("transaction", { type: "depense", amount: i.cost, category: "carburant", date: i.date, description: `Carburant ${v.data.plate}`, method: "especes", order_id: null, courier_id: null, vehicle_id: i.id, by: c.actor.id } satisfies Transaction);
    await mutate<Vehicle>(c, "vehicle", i.id, "Véhicule", (x) => (x.fuel.some((m) => m.id === i.eid) ? null : { ...x, fuel: [...x.fuel, { id: i.eid, date: i.date, liters: i.liters, cost: i.cost }] }));
    return ok("Dépense de carburant enregistrée.");
  },
  async "vehicle.entry_delete"(c, raw) {
    const i = z.object({ id, kind: z.enum(["maintenance", "fuel"]), eid: id }).parse(raw);
    await mutate<Vehicle>(c, "vehicle", i.id, "Véhicule", (x) => (i.kind === "fuel" ? { ...x, fuel: x.fuel.filter((m) => m.id !== i.eid) } : { ...x, maintenance: x.maintenance.filter((m) => m.id !== i.eid) }));
    return ok("Ligne supprimée de l'historique (la dépense en finances reste : supprimez-la aussi si besoin).");
  },

  // ----- Finances -----
  async "transaction.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), type: z.enum(["recette", "depense"]), amount: pos, category: oneOf(TX_CATEGORIES), date, description: txt(300), method: oneOf(PAY_METHODS).default("especes"), courier_id: optId, vehicle_id: optId }).parse(raw);
    if (i.courier_id) await must(c, "courier", i.courier_id, "Livreur");
    if (i.vehicle_id) await must(c, "vehicle", i.vehicle_id, "Véhicule");
    const base = { type: i.type, amount: i.amount, category: i.category, date: i.date, description: i.description, method: i.method, courier_id: i.courier_id, vehicle_id: i.vehicle_id };
    if (!i.id) { const d = await c.store.insert("transaction", { ...base, order_id: null, by: c.actor.id } satisfies Transaction); return ok("Écriture enregistrée.", { id: d.id }); }
    const cur = await must<Transaction>(c, "transaction", i.id, "Écriture");
    if (cur.data.order_id) throw new OpError(409, "Cette recette vient d'un paiement de commande : annulez le paiement dans la commande.");
    await mutate<Transaction>(c, "transaction", i.id, "Écriture", (v) => ({ ...v, ...base }));
    return ok("Écriture modifiée.", { id: i.id });
  },
  async "transaction.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const cur = await must<Transaction>(c, "transaction", i.id, "Écriture");
    if (cur.data.order_id) throw new OpError(409, "Cette recette vient d'un paiement de commande : annulez le paiement dans la commande.");
    await c.store.remove("transaction", i.id);
    return ok("Écriture supprimée.");
  },
};

export const TRANSPORT_OPS = Object.keys(HANDLERS);
/** Seules ces opérations sont ouvertes à la page publique. */
const PUBLIC_OPS = new Set(["order.quote", "order.request"]);

export async function runOp(ctx: OpContext, op: string, input: unknown): Promise<OpResult> {
  try {
    const h = HANDLERS[op];
    if (!h) throw new OpError(400, "Opération inconnue.");
    if (ctx.public) {
      if (!PUBLIC_OPS.has(op)) throw new OpError(403, "Opération non autorisée.");
    } else {
      if (LEVEL[ctx.actor.role] < 1) throw new OpError(403, "Votre rôle (lecture seule) ne permet pas de modifier les données.");
      const denied = opDenied(TRANSPORT_OP_PERMS, op === "order.payment_confirm" ? "order.payment" : op, ctx.perms);
      if (denied) throw new OpError(403, denied);
    }
    return await h(ctx, input);
  } catch (e) {
    if (e instanceof z.ZodError) throw new OpError(422, e.issues[0]?.message ?? "Données invalides.");
    throw e;
  }
}
void ACTIVE; void orderLike;
