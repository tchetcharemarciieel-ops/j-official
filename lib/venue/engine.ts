import { z } from "zod";
import {
  BOOKING_ACTIVE,
  EQUIP_CATEGORIES,
  EQUIP_CONDITIONS,
  FREQUENCIES,
  HOTEL_EXTRA_SPACES,
  ITEM_CATEGORIES,
  LEVEL,
  MENU_CATEGORIES,
  MOVE_IN,
  PAYMENT_METHODS,
  PHOTO_CATEGORIES,
  STAY_ACTIVE,
  STOCK_ZONES,
  TASK_KINDS,
  bookingsOverlap,
  coldLimits,
  defaultSettings,
  nextDue,
  nights,
  orderTotal,
  paidSums,
  round2,
  stayTotal,
  staysOverlap,
  tempOut,
  today,
  type Booking,
  type Charge,
  type Col,
  type Doc,
  type Equip,
  type Expense,
  type Guest,
  type HistoryEntry,
  type Item,
  type Lot,
  type MenuItem,
  type Move,
  type MoveType,
  type Order,
  type OrderStatus,
  type Payment,
  type Photo,
  type Room,
  type Settings,
  type Staff,
  type Stay,
  type Table,
  type Task,
  type Temp,
  type VenueKind,
  type VenueRole,
} from "./model";

/**
 * Moteur des opérations du restaurant et de l'hôtel. Chaque opération vérifie le rôle, valide
 * les données, applique les règles métier et n'écrit qu'à travers le `VenueStore` :
 * - mises à jour conditionnelles (`cas`) : deux employés simultanés ne s'écrasent jamais ;
 * - clés d'opération : une commande, un paiement ou un mouvement n'est jamais appliqué deux fois.
 */

export interface VenueStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  nextSeq(key: string): Promise<number>;
}

export type Actor = { id: string; role: VenueRole };
export type OpContext = { store: VenueStore; actor: Actor; members: string[]; kind: VenueKind; now?: () => Date; uuid?: () => string };
export type Effect = { type: "order_ready"; orderId: string; number: string; where: string } | { type: "temp_alert"; value: number; reason: string } | { type: "new_order"; orderId: string; number: string };
export type OpResult = { message: string; id?: string; effects: Effect[]; duplicate?: boolean };

export class OpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const txt = (max: number) => z.string().trim().max(max);
const req = (max: number, label: string) => z.string().trim().min(1, `${label} obligatoire`).max(max);
const id = z.string().min(1).max(64);
const optId = z.string().max(64).nullish().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optDate = z.union([date, z.literal(""), z.null()]).optional().transform((v) => v || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM)");
const money = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform((n) => Math.round(n));
const optMoney = z.union([z.literal(""), z.null(), money]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const optNum = z.union([z.literal(""), z.null(), z.coerce.number().finite().min(-1e6).max(1e6)]).optional().transform((v) => (v === "" || v === undefined || v === null ? null : round2(v)));
const qty = z.coerce.number().finite().positive("Quantité supérieure à 0 attendue").max(1e6).transform(round2);
const idem = z.string().min(8).max(80);

function need(ctx: OpContext, level: number, what = "cette action") {
  if (LEVEL[ctx.actor.role] < level) throw new OpError(403, level >= 2 ? `Seul un gérant (gestionnaire, administrateur ou propriétaire) peut effectuer ${what}.` : `Votre rôle (lecture seule) ne permet pas ${what}.`);
}
const nowIso = (ctx: OpContext) => (ctx.now?.() ?? new Date()).toISOString();
const todayOf = (ctx: OpContext) => today(ctx.now?.() ?? new Date());
const newId = (ctx: OpContext) => (ctx.uuid ?? (() => crypto.randomUUID()))();
const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, effects: [], ...extra });
const hist = (ctx: OpContext, from: string | null, to: string, note?: string): HistoryEntry => ({ from, to, at: nowIso(ctx), by: ctx.actor.id, ...(note ? { note } : {}) });

async function number(ctx: OpContext, prefix: string) {
  const y = (ctx.now?.() ?? new Date()).getFullYear();
  const n = await ctx.store.nextSeq(`${prefix}-${y}`);
  return `${prefix}-${y}-${String(n).padStart(4, "0")}`;
}

async function must<T>(ctx: OpContext, col: Col, docId: string, label: string): Promise<Doc<T>> {
  const d = await ctx.store.get(col, docId);
  if (!d) throw new OpError(404, `${label} introuvable.`);
  return d as Doc<T>;
}

/** Lecture, transformation et réécriture avec contrôle de version (recommence en cas d'accès simultané). */
async function mutate<T>(ctx: OpContext, col: Col, docId: string, label: string, fn: (data: T, doc: Doc<T>) => T | null): Promise<{ doc: Doc<T>; written: boolean }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc = await must<T>(ctx, col, docId, label);
    const next = fn(structuredClone(doc.data), doc);
    if (next === null) return { doc, written: false };
    const saved = await ctx.store.cas(col, doc as unknown as Doc, next as object);
    if (saved) return { doc: saved as Doc<T>, written: true };
  }
  throw new OpError(409, "Fiche modifiée en même temps par quelqu'un d'autre : réessayez.");
}

async function findBy<T>(ctx: OpContext, col: Col, pred: (d: T, doc: Doc<T>) => boolean): Promise<Doc<T> | undefined> {
  return ((await ctx.store.list(col)) as Doc<T>[]).find((d) => pred(d.data, d));
}

function member(ctx: OpContext, memberId: string | null, label: string) {
  if (memberId && !ctx.members.includes(memberId)) throw new OpError(422, `${label} ne fait pas partie de l'équipe du logiciel.`);
}

async function settings(ctx: OpContext): Promise<Doc<Settings>> {
  const s = (await ctx.store.list("settings"))[0] as Doc<Settings> | undefined;
  if (s) return { ...s, data: { ...defaultSettings(ctx.kind), ...s.data } };
  return { id: "", data: defaultSettings(ctx.kind), created_at: "", updated_at: "" };
}

async function saveSettings(ctx: OpContext, patch: (s: Settings) => Settings) {
  const cur = (await ctx.store.list("settings"))[0] as Doc<Settings> | undefined;
  if (!cur) return ctx.store.insert("settings", { ...patch(defaultSettings(ctx.kind)), kind: ctx.kind, updated_by: ctx.actor.id });
  return (await mutate<Settings>(ctx, "settings", cur.id, "Paramètres", (s) => ({ ...patch({ ...defaultSettings(ctx.kind), ...s }), kind: ctx.kind, updated_by: ctx.actor.id }))).doc;
}

// ---------- Stock ----------

/**
 * Applique un mouvement de stock une seule fois (clé `op_key`) ; refuse une sortie supérieure
 * à la quantité disponible. Renvoie null si le mouvement avait déjà été appliqué.
 */
async function applyMove(ctx: OpContext, m: { item_id: string; type: MoveType; delta: number; reason: string; unit_cost: number | null; order_id: string | null; op_key: string; allowNegative?: boolean; setPrice?: boolean }): Promise<Doc<Move> | null> {
  const existing = await findBy<Move>(ctx, "move", (x) => x.op_key === m.op_key);
  if (existing) return null;
  let after = 0;
  const { written, doc } = await mutate<Item>(ctx, "item", m.item_id, "Produit", (it) => {
    if (it.op_keys.includes(m.op_key)) return null;
    after = round2(it.qty + m.delta);
    if (after < 0 && !m.allowNegative) throw new OpError(409, `Stock insuffisant pour « ${it.name} » : ${it.qty} ${it.unit} disponible(s).`);
    return { ...it, qty: after, unit_price: m.setPrice && m.unit_cost !== null ? m.unit_cost : it.unit_price, op_keys: [...it.op_keys, m.op_key].slice(-200) };
  });
  if (!written) return null;
  const mv: Move = { item_id: m.item_id, type: m.type, qty: m.delta, balance_after: after, reason: m.reason, unit_cost: m.unit_cost ?? doc.data.unit_price, order_id: m.order_id, at: nowIso(ctx), by: ctx.actor.id, op_key: m.op_key };
  return (await ctx.store.insert("move", mv)) as Doc<Move>;
}

/** Déduit une seule fois les ingrédients d'une commande d'après les recettes enregistrées. */
async function deductOrder(ctx: OpContext, orderId: string): Promise<string> {
  const o = await must<Order>(ctx, "order", orderId, "Commande");
  if (o.data.stock_deducted) return o.data.stock_note;
  const menu = (await ctx.store.list("menu")) as Doc<MenuItem>[];
  const need = new Map<string, number>();
  const noRecipe: string[] = [];
  for (const l of o.data.lines) {
    const m = menu.find((x) => x.id === l.menu_id);
    if (!m || m.data.recipe.length === 0) {
      noRecipe.push(l.label);
      continue;
    }
    for (const r of m.data.recipe) need.set(r.item_id, round2((need.get(r.item_id) ?? 0) + (r.qty * l.qty) / Math.max(1, m.data.portions)));
  }
  // On marque d'abord la commande : une deuxième requête simultanée ne déduira rien.
  const { written } = await mutate<Order>(ctx, "order", orderId, "Commande", (x) => (x.stock_deducted ? null : { ...x, stock_deducted: true }));
  if (!written) return "";
  const short: string[] = [];
  for (const [itemId, q] of need) {
    try {
      await applyMove(ctx, { item_id: itemId, type: "utilisation", delta: -q, reason: `Commande ${o.data.number}`, unit_cost: null, order_id: orderId, op_key: `order:${orderId}:${itemId}`, allowNegative: true });
      const it = await ctx.store.get("item", itemId);
      if (it && Number((it.data as Item).qty) < 0) short.push((it.data as Item).name);
    } catch (e) {
      if (!(e instanceof OpError && e.status === 404)) throw e;
    }
  }
  const note = [need.size ? `${need.size} ingrédient(s) déduit(s) du stock.` : "", noRecipe.length ? `Sans recette (aucune déduction) : ${noRecipe.join(", ")}.` : "", short.length ? `Stock à vérifier (passé sous zéro) : ${short.join(", ")}.` : ""].filter(Boolean).join(" ");
  await mutate<Order>(ctx, "order", orderId, "Commande", (x) => ({ ...x, stock_note: note }));
  return note;
}

// ---------- Paiements ----------

async function refreshOrderPay(ctx: OpContext, orderId: string) {
  const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
  const { confirmed } = paidSums(pays, "order", orderId);
  await mutate<Order>(ctx, "order", orderId, "Commande", (o) => {
    if (o.pay_status === "chambre") return null;
    const pay_status = confirmed <= 0 ? "non_paye" : confirmed >= o.total ? "paye" : "partiel";
    return o.paid === confirmed && o.pay_status === pay_status ? null : { ...o, paid: confirmed, pay_status };
  });
}

type Handler = (ctx: OpContext, input: unknown) => Promise<OpResult>;

const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  en_attente: ["en_preparation", "prete", "servie", "annulee"],
  en_preparation: ["prete", "en_attente", "annulee"],
  prete: ["servie", "en_preparation"],
  servie: [],
  annulee: [],
};

const orderLineSchema = z.object({ menu_id: id, qty: z.coerce.number().int().min(1).max(500), note: txt(200).default("") });
const guestSchema = z.object({ name: req(120, "Nom du client"), phone: txt(40).default(""), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(200)]).default(""), id_type: txt(40).default(""), id_number: txt(60).default(""), nationality: txt(60).default(""), address: txt(200).default(""), notes: txt(500).default("") });

export const OPS: Record<string, Handler> = {
  // ----- Questionnaire et paramètres -----
  async "settings.save"(ctx, raw) {
    need(ctx, 2, "la configuration du plan");
    const n = optNum;
    const i = z
      .object({
        answered: z.boolean().optional(),
        terrace: z.boolean().nullable().optional(),
        has_restaurant: z.boolean().nullable().optional(),
        room_service: z.boolean().nullable().optional(),
        extra_spaces: z.array(z.enum(HOTEL_EXTRA_SPACES)).max(10).optional(),
        photos_step: z.enum(["fait", "ignore"]).nullable().optional(),
        dims: z.object({ length: n, width: n, note: txt(300).default("") }).optional(),
        cold_min: n,
        cold_max: n,
        expiry_warn_days: z.coerce.number().int().min(0).max(60).optional(),
      })
      .parse(raw);
    if (i.cold_min !== null && i.cold_max !== null && i.cold_min > i.cold_max) throw new OpError(422, "Le seuil minimum doit être inférieur au seuil maximum.");
    if (ctx.kind === "restaurant" && i.answered && i.terrace === undefined && (await settings(ctx)).data.terrace === null) throw new OpError(422, "Indiquez si votre restaurant possède une terrasse.");
    if (ctx.kind === "hotel" && i.has_restaurant === false) i.room_service = false;
    const doc = await saveSettings(ctx, (s) => ({
      ...s,
      ...(i.answered !== undefined ? { answered: i.answered } : {}),
      ...(i.terrace !== undefined && ctx.kind === "restaurant" ? { terrace: i.terrace } : {}),
      ...(i.has_restaurant !== undefined && ctx.kind === "hotel" ? { has_restaurant: i.has_restaurant } : {}),
      ...(i.room_service !== undefined && ctx.kind === "hotel" ? { room_service: i.room_service } : {}),
      ...(i.extra_spaces !== undefined && ctx.kind === "hotel" ? { extra_spaces: i.extra_spaces } : {}),
      ...(i.photos_step !== undefined ? { photos_step: i.photos_step } : {}),
      ...(i.dims ? { dims: i.dims } : {}),
      ...("cold_min" in (raw as object) ? { cold_min: i.cold_min } : {}),
      ...("cold_max" in (raw as object) ? { cold_max: i.cold_max } : {}),
      ...(i.expiry_warn_days !== undefined ? { expiry_warn_days: i.expiry_warn_days } : {}),
    }));
    return ok("Paramètres enregistrés.", { id: doc.id });
  },

  // ----- Produits et stock -----
  async "item.save"(ctx, raw) {
    need(ctx, 1, "la gestion des produits");
    const i = z
      .object({ id: optId, zone: z.enum(STOCK_ZONES), name: req(120, "Nom"), category: z.enum(ITEM_CATEGORIES), unit: req(20, "Unité"), unit_price: optMoney, min_qty: optNum, location: txt(80).default(""), temp_min: optNum, temp_max: optNum, initial_qty: z.coerce.number().finite().min(0).max(1e6).optional(), initial_cost: optMoney })
      .parse(raw);
    if (i.min_qty !== null && i.min_qty < 0) throw new OpError(422, "Le seuil minimum ne peut pas être négatif.");
    if (i.temp_min !== null && i.temp_max !== null && i.temp_min > i.temp_max) throw new OpError(422, "Température minimale supérieure à la maximale.");
    const dup = await findBy<Item>(ctx, "item", (x) => x.active && x.zone === i.zone && x.name.toLowerCase() === i.name.toLowerCase());
    if (dup && dup.id !== i.id) throw new OpError(409, `« ${i.name} » existe déjà dans cette zone.`);
    if (i.id) {
      await mutate<Item>(ctx, "item", i.id, "Produit", (it) => ({ ...it, name: i.name, category: i.category, unit: i.unit, unit_price: i.unit_price, min_qty: i.min_qty, location: i.location, temp_min: i.temp_min, temp_max: i.temp_max }));
      return ok("Produit mis à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("item", { zone: i.zone, name: i.name, category: i.category, unit: i.unit, qty: 0, unit_price: i.unit_price, min_qty: i.min_qty, location: i.location, temp_min: i.temp_min, temp_max: i.temp_max, active: true, op_keys: [] } satisfies Item);
    if (i.initial_qty) await applyMove(ctx, { item_id: d.id, type: "initial", delta: round2(i.initial_qty), reason: "Quantité comptée à la création", unit_cost: i.initial_cost ?? i.unit_price, order_id: null, op_key: `init:${d.id}` });
    return ok("Produit ajouté.", { id: d.id });
  },

  async "item.toggle"(ctx, raw) {
    need(ctx, 2, "l'archivage d'un produit");
    const i = z.object({ id, active: z.boolean() }).parse(raw);
    await mutate<Item>(ctx, "item", i.id, "Produit", (it) => (it.active === i.active ? null : { ...it, active: i.active }));
    return ok(i.active ? "Produit réactivé." : "Produit archivé (son historique est conservé).");
  },

  async "item.move"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un mouvement");
    const i = z.object({ id, type: z.enum(["achat", "livraison", "utilisation", "retrait", "perte", "vente"]), qty, reason: txt(200).default(""), unit_cost: optMoney, record_expense: z.boolean().default(false), idem }).parse(raw);
    if (i.record_expense) need(ctx, 2, "l'enregistrement d'une dépense");
    const incoming = MOVE_IN.includes(i.type);
    const m = await applyMove(ctx, { item_id: i.id, type: i.type, delta: incoming ? i.qty : -i.qty, reason: i.reason, unit_cost: incoming ? i.unit_cost : null, order_id: null, op_key: `mv:${i.idem}`, setPrice: incoming });
    if (!m) return ok("Mouvement déjà enregistré.", { duplicate: true });
    const it = await must<Item>(ctx, "item", i.id, "Produit");
    const amount = incoming && i.unit_cost !== null ? Math.round(i.unit_cost * i.qty) : i.type === "perte" && it.data.unit_price !== null ? Math.round(it.data.unit_price * i.qty) : 0;
    if (i.record_expense && amount > 0 && !(await findBy<Expense>(ctx, "expense", (e) => e.idem === `mv:${i.idem}`)))
      await ctx.store.insert("expense", { date: todayOf(ctx), category: i.type === "perte" ? "Pertes alimentaires" : it.data.category === "boisson" ? "Boissons" : it.data.category === "entretien" ? "Fournitures" : "Achats alimentaires", amount, description: `${i.type === "perte" ? "Perte" : "Achat"} : ${it.data.name} (${i.qty} ${it.data.unit})`, zone: it.data.zone, reference: i.reason, proof: null, deleted: null, idem: `mv:${i.idem}`, by: ctx.actor.id } satisfies Expense);
    return ok(`${incoming ? "Entrée" : "Sortie"} enregistrée : ${it.data.qty} ${it.data.unit} en stock.`, { id: m.id });
  },

  async "item.count"(ctx, raw) {
    need(ctx, 2, "un ajustement d'inventaire");
    const i = z.object({ id, counted: z.coerce.number().finite().min(0).max(1e6).transform(round2), reason: req(200, "Motif"), idem }).parse(raw);
    const it = await must<Item>(ctx, "item", i.id, "Produit");
    const delta = round2(i.counted - it.data.qty);
    if (delta === 0) return ok("Quantité inchangée : aucun ajustement nécessaire.");
    const m = await applyMove(ctx, { item_id: i.id, type: "ajustement", delta, reason: i.reason, unit_cost: null, order_id: null, op_key: `adj:${i.idem}`, allowNegative: false });
    return m ? ok(`Inventaire ajusté (${delta > 0 ? "+" : ""}${delta}).`) : ok("Ajustement déjà enregistré.", { duplicate: true });
  },

  async "lot.save"(ctx, raw) {
    need(ctx, 1, "l'enregistrement des dates");
    const i = z.object({ id: optId, item_id: id, qty: z.coerce.number().finite().min(0).max(1e6).transform(round2), received: date, expires: optDate, note: txt(200).default("") }).parse(raw);
    await must(ctx, "item", i.item_id, "Produit");
    if (i.expires && i.expires < i.received) throw new OpError(422, "La date limite est antérieure à la date de réception.");
    if (i.id) {
      await mutate<Lot>(ctx, "lot", i.id, "Lot", (l) => ({ ...l, item_id: i.item_id, qty: i.qty, received: i.received, expires: i.expires, note: i.note }));
      return ok("Dates mises à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("lot", { item_id: i.item_id, qty: i.qty, received: i.received, expires: i.expires, note: i.note, closed: false, by: ctx.actor.id } satisfies Lot);
    return ok("Réception et date limite enregistrées.", { id: d.id });
  },

  async "lot.close"(ctx, raw) {
    need(ctx, 1, "le suivi des dates");
    const i = z.object({ id, closed: z.boolean().default(true) }).parse(raw);
    await mutate<Lot>(ctx, "lot", i.id, "Lot", (l) => (l.closed === i.closed ? null : { ...l, closed: i.closed }));
    return ok(i.closed ? "Lot marqué comme écoulé ou retiré." : "Lot rouvert.");
  },

  // ----- Équipements, mobilier, aménagement -----
  async "equip.save"(ctx, raw) {
    need(ctx, 1, "la gestion des équipements");
    const i = z
      .object({ id: optId, zone: z.string().max(20), room_id: optId, name: req(120, "Nom"), category: z.enum(EQUIP_CATEGORIES), qty: z.coerce.number().int().min(0).max(100000), unit_price: optMoney, owned: z.boolean().default(true), condition: z.enum(EQUIP_CONDITIONS), location: txt(80).default(""), notes: txt(500).default("") })
      .parse(raw);
    if (i.room_id) await must(ctx, "room", i.room_id, "Chambre");
    const { id: eid, ...data } = i;
    if (eid) {
      await mutate<Equip>(ctx, "equip", eid, "Équipement", () => data as Equip);
      return ok("Équipement mis à jour.", { id: eid });
    }
    const d = await ctx.store.insert("equip", data);
    return ok("Équipement enregistré.", { id: d.id });
  },

  async "equip.delete"(ctx, raw) {
    need(ctx, 2, "la suppression d'un équipement");
    const i = z.object({ id }).parse(raw);
    await must(ctx, "equip", i.id, "Équipement");
    await ctx.store.remove("equip", i.id);
    return ok("Équipement supprimé.");
  },

  async "equip.report"(ctx, raw) {
    need(ctx, 1, "le signalement d'une panne");
    const i = z.object({ id, condition: z.enum(["endommage", "panne", "maintenance"]), note: txt(500).default("") }).parse(raw);
    const { doc } = await mutate<Equip>(ctx, "equip", i.id, "Équipement", (e) => ({ ...e, condition: i.condition }));
    const t: Task = { zone: doc.data.zone, kind: "reparation", title: `Réparer : ${doc.data.name}`.slice(0, 160), description: i.note, frequency: "aucune", assignee_id: null, staff_id: null, due: null, status: "a_faire", done_at: null, done_by: null, cost: null, equipment_id: i.id, room_id: doc.data.room_id, urgent: i.condition === "panne", history: [hist(ctx, null, "a_faire", "Panne signalée")], by: ctx.actor.id };
    const d = await ctx.store.insert("task", t);
    return ok("Panne signalée : une tâche de réparation a été créée.", { id: d.id });
  },

  // ----- Tables et réservations -----
  async "table.save"(ctx, raw) {
    need(ctx, 2, "la gestion des tables");
    const i = z.object({ id: optId, zone: z.enum(["salle", "terrasse", "restaurant"]), number: req(20, "Numéro"), seats: z.coerce.number().int().min(1, "Au moins une chaise").max(60), shape: z.enum(["carree", "ronde", "rectangulaire"]).default("carree"), location: txt(80).default(""), table_price: optMoney, chair_price: optMoney }).parse(raw);
    const dup = await findBy<Table>(ctx, "table", (t) => t.active && t.zone === i.zone && t.number.toLowerCase() === i.number.toLowerCase());
    if (dup && dup.id !== i.id) throw new OpError(409, `La table ${i.number} existe déjà dans cette zone.`);
    const { id: tid, ...rest } = i;
    if (tid) {
      await mutate<Table>(ctx, "table", tid, "Table", (t) => ({ ...t, ...rest }));
      return ok("Table mise à jour.", { id: tid });
    }
    const d = await ctx.store.insert("table", { ...rest, active: true } satisfies Table);
    return ok("Table ajoutée.", { id: d.id });
  },

  async "table.toggle"(ctx, raw) {
    need(ctx, 2, "le retrait d'une table");
    const i = z.object({ id, active: z.boolean() }).parse(raw);
    if (!i.active) {
      const future = await findBy<Booking>(ctx, "booking", (b) => b.table_id === i.id && BOOKING_ACTIVE.includes(b.status) && b.date >= todayOf(ctx));
      if (future) throw new OpError(409, "Cette table a des réservations à venir : annulez-les ou déplacez-les d'abord.");
    }
    await mutate<Table>(ctx, "table", i.id, "Table", (t) => (t.active === i.active ? null : { ...t, active: i.active }));
    return ok(i.active ? "Table remise en service." : "Table retirée (son historique est conservé).");
  },

  async "booking.save"(ctx, raw) {
    need(ctx, 1, "la gestion des réservations");
    const i = z.object({ id: optId, table_id: id, date, start: time, minutes: z.coerce.number().int().min(15).max(600).default(90), guests: z.coerce.number().int().min(1).max(200), name: req(120, "Nom du client"), phone: txt(40).default(""), note: txt(300).default(""), idem }).parse(raw);
    const table = await must<Table>(ctx, "table", i.table_id, "Table");
    if (!table.data.active) throw new OpError(409, "Cette table n'est plus en service.");
    if (i.guests > table.data.seats) throw new OpError(422, `La table ${table.data.number} n'a que ${table.data.seats} place(s).`);
    if (!i.id) {
      const same = await findBy<Booking>(ctx, "booking", (b) => b.idem === i.idem);
      if (same) return ok("Réservation déjà enregistrée.", { id: same.id, duplicate: true });
    }
    const clash = await findBy<Booking>(ctx, "booking", (b, d) => d.id !== i.id && b.table_id === i.table_id && BOOKING_ACTIVE.includes(b.status) && bookingsOverlap(b, i));
    if (clash) throw new OpError(409, `La table ${table.data.number} est déjà réservée le ${clash.data.date} à ${clash.data.start} (${clash.data.name}).`);
    const data = { zone: table.data.zone, table_id: i.table_id, date: i.date, start: i.start, minutes: i.minutes, guests: i.guests, name: i.name, phone: i.phone, note: i.note };
    if (i.id) {
      await mutate<Booking>(ctx, "booking", i.id, "Réservation", (b) => {
        if (!BOOKING_ACTIVE.includes(b.status)) throw new OpError(409, "Une réservation terminée ou annulée n'est plus modifiable.");
        return { ...b, ...data };
      });
      return ok("Réservation modifiée.", { id: i.id });
    }
    const d = await ctx.store.insert("booking", { ...data, status: "confirmee", idem: i.idem, by: ctx.actor.id } satisfies Booking);
    return ok(`Table ${table.data.number} réservée le ${i.date} à ${i.start}.`, { id: d.id });
  },

  async "booking.status"(ctx, raw) {
    need(ctx, 1, "le suivi des réservations");
    const i = z.object({ id, to: z.enum(["confirmee", "arrivee", "terminee", "annulee", "absente"]) }).parse(raw);
    await mutate<Booking>(ctx, "booking", i.id, "Réservation", (b) => {
      if (b.status === i.to) return null;
      if (b.status === "annulee" || b.status === "terminee") throw new OpError(409, "Cette réservation est déjà clôturée.");
      return { ...b, status: i.to };
    });
    return ok("Réservation mise à jour.");
  },

  // ----- Carte -----
  async "menu.save"(ctx, raw) {
    need(ctx, 2, "la gestion de la carte");
    const i = z.object({ id: optId, name: req(120, "Nom"), category: z.enum(MENU_CATEGORIES), price: money, kitchen: z.boolean().default(true), portions: z.coerce.number().int().min(1).max(500).default(1), recipe: z.array(z.object({ item_id: id, qty })).max(40).default([]) }).parse(raw);
    for (const r of i.recipe) await must(ctx, "item", r.item_id, "Ingrédient de la recette");
    const { id: mid, ...rest } = i;
    if (mid) {
      await mutate<MenuItem>(ctx, "menu", mid, "Article", (m) => ({ ...m, ...rest }));
      return ok("Article de la carte mis à jour.", { id: mid });
    }
    const d = await ctx.store.insert("menu", { ...rest, active: true } satisfies MenuItem);
    return ok("Article ajouté à la carte.", { id: d.id });
  },

  async "menu.toggle"(ctx, raw) {
    need(ctx, 2, "la gestion de la carte");
    const i = z.object({ id, active: z.boolean() }).parse(raw);
    await mutate<MenuItem>(ctx, "menu", i.id, "Article", (m) => (m.active === i.active ? null : { ...m, active: i.active }));
    return ok(i.active ? "Article remis à la carte." : "Article désactivé (il n'apparaît plus dans les commandes).");
  },

  // ----- Commandes -----
  async "order.create"(ctx, raw) {
    need(ctx, 1, "la prise de commande");
    const i = z.object({ source: z.enum(["caisse", "salle", "terrasse", "restaurant", "room_service"]), table_id: optId, stay_id: optId, customer: txt(120).default(""), note: txt(300).default(""), lines: z.array(orderLineSchema).min(1, "Ajoutez au moins un article").max(80), idem }).parse(raw);
    const same = await findBy<Order>(ctx, "order", (o) => o.idem === i.idem);
    if (same) return ok(`Commande ${same.data.number} déjà enregistrée.`, { id: same.id, duplicate: true });
    if (i.table_id) {
      const t = await must<Table>(ctx, "table", i.table_id, "Table");
      if (!t.data.active) throw new OpError(409, "Cette table n'est plus en service.");
    }
    if (i.source === "room_service") {
      const s = await settings(ctx);
      if (!s.data.room_service) throw new OpError(409, "Le service en chambre n'est pas activé pour cet hôtel.");
      if (!i.stay_id) throw new OpError(422, "Choisissez le séjour (chambre) à servir.");
      const stay = await must<Stay>(ctx, "stay", i.stay_id, "Séjour");
      if (stay.data.status !== "arrivee") throw new OpError(409, "Le service en chambre n'est possible que pour un client arrivé.");
    }
    const menu = (await ctx.store.list("menu")) as Doc<MenuItem>[];
    const lines = i.lines.map((l) => {
      const m = menu.find((x) => x.id === l.menu_id);
      if (!m) throw new OpError(404, "Article de la carte introuvable.");
      if (!m.data.active) throw new OpError(409, `« ${m.data.name} » n'est plus à la carte.`);
      // Prix toujours repris de la carte côté serveur.
      return { id: newId(ctx), menu_id: m.id, label: m.data.name, qty: l.qty, unit_price: m.data.price, note: l.note, kitchen: m.data.kitchen };
    });
    const o: Order = { number: await number(ctx, "CMD"), source: i.source, table_id: i.table_id, stay_id: i.source === "room_service" ? i.stay_id : null, customer: i.customer, lines, total: orderTotal(lines), note: i.note, status: "en_attente", history: [hist(ctx, null, "en_attente", "Commande enregistrée")], paid: 0, pay_status: "non_paye", stock_deducted: false, stock_note: "", ready_at: null, receipt_no: null, idem: i.idem, by: ctx.actor.id };
    const d = await ctx.store.insert("order", o);
    return { message: `Commande ${o.number} enregistrée (${o.total.toLocaleString("fr-FR")} FCFA).`, id: d.id, effects: lines.some((l) => l.kitchen) ? [{ type: "new_order", orderId: d.id, number: o.number }] : [] };
  },

  async "order.status"(ctx, raw) {
    need(ctx, 1, "le suivi des commandes");
    const i = z.object({ id, to: z.enum(["en_attente", "en_preparation", "prete", "servie"]) }).parse(raw);
    const { doc, written } = await mutate<Order>(ctx, "order", i.id, "Commande", (o) => {
      if (o.status === i.to) return null;
      if (!ORDER_FLOW[o.status].includes(i.to)) throw new OpError(409, `Passage impossible de « ${o.status} » à « ${i.to} ».`);
      return { ...o, status: i.to, ready_at: i.to === "prete" ? nowIso(ctx) : o.ready_at, history: [...o.history, hist(ctx, o.status, i.to)] };
    });
    if (!written) return ok("Statut déjà à jour.", { duplicate: true });
    let note = "";
    if (i.to === "en_preparation" || i.to === "prete" || i.to === "servie") note = await deductOrder(ctx, i.id);
    const where = doc.data.stay_id ? "service en chambre" : doc.data.table_id ? "table" : "comptoir";
    return { message: `Commande ${doc.data.number} : ${i.to === "prete" ? "prête, le service est prévenu" : i.to === "servie" ? "servie" : i.to === "en_preparation" ? "en préparation" : "remise en attente"}.${note ? ` ${note}` : ""}`, effects: i.to === "prete" ? [{ type: "order_ready", orderId: i.id, number: doc.data.number, where }] : [] };
  },

  async "order.cancel"(ctx, raw) {
    need(ctx, 1, "l'annulation d'une commande");
    const i = z.object({ id, reason: req(200, "Motif") }).parse(raw);
    const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
    const s = paidSums(pays, "order", i.id);
    if (s.confirmed + s.pending > 0) throw new OpError(409, "Cette commande a des paiements enregistrés : un gérant doit d'abord les annuler.");
    const cur = await must<Order>(ctx, "order", i.id, "Commande");
    if (cur.data.stock_deducted || cur.data.status !== "en_attente") need(ctx, 2, "l'annulation d'une commande déjà en préparation");
    await mutate<Order>(ctx, "order", i.id, "Commande", (o) => {
      if (o.status === "annulee") return null;
      if (o.pay_status === "chambre") throw new OpError(409, "Cette commande est déjà sur une note de chambre.");
      return { ...o, status: "annulee", history: [...o.history, hist(ctx, o.status, "annulee", i.reason)] };
    });
    return ok("Commande annulée. Les ingrédients éventuellement déduits ne sont pas remis automatiquement en stock : faites un ajustement si besoin.");
  },

  async "order.charge_room"(ctx, raw) {
    need(ctx, 1, "l'ajout à une note de chambre");
    const i = z.object({ id, stay_id: id }).parse(raw);
    const stay = await must<Stay>(ctx, "stay", i.stay_id, "Séjour");
    if (stay.data.status !== "arrivee") throw new OpError(409, "Seul le séjour d'un client arrivé (en cours) peut recevoir des consommations.");
    const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
    const s = paidSums(pays, "order", i.id);
    if (s.confirmed + s.pending > 0) throw new OpError(409, "Cette commande a déjà un paiement : elle ne peut pas être ajoutée à la note.");
    const { doc, written } = await mutate<Order>(ctx, "order", i.id, "Commande", (o) => {
      if (o.pay_status === "chambre") return null;
      if (o.status === "annulee") throw new OpError(409, "Commande annulée.");
      return { ...o, pay_status: "chambre", stay_id: i.stay_id, history: [...o.history, hist(ctx, o.status, o.status, `Ajoutée à la note du séjour ${stay.data.ref}`)] };
    });
    if (!written) return ok("Commande déjà ajoutée à une note de chambre.", { duplicate: true });
    await mutate<Stay>(ctx, "stay", i.stay_id, "Séjour", (st) => {
      if (st.charges.some((c) => c.order_id === i.id)) return null;
      const c: Charge = { id: newId(ctx), label: `Restaurant · ${doc.data.number}`, amount: doc.data.total, order_id: i.id, at: nowIso(ctx), by: ctx.actor.id };
      return { ...st, charges: [...st.charges, c] };
    });
    return ok(`Commande ${doc.data.number} ajoutée à la note du séjour ${stay.data.ref}.`);
  },

  async "order.invoice"(ctx, raw) {
    need(ctx, 1, "l'émission d'une facture");
    const i = z.object({ id }).parse(raw);
    const cur = await must<Order>(ctx, "order", i.id, "Commande");
    if (cur.data.receipt_no) return ok("Numéro déjà attribué.", { duplicate: true });
    const n = await number(ctx, "FAC");
    await mutate<Order>(ctx, "order", i.id, "Commande", (o) => (o.receipt_no ? null : { ...o, receipt_no: n }));
    return ok(`Facture ${n} émise.`);
  },

  // ----- Paiements -----
  async "payment.add"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un paiement");
    const i = z.object({ target: z.enum(["order", "stay"]), target_id: id, amount: money.refine((n) => n > 0, "Montant supérieur à 0 attendu"), method: z.enum(PAYMENT_METHODS), tendered: optMoney, reference: txt(120).default(""), verified: z.boolean().default(false), idem }).parse(raw);
    const same = await findBy<Payment>(ctx, "payment", (p) => p.idem === i.idem);
    if (same) return ok("Ce paiement est déjà enregistré.", { id: same.id, duplicate: true });
    const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
    const sums = paidSums(pays, i.target, i.target_id);
    let due = 0;
    if (i.target === "order") {
      const o = await must<Order>(ctx, "order", i.target_id, "Commande");
      if (o.data.status === "annulee") throw new OpError(409, "Commande annulée.");
      if (o.data.pay_status === "chambre") throw new OpError(409, "Cette commande est sur une note de chambre : encaissez le séjour.");
      due = o.data.total;
    } else {
      const s = await must<Stay>(ctx, "stay", i.target_id, "Séjour");
      if (s.data.status === "annulee" || s.data.status === "absent") throw new OpError(409, "Séjour annulé.");
      due = stayTotal(s.data);
    }
    const remaining = due - sums.confirmed - sums.pending;
    if (remaining <= 0) throw new OpError(409, sums.pending > 0 ? "Le solde est couvert par un paiement en attente de confirmation : confirmez-le ou annulez-le." : "Déjà entièrement payé : aucun nouveau paiement n'est nécessaire.");
    if (i.amount > remaining) throw new OpError(422, `Le montant dépasse le reste à payer (${remaining.toLocaleString("fr-FR")} FCFA).`);
    let change: number | null = null;
    if (i.method === "especes") {
      if (i.tendered !== null && i.tendered < i.amount) throw new OpError(422, "La somme remise est inférieure au montant encaissé.");
      change = i.tendered !== null ? i.tendered - i.amount : null;
    }
    // Espèces encaissées en main propre : confirmées ; autres moyens : confirmés seulement si l'équipe a vérifié la réception.
    const confirmed = i.method === "especes" || i.verified;
    const p: Payment = { target: i.target, target_id: i.target_id, amount: i.amount, method: i.method, tendered: i.method === "especes" ? i.tendered : null, change, reference: i.reference, status: confirmed ? "confirme" : "en_attente", receipt_no: confirmed ? await number(ctx, "REC") : null, at: nowIso(ctx), confirmed_at: confirmed ? nowIso(ctx) : null, by: ctx.actor.id, idem: i.idem };
    const d = await ctx.store.insert("payment", p);
    if (i.target === "order") await refreshOrderPay(ctx, i.target_id);
    return ok(confirmed ? `Paiement confirmé (reçu ${p.receipt_no})${change ? ` · monnaie à rendre : ${change.toLocaleString("fr-FR")} FCFA` : ""}.` : "Paiement enregistré en attente de confirmation : il ne compte pas encore dans les recettes.", { id: d.id });
  },

  async "payment.confirm"(ctx, raw) {
    need(ctx, 1, "la confirmation d'un paiement");
    const i = z.object({ id, reference: txt(120).default("") }).parse(raw);
    const n = await number(ctx, "REC");
    const { doc, written } = await mutate<Payment>(ctx, "payment", i.id, "Paiement", (p) => {
      if (p.status === "confirme") return null;
      if (p.status === "annule") throw new OpError(409, "Paiement annulé.");
      return { ...p, status: "confirme", confirmed_at: nowIso(ctx), receipt_no: n, reference: i.reference || p.reference };
    });
    if (!written) return ok("Paiement déjà confirmé.", { duplicate: true });
    if (doc.data.target === "order") await refreshOrderPay(ctx, doc.data.target_id);
    return ok(`Paiement confirmé (reçu ${n}).`);
  },

  async "payment.cancel"(ctx, raw) {
    need(ctx, 2, "l'annulation d'un paiement");
    const i = z.object({ id, reason: req(200, "Motif") }).parse(raw);
    const { doc, written } = await mutate<Payment>(ctx, "payment", i.id, "Paiement", (p) => (p.status === "annule" ? null : { ...p, status: "annule", reference: `${p.reference}${p.reference ? " · " : ""}Annulé : ${i.reason}`.slice(0, 300) }));
    if (written && doc.data.target === "order") await refreshOrderPay(ctx, doc.data.target_id);
    return ok(written ? "Paiement annulé (il reste visible dans l'historique)." : "Paiement déjà annulé.");
  },

  // ----- Chambre froide -----
  async "temp.add"(ctx, raw) {
    need(ctx, 1, "la saisie d'un relevé");
    const i = z.object({ value: z.coerce.number().finite().min(-60).max(80).transform(round2), zone: z.enum(["froid", "cuisine"]).default("froid"), equipment: txt(80).default(""), note: txt(300).default(""), at: z.string().datetime({ offset: true }).optional(), idem }).parse(raw);
    const same = await findBy<Temp & { idem?: string }>(ctx, "temp", (t) => t.idem === i.idem);
    if (same) return ok("Relevé déjà enregistré.", { duplicate: true });
    const s = await settings(ctx);
    const items = (await ctx.store.list("item")) as Doc<Item>[];
    const lim = i.zone === "froid" ? coldLimits(s.data, items) : { min: null, max: null };
    const reason = tempOut(i.value, lim);
    const at = i.at && Date.parse(i.at) <= Date.now() + 60_000 ? new Date(i.at).toISOString() : nowIso(ctx);
    const d = await ctx.store.insert("temp", { value: i.value, at, by: ctx.actor.id, source: "manuel", zone: i.zone, equipment: i.equipment, note: i.note, out: Boolean(reason), out_reason: reason, treated: false, treated_by: null, idem: i.idem });
    if (reason) return { message: `Relevé enregistré : température ${reason}. Alerte créée.`, id: d.id, effects: [{ type: "temp_alert", value: i.value, reason }] };
    return ok(lim.min === null && lim.max === null && i.zone === "froid" ? "Relevé enregistré. Définissez des seuils pour activer les alertes." : "Relevé enregistré : température conforme.", { id: d.id });
  },

  async "temp.treat"(ctx, raw) {
    need(ctx, 1, "le traitement d'une alerte");
    const i = z.object({ id, note: txt(300).default("") }).parse(raw);
    await mutate<Temp>(ctx, "temp", i.id, "Relevé", (t) => (t.treated ? null : { ...t, treated: true, treated_by: ctx.actor.id, note: i.note ? `${t.note}${t.note ? " · " : ""}Traitement : ${i.note}`.slice(0, 600) : t.note }));
    return ok("Alerte marquée comme traitée (le relevé reste dans l'historique).");
  },

  // ----- Tâches -----
  async "task.save"(ctx, raw) {
    need(ctx, 1, "la création d'une tâche");
    const i = z.object({ id: optId, zone: z.string().max(20), kind: z.enum(TASK_KINDS), title: req(160, "Titre"), description: txt(1000).default(""), frequency: z.enum(FREQUENCIES).default("aucune"), assignee_id: optId, staff_id: optId, due: optDate, equipment_id: optId, room_id: optId, urgent: z.boolean().default(false) }).parse(raw);
    member(ctx, i.assignee_id, "La personne choisie");
    if (i.assignee_id && i.assignee_id !== ctx.actor.id) need(ctx, 2, "l'attribution d'une tâche à un autre membre");
    if (i.staff_id) await must(ctx, "staff", i.staff_id, "Employé");
    if (i.room_id) await must(ctx, "room", i.room_id, "Chambre");
    if (i.frequency !== "aucune" && !i.due) i.due = todayOf(ctx);
    const { id: tid, ...rest } = i;
    if (tid) {
      await mutate<Task>(ctx, "task", tid, "Tâche", (t) => {
        if (t.by !== ctx.actor.id) need(ctx, 2, "la modification de la tâche d'un autre membre");
        return { ...t, ...rest, zone: rest.zone as Task["zone"] };
      });
      return ok("Tâche mise à jour.", { id: tid });
    }
    const t: Task = { ...rest, zone: rest.zone as Task["zone"], status: "a_faire", done_at: null, done_by: null, cost: null, history: [hist(ctx, null, "a_faire")], by: ctx.actor.id };
    const d = await ctx.store.insert("task", t);
    return ok(i.assignee_id || i.staff_id ? "Tâche créée et attribuée." : "Tâche créée.", { id: d.id });
  },

  async "task.status"(ctx, raw) {
    need(ctx, 1, "le suivi d'une tâche");
    const i = z.object({ id, to: z.enum(["a_faire", "en_cours", "fait", "annule"]), cost: optMoney, record_expense: z.boolean().default(false), note: txt(300).default("") }).parse(raw);
    if (i.to === "annule" || i.record_expense) need(ctx, 2, i.to === "annule" ? "l'annulation d'une tâche" : "l'enregistrement d'une dépense");
    const { doc, written } = await mutate<Task>(ctx, "task", i.id, "Tâche", (t) => {
      if (t.assignee_id && t.assignee_id !== ctx.actor.id && LEVEL[ctx.actor.role] < 2) throw new OpError(403, "Seule la personne chargée de la tâche ou un gérant peut changer son statut.");
      if (t.status === i.to && i.cost === null) return null;
      if (t.status === "fait" || t.status === "annule") throw new OpError(409, "Tâche déjà clôturée.");
      return { ...t, status: i.to, done_at: i.to === "fait" ? nowIso(ctx) : null, done_by: i.to === "fait" ? ctx.actor.id : null, cost: i.cost ?? t.cost, history: [...t.history, hist(ctx, t.status, i.to, i.note)] };
    });
    if (!written) return ok("Statut déjà à jour.", { duplicate: true });
    const t = doc.data;
    if (i.to === "fait") {
      if (t.equipment_id && t.kind === "reparation") await mutate<Equip>(ctx, "equip", t.equipment_id, "Équipement", (e) => (e.condition === "bon" ? null : { ...e, condition: "bon" })).catch(() => undefined);
      // Tâche répétée : l'occurrence suivante est créée une seule fois.
      if (t.frequency !== "aucune") {
        const next = nextDue(t.due ?? todayOf(ctx), t.frequency);
        const key = `next:${i.id}`;
        if (next && !(await findBy<Task>(ctx, "task", (x) => x.history.some((h) => h.note === key)))) await ctx.store.insert("task", { ...t, due: next, status: "a_faire", done_at: null, done_by: null, cost: null, history: [hist(ctx, null, "a_faire", key)], by: ctx.actor.id } satisfies Task);
      }
    }
    if (i.record_expense && i.cost && i.cost > 0 && !(await findBy<Expense>(ctx, "expense", (e) => e.idem === `task:${i.id}`)))
      await ctx.store.insert("expense", { date: todayOf(ctx), category: t.kind === "reparation" || t.kind === "entretien" ? "Entretien et réparations" : "Autre", amount: i.cost, description: t.title, zone: t.zone, reference: "", proof: null, deleted: null, idem: `task:${i.id}`, by: ctx.actor.id } satisfies Expense);
    return ok(i.to === "fait" ? (t.frequency !== "aucune" ? "Tâche terminée : la prochaine est planifiée." : "Tâche terminée.") : "Statut mis à jour.");
  },

  // ----- Dépenses -----
  async "expense.save"(ctx, raw) {
    need(ctx, 2, "l'enregistrement d'une dépense");
    const i = z.object({ id: optId, date, category: req(60, "Catégorie"), amount: money.refine((n) => n > 0, "Montant supérieur à 0 attendu"), description: req(300, "Description"), zone: z.string().max(20).default("general"), reference: txt(120).default(""), proof: z.union([z.null(), z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(450_000)]).default(null), idem }).parse(raw);
    if (i.id) {
      await mutate<Expense>(ctx, "expense", i.id, "Dépense", (e) => (e.deleted ? (() => { throw new OpError(409, "Dépense supprimée."); })() : { ...e, date: i.date, category: i.category, amount: i.amount, description: i.description, zone: i.zone as Expense["zone"], reference: i.reference, proof: i.proof ?? e.proof }));
      return ok("Dépense modifiée.", { id: i.id });
    }
    const same = await findBy<Expense>(ctx, "expense", (e) => e.idem === i.idem);
    if (same) return ok("Dépense déjà enregistrée.", { duplicate: true });
    const d = await ctx.store.insert("expense", { date: i.date, category: i.category, amount: i.amount, description: i.description, zone: i.zone as Expense["zone"], reference: i.reference, proof: i.proof, deleted: null, idem: i.idem, by: ctx.actor.id } satisfies Expense);
    return ok("Dépense enregistrée.", { id: d.id });
  },

  async "expense.delete"(ctx, raw) {
    need(ctx, 2, "la suppression d'une dépense");
    const i = z.object({ id }).parse(raw);
    await mutate<Expense>(ctx, "expense", i.id, "Dépense", (e) => (e.deleted ? null : { ...e, deleted: { at: nowIso(ctx), by: ctx.actor.id } }));
    return ok("Dépense retirée des totaux (elle reste dans l'historique).");
  },

  // ----- Personnel -----
  async "staff.save"(ctx, raw) {
    need(ctx, 2, "la gestion du personnel");
    const shift = z.object({ day: z.coerce.number().int().min(0).max(6), start: time, end: time }).refine((s) => s.start !== s.end, "Horaire vide");
    const i = z.object({ id: optId, name: req(120, "Nom"), role: req(60, "Rôle"), phone: txt(40).default(""), member_id: optId, schedule: z.array(shift).max(28).default([]), notes: txt(500).default("") }).parse(raw);
    member(ctx, i.member_id, "Le compte choisi");
    const { id: sid, ...rest } = i;
    if (sid) {
      await mutate<Staff>(ctx, "staff", sid, "Employé", (s) => ({ ...s, ...rest }));
      return ok("Fiche employé mise à jour.", { id: sid });
    }
    const d = await ctx.store.insert("staff", { ...rest, active: true } satisfies Staff);
    return ok("Employé ajouté.", { id: d.id });
  },

  async "staff.toggle"(ctx, raw) {
    need(ctx, 2, "la gestion du personnel");
    const i = z.object({ id, active: z.boolean() }).parse(raw);
    await mutate<Staff>(ctx, "staff", i.id, "Employé", (s) => (s.active === i.active ? null : { ...s, active: i.active }));
    return ok(i.active ? "Employé réactivé." : "Employé désactivé (son historique est conservé).");
  },

  // ----- Hôtel : chambres -----
  async "room.save"(ctx, raw) {
    need(ctx, 2, "la gestion des chambres");
    const i = z.object({ id: optId, number: req(20, "Numéro"), type: req(60, "Type"), capacity: z.coerce.number().int().min(1).max(20), beds: txt(120).default(""), amenities: z.array(txt(40)).max(30).default([]), price_night: optMoney, floor: txt(20).default(""), notes: txt(500).default("") }).parse(raw);
    const dup = await findBy<Room>(ctx, "room", (r) => r.number.toLowerCase() === i.number.toLowerCase());
    if (dup && dup.id !== i.id) throw new OpError(409, `La chambre ${i.number} existe déjà.`);
    const { id: rid, ...rest } = i;
    const amenities = rest.amenities.filter(Boolean);
    if (rid) {
      await mutate<Room>(ctx, "room", rid, "Chambre", (r) => ({ ...r, ...rest, amenities }));
      return ok("Chambre mise à jour.", { id: rid });
    }
    const d = await ctx.store.insert("room", { ...rest, amenities, housekeeping: "propre", maintenance: false } satisfies Room);
    return ok(`Chambre ${i.number} ajoutée.`, { id: d.id });
  },

  async "room.state"(ctx, raw) {
    need(ctx, 1, "le changement d'état d'une chambre");
    const i = z.object({ id, to: z.enum(["propre", "a_nettoyer", "maintenance_on", "maintenance_off"]), note: txt(300).default("") }).parse(raw);
    if (i.to.startsWith("maintenance")) need(ctx, 2, "la mise en maintenance d'une chambre");
    if (i.to === "maintenance_on") {
      const stays = (await ctx.store.list("stay")) as Doc<Stay>[];
      if (stays.some((s) => s.data.room_id === i.id && s.data.status === "arrivee")) throw new OpError(409, "Un client occupe cette chambre : faites d'abord son départ ou changez-le de chambre.");
    }
    await mutate<Room>(ctx, "room", i.id, "Chambre", (r) => {
      if (i.to === "maintenance_on") return r.maintenance ? null : { ...r, maintenance: true };
      if (i.to === "maintenance_off") return r.maintenance ? { ...r, maintenance: false } : null;
      return r.housekeeping === i.to ? null : { ...r, housekeeping: i.to };
    });
    return ok(i.to === "maintenance_on" ? "Chambre en maintenance : elle n'est plus proposée à la réservation." : i.to === "maintenance_off" ? "Maintenance terminée." : i.to === "propre" ? "Chambre propre et disponible." : "Chambre marquée à nettoyer.");
  },

  async "room.clean"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un nettoyage");
    const i = z.object({ id, staff_id: optId, date: optDate, issue: txt(500).default(""), idem }).parse(raw);
    const room = await must<Room>(ctx, "room", i.id, "Chambre");
    if (i.staff_id) await must(ctx, "staff", i.staff_id, "Employé");
    if (await findBy<Task>(ctx, "task", (t) => t.history.some((h) => h.note === `clean:${i.idem}`))) return ok("Nettoyage déjà enregistré.", { duplicate: true });
    await ctx.store.insert("task", { zone: "chambre", kind: "nettoyage", title: `Nettoyage chambre ${room.data.number}`, description: "", frequency: "aucune", assignee_id: null, staff_id: i.staff_id, due: i.date ?? todayOf(ctx), status: "fait", done_at: i.date ? `${i.date}T12:00:00.000Z` : nowIso(ctx), done_by: ctx.actor.id, cost: null, equipment_id: null, room_id: i.id, urgent: false, history: [hist(ctx, null, "fait", `clean:${i.idem}`)], by: ctx.actor.id } satisfies Task);
    await mutate<Room>(ctx, "room", i.id, "Chambre", (r) => (r.housekeeping === "propre" ? null : { ...r, housekeeping: "propre" }));
    if (i.issue) await ctx.store.insert("task", { zone: "chambre", kind: "signalement", title: `Chambre ${room.data.number} : problème signalé`, description: i.issue, frequency: "aucune", assignee_id: null, staff_id: null, due: null, status: "a_faire", done_at: null, done_by: null, cost: null, equipment_id: null, room_id: i.id, urgent: false, history: [hist(ctx, null, "a_faire", "Signalé lors du nettoyage")], by: ctx.actor.id } satisfies Task);
    return ok(i.issue ? "Nettoyage enregistré et problème signalé au bureau." : "Nettoyage enregistré : chambre propre.");
  },

  // ----- Hôtel : clients et séjours -----
  async "guest.save"(ctx, raw) {
    need(ctx, 1, "la gestion des clients");
    const i = guestSchema.extend({ id: optId }).parse(raw);
    const { id: gid, ...rest } = i;
    if (gid) {
      await mutate<Guest>(ctx, "guest", gid, "Client", () => rest);
      return ok("Fiche client mise à jour.", { id: gid });
    }
    const d = await ctx.store.insert("guest", rest satisfies Guest);
    return ok("Client enregistré.", { id: d.id });
  },

  async "stay.save"(ctx, raw) {
    need(ctx, 1, "la gestion des réservations");
    const i = z.object({ id: optId, room_id: id, guest_id: optId, guest: guestSchema.optional(), arrival: date, departure: date, adults: z.coerce.number().int().min(1).max(20), children: z.coerce.number().int().min(0).max(20).default(0), rate: money, note: txt(500).default(""), idem }).parse(raw);
    if (i.departure <= i.arrival) throw new OpError(422, "La date de départ doit être postérieure à la date d'arrivée.");
    if (i.rate <= 0) throw new OpError(422, "Indiquez le prix de la nuit (aucun prix n'est inventé).");
    const room = await must<Room>(ctx, "room", i.room_id, "Chambre");
    if (room.data.maintenance) throw new OpError(409, `La chambre ${room.data.number} est en maintenance.`);
    if (i.adults + i.children > room.data.capacity) throw new OpError(422, `La chambre ${room.data.number} accueille ${room.data.capacity} personne(s) au maximum.`);
    if (!i.id) {
      const same = await findBy<Stay>(ctx, "stay", (s) => s.idem === i.idem);
      if (same) return ok(`Réservation ${same.data.ref} déjà enregistrée.`, { id: same.id, duplicate: true });
    }
    const clash = await findBy<Stay>(ctx, "stay", (s, d) => d.id !== i.id && s.room_id === i.room_id && STAY_ACTIVE.includes(s.status) && staysOverlap(s, i));
    if (clash) throw new OpError(409, `Chambre ${room.data.number} déjà réservée du ${clash.data.arrival} au ${clash.data.departure} (${clash.data.ref}).`);
    const clashArrived = await findBy<Stay>(ctx, "stay", (s, d) => d.id !== i.id && s.room_id === i.room_id && s.status === "arrivee");
    let guestId = i.guest_id;
    if (guestId) await must(ctx, "guest", guestId, "Client");
    else if (i.guest) guestId = (await ctx.store.insert("guest", i.guest satisfies Guest)).id;
    else throw new OpError(422, "Choisissez ou enregistrez le client.");
    if (i.id) {
      let moved: string | null = null;
      await mutate<Stay>(ctx, "stay", i.id, "Séjour", (s) => {
        if (!STAY_ACTIVE.includes(s.status)) throw new OpError(409, "Ce séjour est clôturé.");
        moved = s.status === "arrivee" && s.room_id !== i.room_id ? s.room_id : null;
        if (moved) {
          const busy = clashArrived;
          if (busy) throw new OpError(409, `Un client occupe déjà la chambre ${room.data.number}.`);
        }
        return { ...s, room_id: i.room_id, guest_id: guestId!, arrival: i.arrival, departure: i.departure, adults: i.adults, children: i.children, rate: i.rate, note: i.note, history: [...s.history, hist(ctx, s.status, s.status, "Réservation modifiée")] };
      });
      // Client présent changé de chambre : l'ancienne chambre est à nettoyer.
      if (moved) await mutate<Room>(ctx, "room", moved, "Chambre", (r) => ({ ...r, housekeeping: "a_nettoyer" }));
      return ok(moved ? `Client déplacé en chambre ${room.data.number}.` : "Réservation modifiée.", { id: i.id });
    }
    const st: Stay = { ref: await number(ctx, "RES"), room_id: i.room_id, guest_id: guestId!, arrival: i.arrival, departure: i.departure, adults: i.adults, children: i.children, rate: i.rate, status: "reservee", charges: [], note: i.note, invoice_no: null, checked_in_at: null, checked_out_at: null, history: [hist(ctx, null, "reservee")], idem: i.idem, by: ctx.actor.id };
    const d = await ctx.store.insert("stay", st);
    return ok(`Réservation ${st.ref} : chambre ${room.data.number}, ${nights(i.arrival, i.departure)} nuit(s).`, { id: d.id });
  },

  async "stay.status"(ctx, raw) {
    need(ctx, 1, "le suivi des séjours");
    const i = z.object({ id, to: z.enum(["arrivee", "partie", "annulee", "absent"]), reason: txt(200).default("") }).parse(raw);
    const cur = await must<Stay>(ctx, "stay", i.id, "Séjour");
    const room = await must<Room>(ctx, "room", cur.data.room_id, "Chambre");
    if (i.to === "arrivee") {
      if (cur.data.arrival > todayOf(ctx)) throw new OpError(409, `Arrivée prévue le ${cur.data.arrival} : modifiez d'abord la date si le client arrive plus tôt.`);
      if (room.data.maintenance) throw new OpError(409, "Chambre en maintenance.");
      const stays = (await ctx.store.list("stay")) as Doc<Stay>[];
      if (stays.some((s) => s.id !== i.id && s.data.room_id === cur.data.room_id && s.data.status === "arrivee")) throw new OpError(409, "Un autre client occupe encore cette chambre : enregistrez d'abord son départ.");
    }
    if ((i.to === "annulee" || i.to === "absent") && cur.data.status === "arrivee") throw new OpError(409, "Le client est arrivé : enregistrez son départ.");
    if (i.to === "annulee" || i.to === "absent") {
      const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
      const s = paidSums(pays, "stay", i.id);
      if (s.confirmed + s.pending > 0) need(ctx, 2, "l'annulation d'un séjour déjà payé (pensez au remboursement)");
    }
    const allowed: Record<string, string[]> = { reservee: ["arrivee", "annulee", "absent"], arrivee: ["partie"] };
    await mutate<Stay>(ctx, "stay", i.id, "Séjour", (s) => {
      if (s.status === i.to) return null;
      if (!(allowed[s.status] ?? []).includes(i.to)) throw new OpError(409, "Changement de statut impossible pour ce séjour.");
      return { ...s, status: i.to, checked_in_at: i.to === "arrivee" ? nowIso(ctx) : s.checked_in_at, checked_out_at: i.to === "partie" ? nowIso(ctx) : s.checked_out_at, history: [...s.history, hist(ctx, s.status, i.to, i.reason)] };
    });
    if (i.to === "partie") await mutate<Room>(ctx, "room", cur.data.room_id, "Chambre", (r) => (r.housekeeping === "a_nettoyer" ? null : { ...r, housekeeping: "a_nettoyer" }));
    if (i.to === "partie") {
      const pays = (await ctx.store.list("payment")) as Doc<Payment>[];
      const due = stayTotal(cur.data) - paidSums(pays, "stay", i.id).confirmed;
      return ok(due > 0 ? `Départ enregistré. Attention : il reste ${due.toLocaleString("fr-FR")} FCFA à encaisser.` : "Départ enregistré : la chambre est à nettoyer.");
    }
    return ok(i.to === "arrivee" ? `Arrivée enregistrée : chambre ${room.data.number} occupée.` : i.to === "annulee" ? "Réservation annulée." : "Client marqué non présenté.");
  },

  async "stay.charge"(ctx, raw) {
    need(ctx, 1, "l'ajout d'une prestation");
    const i = z.object({ id, label: req(120, "Libellé"), amount: money.refine((n) => n > 0, "Montant supérieur à 0 attendu"), idem }).parse(raw);
    const { written } = await mutate<Stay>(ctx, "stay", i.id, "Séjour", (s) => {
      if (s.status !== "arrivee" && s.status !== "reservee") throw new OpError(409, "Séjour clôturé.");
      if (s.charges.some((c) => c.id === i.idem)) return null;
      return { ...s, charges: [...s.charges, { id: i.idem, label: i.label, amount: i.amount, order_id: null, at: nowIso(ctx), by: ctx.actor.id }] };
    });
    return written ? ok("Prestation ajoutée à la note.") : ok("Prestation déjà ajoutée.", { duplicate: true });
  },

  async "stay.invoice"(ctx, raw) {
    need(ctx, 1, "l'émission d'une facture");
    const i = z.object({ id }).parse(raw);
    const cur = await must<Stay>(ctx, "stay", i.id, "Séjour");
    if (cur.data.invoice_no) return ok("Facture déjà émise.", { duplicate: true });
    const n = await number(ctx, "FAC");
    await mutate<Stay>(ctx, "stay", i.id, "Séjour", (s) => (s.invoice_no ? null : { ...s, invoice_no: n }));
    return ok(`Facture ${n} émise.`);
  },

  // ----- Photos de l'établissement -----
  async "photo.add"(ctx, raw) {
    need(ctx, 2, "l'import de photos");
    const i = z.object({ category: z.enum(PHOTO_CATEGORIES), data_url: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Image invalide").max(450_000, "Photo trop lourde"), caption: txt(120).default(""), tint: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().default(null), replace_id: optId }).parse(raw);
    const s = await settings(ctx);
    if ((s.data.photo_counts[i.category] ?? 0) >= 12 && !i.replace_id) throw new OpError(409, "12 photos maximum par espace.");
    if (i.replace_id) {
      const old = await must<Photo>(ctx, "photo", i.replace_id, "Photo");
      if (old.data.category !== i.category) throw new OpError(422, "La photo remplacée appartient à un autre espace.");
      await ctx.store.remove("photo", i.replace_id);
    }
    const d = await ctx.store.insert("photo", { category: i.category, data_url: i.data_url, caption: i.caption, tint: i.tint, by: ctx.actor.id } satisfies Photo);
    await saveSettings(ctx, (x) => ({ ...x, photo_counts: { ...x.photo_counts, [i.category]: (x.photo_counts[i.category] ?? 0) + (i.replace_id ? 0 : 1) }, tints: i.tint ? { ...x.tints, [i.category]: i.tint } : x.tints }));
    return ok(i.replace_id ? "Photo remplacée." : "Photo ajoutée.", { id: d.id });
  },

  async "photo.delete"(ctx, raw) {
    need(ctx, 2, "la suppression d'une photo");
    const i = z.object({ id }).parse(raw);
    const p = await must<Photo>(ctx, "photo", i.id, "Photo");
    await ctx.store.remove("photo", i.id);
    await saveSettings(ctx, (x) => {
      const n = Math.max(0, (x.photo_counts[p.data.category] ?? 1) - 1);
      const tints = { ...x.tints };
      if (n === 0) delete tints[p.data.category];
      return { ...x, photo_counts: { ...x.photo_counts, [p.data.category]: n }, tints };
    });
    return ok("Photo supprimée.");
  },
};

export async function runOp(ctx: OpContext, op: string, input: unknown): Promise<OpResult> {
  const h = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : undefined;
  if (!h) throw new OpError(400, "Opération inconnue.");
  try {
    return await h(ctx, input);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      throw new OpError(422, first ? `${first.message}${first.path.length ? ` (${first.path.join(".")})` : ""}` : "Données invalides.");
    }
    throw e;
  }
}
