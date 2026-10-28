import { z } from "zod";
import {
  EQUIP_CONDITIONS,
  JOB_STATUS_LABELS,
  LEVEL,
  PAYMENT_METHODS,
  PRIORITIES,
  TASK_KINDS,
  TRANSITIONS,
  balance,
  canStartRepair,
  defaultChecklist,
  invoiceStatus,
  normalizePlate,
  quoteTotals,
  round2,
  today,
  type Client,
  type Col,
  type Doc,
  type Equip,
  type Expense,
  type GarageRole,
  type HistoryEntry,
  type Invoice,
  type InvoiceLine,
  type Job,
  type JobStatus,
  type Locker,
  type Move,
  type MoveType,
  type Part,
  type PartLine,
  type Payment,
  type Po,
  type Quote,
  type Settings,
  type Supplier,
  type Supply,
  type SupplyMove,
  type Task,
  type TimeEntry,
  type ToolIssue,
  type Vehicle,
} from "./model";

/**
 * Moteur des opérations du garage. Chaque opération vérifie le rôle, valide les données,
 * applique les règles métier et n'écrit qu'à travers le `GarageStore` :
 * - mises à jour conditionnelles (`cas`) : deux employés simultanés ne s'écrasent jamais ;
 * - clés d'opération : un mouvement de stock ou un paiement n'est jamais appliqué deux fois.
 */

export interface GarageStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  /** N'écrit que si la fiche n'a pas changé depuis `doc.updated_at` ; sinon renvoie null. */
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  /** Numéro suivant d'une séquence (références uniques), sûr en cas d'accès simultanés. */
  nextSeq(key: string): Promise<number>;
}

export type Actor = { id: string; role: GarageRole };
export type OpContext = { store: GarageStore; actor: Actor; members: string[]; now?: () => Date; uuid?: () => string };
export type Effect = { type: "ready"; jobId: string; ref: string; plate: string };
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
const money = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform((n) => Math.round(n));
const optMoney = z.union([z.literal(""), z.null(), money]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const qty = z.coerce.number().finite().positive("Quantité supérieure à 0 attendue").max(1e6).transform(round2);
const idem = z.string().min(8).max(80);

// ---------- Outils internes ----------

function need(ctx: OpContext, level: number, what = "cette action") {
  if (LEVEL[ctx.actor.role] < level) throw new OpError(403, level >= 2 ? `Seul un gérant (gestionnaire, administrateur ou propriétaire) peut effectuer ${what}.` : `Votre rôle (lecture seule) ne permet pas ${what}.`);
}
const nowIso = (ctx: OpContext) => (ctx.now?.() ?? new Date()).toISOString();
const newId = (ctx: OpContext) => (ctx.uuid ?? (() => crypto.randomUUID()))();
const year = (ctx: OpContext) => (ctx.now?.() ?? new Date()).getFullYear();

async function number(ctx: OpContext, prefix: string) {
  const n = await ctx.store.nextSeq(`${prefix}-${year(ctx)}`);
  return `${prefix}-${year(ctx)}-${String(n).padStart(4, "0")}`;
}

async function must<T>(ctx: OpContext, col: Col, docId: string, label: string): Promise<Doc<T>> {
  const d = await ctx.store.get(col, docId);
  if (!d) throw new OpError(404, `${label} introuvable.`);
  return d as Doc<T>;
}

/**
 * Lit, transforme et réécrit une fiche avec contrôle de version ; recommence si un autre
 * utilisateur l'a modifiée entre-temps. `fn` renvoie null quand il n'y a rien à écrire.
 */
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

async function findBy<T>(ctx: OpContext, col: Col, pred: (d: T) => boolean): Promise<Doc<T> | undefined> {
  return ((await ctx.store.list(col)) as Doc<T>[]).find((d) => pred(d.data));
}

function member(ctx: OpContext, uid: string | null, label = "Le membre choisi") {
  if (uid && !ctx.members.includes(uid)) throw new OpError(422, `${label} ne fait pas partie de l'équipe de ce logiciel.`);
  return uid;
}

const hist = (ctx: OpContext, from: string | null, to: string, note?: string): HistoryEntry => ({ from, to, at: nowIso(ctx), by: ctx.actor.id, ...(note ? { note } : {}) });

/**
 * Mouvement de stock d'une pièce, appliqué une seule fois par clé d'opération.
 * La quantité est modifiée par mise à jour conditionnelle : deux sorties simultanées ne
 * peuvent pas consommer la même unité. Renvoie null si le mouvement avait déjà été appliqué.
 */
async function stockMove(
  ctx: OpContext,
  m: { part_id: string; delta: number; type: MoveType; reason: string; op_key: string; unit_cost?: number | null; job_id?: string | null; invoice_id?: string | null; po_id?: string | null; patch?: Partial<Part>; setQty?: number },
): Promise<Doc<Move> | null> {
  let applied = false;
  let delta = m.delta;
  let after = 0;
  let cost: number | null = m.unit_cost ?? null;
  const { written } = await mutate<Part>(ctx, "part", m.part_id, "Pièce", (p) => {
    if (p.op_keys.includes(m.op_key)) {
      applied = true;
      return null;
    }
    if (m.setQty !== undefined) delta = round2(m.setQty - p.qty);
    after = round2(p.qty + delta);
    if (after < 0 && m.type !== "ajustement")
      throw new OpError(409, `Stock insuffisant pour « ${p.name} » : ${p.qty} disponible(s), ${Math.abs(delta)} demandé(s). Signalez la pièce manquante ou enregistrez une réception.`);
    if (m.unit_cost === undefined) cost = p.buy_price;
    return { ...p, ...m.patch, qty: after, op_keys: [...p.op_keys, m.op_key].slice(-200) };
  });
  if (applied || !written) return null;
  const move: Move = {
    part_id: m.part_id,
    type: m.type,
    qty: delta,
    balance_after: after,
    unit_cost: cost,
    reason: m.reason,
    job_id: m.job_id ?? null,
    invoice_id: m.invoice_id ?? null,
    po_id: m.po_id ?? null,
    by: ctx.actor.id,
    at: nowIso(ctx),
    op_key: m.op_key,
  };
  return (await ctx.store.insert("move", move)) as Doc<Move>;
}

async function supplyMoveApply(ctx: OpContext, supplyId: string, delta: number, reason: string, opKey: string, cost: number | null): Promise<Doc<SupplyMove> | null> {
  let applied = false;
  let after = 0;
  const { written } = await mutate<Supply>(ctx, "supply", supplyId, "Fourniture", (s) => {
    if (s.op_keys.includes(opKey)) {
      applied = true;
      return null;
    }
    after = round2(s.qty + delta);
    if (after < 0) throw new OpError(409, `Quantité insuffisante : ${s.qty} ${s.unit} disponible(s).`);
    return { ...s, qty: after, last_cost: delta > 0 && cost !== null ? Math.round(cost / delta) : s.last_cost, op_keys: [...s.op_keys, opKey].slice(-200) };
  });
  if (applied || !written) return null;
  return (await ctx.store.insert("supply_move", { supply_id: supplyId, qty: delta, balance_after: after, reason, cost, by: ctx.actor.id, at: nowIso(ctx), op_key: opKey } satisfies SupplyMove)) as Doc<SupplyMove>;
}

const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, effects: [], ...extra });
const editable = (j: Job) => {
  if (j.status === "remis" || j.status === "annule") throw new OpError(409, `Ce dossier est ${JOB_STATUS_LABELS[j.status].toLowerCase()} : il n'est plus modifiable.`);
};

// ---------- Opérations ----------

type Handler = (ctx: OpContext, input: unknown) => Promise<OpResult>;

const clientSchema = z.object({ id: optId, name: req(120, "Nom"), phone: txt(30), email: z.union([z.string().trim().toLowerCase().email("E-mail invalide").max(120), z.literal("")]).default(""), address: txt(200).default(""), notes: txt(1000).default("") });
const vehicleSchema = z.object({
  id: optId,
  client_id: id,
  plate: req(20, "Immatriculation"),
  make: req(60, "Marque"),
  model: req(60, "Modèle"),
  year: z.union([z.literal(""), z.null(), z.coerce.number().int().min(1900).max(2100)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  vin: txt(40).default(""),
  mileage: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(5_000_000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
});
export const CHANNEL_LABELS: Record<string, string> = { signature: "signature du devis", oral: "accord oral au garage", telephone: "téléphone", message: "SMS / message", email: "e-mail" };
const quoteLineSchema = z.object({ id: z.string().max(64).optional(), kind: z.enum(["piece", "main_oeuvre"]), label: req(160, "Libellé"), part_id: optId, qty, unit_price: money });

export const OPS: Record<string, Handler> = {
  // ----- Accueil : clients et véhicules -----
  async "client.save"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un client");
    const i = clientSchema.parse(raw);
    if (!i.phone && !i.email) throw new OpError(422, "Indiquez au moins un téléphone ou un e-mail pour joindre le client.");
    if (i.phone && !/^\+?[0-9 ().-]{6,20}$/.test(i.phone)) throw new OpError(422, "Numéro de téléphone invalide.");
    const digits = i.phone.replace(/\D/g, "");
    const dup = digits ? await findBy<Client>(ctx, "client", (c) => c.phone.replace(/\D/g, "") === digits) : undefined;
    if (dup && dup.id !== i.id) throw new OpError(409, `Ce numéro est déjà celui du client « ${dup.data.name} ». Recherchez-le plutôt que de le recréer.`);
    const data: Client = { name: i.name, phone: i.phone, email: i.email, address: i.address, notes: i.notes };
    if (i.id) {
      await mutate<Client>(ctx, "client", i.id, "Client", () => data);
      return ok("Client mis à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("client", data);
    return ok("Client enregistré.", { id: d.id });
  },

  async "vehicle.save"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un véhicule");
    const i = vehicleSchema.parse(raw);
    await must(ctx, "client", i.client_id, "Client");
    const plate = normalizePlate(i.plate);
    if (plate.length < 2) throw new OpError(422, "Immatriculation invalide.");
    const dup = await findBy<Vehicle>(ctx, "vehicle", (v) => normalizePlate(v.plate) === plate);
    if (dup && dup.id !== i.id) throw new OpError(409, `Le véhicule ${i.plate.toUpperCase()} est déjà enregistré.`);
    const data: Vehicle = { client_id: i.client_id, plate: i.plate.toUpperCase(), make: i.make, model: i.model, year: i.year, vin: i.vin.toUpperCase(), mileage: i.mileage };
    if (i.id) {
      await mutate<Vehicle>(ctx, "vehicle", i.id, "Véhicule", () => data);
      return ok("Véhicule mis à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("vehicle", data);
    return ok("Véhicule enregistré.", { id: d.id });
  },

  // ----- Accueil : dossier d'intervention -----
  async "job.create"(ctx, raw) {
    need(ctx, 1, "la création d'une intervention");
    const i = z
      .object({
        client_id: id,
        vehicle_id: id,
        complaint: req(2000, "Description de la panne ou de la demande"),
        requested_work: txt(2000).default(""),
        mileage: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(5_000_000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
        priority: z.enum(PRIORITIES).default("normale"),
        mechanic_id: optId,
        planned_end: optDate,
        planned_minutes: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(100000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
        requires_quote: z.boolean().default(true),
        idem,
      })
      .parse(raw);
    const dup = await findBy<Job>(ctx, "job", (j) => j.idem === i.idem);
    if (dup) return ok(`Intervention ${dup.data.ref} déjà enregistrée.`, { id: dup.id, duplicate: true });
    await must(ctx, "client", i.client_id, "Client");
    const vehicle = await must<Vehicle>(ctx, "vehicle", i.vehicle_id, "Véhicule");
    if (vehicle.data.client_id !== i.client_id) throw new OpError(422, "Ce véhicule n'appartient pas au client choisi.");
    member(ctx, i.mechanic_id, "Le mécanicien choisi");
    if (i.mileage !== null && vehicle.data.mileage !== null && i.mileage < vehicle.data.mileage)
      throw new OpError(422, `Kilométrage inférieur au dernier relevé enregistré (${vehicle.data.mileage.toLocaleString("fr-FR")} km). Vérifiez la saisie.`);
    const open = await findBy<Job>(ctx, "job", (j) => j.vehicle_id === i.vehicle_id && !["remis", "annule"].includes(j.status));
    if (open) throw new OpError(409, `Ce véhicule a déjà un dossier ouvert (${open.data.ref}). Complétez ce dossier plutôt que d'en créer un second.`);
    const job: Job = {
      ref: await number(ctx, "GAR"),
      client_id: i.client_id,
      vehicle_id: i.vehicle_id,
      complaint: i.complaint,
      requested_work: i.requested_work,
      mileage_in: i.mileage,
      priority: i.priority,
      mechanic_id: i.mechanic_id,
      planned_end: i.planned_end,
      planned_minutes: i.planned_minutes,
      requires_quote: i.requires_quote,
      diagnosis: "",
      status: "attente",
      history: [hist(ctx, null, "attente", "Véhicule déposé à l'accueil")],
      labour: [],
      parts: [],
      missing: [],
      qc: null,
      rework_count: 0,
      ready_at: null,
      delivered_at: null,
      invoice_id: null,
      photo_count: 0,
      idem: i.idem,
      created_by: ctx.actor.id,
    };
    const d = await ctx.store.insert("job", job);
    if (i.mileage !== null && (vehicle.data.mileage === null || i.mileage > vehicle.data.mileage))
      await mutate<Vehicle>(ctx, "vehicle", i.vehicle_id, "Véhicule", (v) => ({ ...v, mileage: i.mileage }));
    return ok(`Intervention ${job.ref} créée : le véhicule apparaît dans le suivi de l'atelier.`, { id: d.id });
  },

  async "job.update"(ctx, raw) {
    need(ctx, 1, "la modification d'un dossier");
    const i = z
      .object({
        id,
        complaint: req(2000, "Description").optional(),
        requested_work: txt(2000).optional(),
        diagnosis: txt(4000).optional(),
        priority: z.enum(PRIORITIES).optional(),
        mechanic_id: optId.optional(),
        planned_end: optDate,
        planned_minutes: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(100000)]).optional().transform((v) => (v === "" ? null : v)),
        requires_quote: z.boolean().optional(),
      })
      .parse(raw);
    if (i.mechanic_id !== undefined) member(ctx, i.mechanic_id, "Le mécanicien choisi");
    await mutate<Job>(ctx, "job", i.id, "Dossier", (j) => {
      editable(j);
      if (i.requires_quote === false && j.requires_quote && LEVEL[ctx.actor.role] < 2) throw new OpError(403, "Seul un gérant peut dispenser un dossier de devis.");
      const next = { ...j };
      if (i.complaint !== undefined) next.complaint = i.complaint;
      if (i.requested_work !== undefined) next.requested_work = i.requested_work;
      if (i.diagnosis !== undefined) next.diagnosis = i.diagnosis;
      if (i.priority !== undefined) next.priority = i.priority;
      if (i.mechanic_id !== undefined) next.mechanic_id = i.mechanic_id;
      if ("planned_end" in (raw as object)) next.planned_end = i.planned_end;
      if (i.planned_minutes !== undefined) next.planned_minutes = i.planned_minutes;
      if (i.requires_quote !== undefined) next.requires_quote = i.requires_quote;
      return next;
    });
    return ok("Dossier mis à jour.", { id: i.id });
  },

  async "job.status"(ctx, raw) {
    need(ctx, 1, "le changement de statut");
    const i = z.object({ id, to: z.enum(["attente", "diagnostic", "reparation", "controle", "pret", "remis", "annule"]), note: txt(500).default(""), confirm_balance: z.boolean().default(false) }).parse(raw);
    if (i.to === "pret") throw new OpError(409, "Le statut « Prêt » est donné par la validation du contrôle qualité.");
    if (i.to === "annule") need(ctx, 2, "l'annulation d'un dossier");
    const quotes = i.to === "reparation" ? await ctx.store.list("quote") : [];
    let invoice: Doc<Invoice> | null = null;
    const pre = await must<Job>(ctx, "job", i.id, "Dossier");
    if (i.to === "remis" && pre.data.invoice_id) invoice = (await ctx.store.get("invoice", pre.data.invoice_id)) as Doc<Invoice> | null;
    if (i.to === "annule" && pre.data.parts.some((p) => p.consumed)) throw new OpError(409, "Des pièces ont déjà été prélevées sur ce dossier : remettez-les en stock avant l'annulation.");
    await mutate<Job>(ctx, "job", i.id, "Dossier", (j, doc) => {
      if (j.status === i.to) return null;
      if (!TRANSITIONS[j.status].includes(i.to)) throw new OpError(409, `Passage impossible de « ${JOB_STATUS_LABELS[j.status]} » à « ${JOB_STATUS_LABELS[i.to]} ».`);
      if (j.status === "pret" && i.to === "reparation") need(ctx, 2, "la réouverture d'un véhicule prêt");
      if (i.to === "reparation" && j.status === "diagnostic") {
        const c = canStartRepair(j, doc.id, quotes);
        if (!c.ok) throw new OpError(409, c.reason!);
      }
      if (i.to === "remis") {
        const due = invoice && !invoice.data.cancelled ? balance(invoice.data) : null;
        if ((due === null || due > 0) && !i.confirm_balance)
          throw new OpError(409, due === null ? "Aucune facture n'est liée à ce dossier. Confirmez la remise sans facture." : `Solde restant dû : ${due.toLocaleString("fr-FR")} FCFA. Confirmez la remise avec solde.`);
      }
      const note = i.to === "remis" && i.confirm_balance ? [i.note, "Remise confirmée malgré facture absente ou solde restant"].filter(Boolean).join(" · ") : i.note;
      return { ...j, status: i.to, history: [...j.history, hist(ctx, j.status, i.to, note)], delivered_at: i.to === "remis" ? nowIso(ctx) : j.delivered_at, qc: i.to === "controle" ? { ...(j.qc ?? { items: defaultChecklist(j), remarks: "", checked_by: null, checked_at: null, validated_by: null, validated_at: null }), result: null } : j.qc };
    });
    return ok(`Statut : ${JOB_STATUS_LABELS[i.to]}.`, { id: i.id });
  },

  async "photo.add"(ctx, raw) {
    need(ctx, 1, "l'ajout de photos");
    const i = z.object({ job_id: id, data_url: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Image invalide").max(450_000, "Photo trop lourde"), caption: txt(120).default("") }).parse(raw);
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      editable(j);
      if (j.photo_count >= 8) throw new OpError(409, "8 photos maximum par dossier.");
      return { ...j, photo_count: j.photo_count + 1 };
    });
    const d = await ctx.store.insert("photo", { job_id: i.job_id, data_url: i.data_url, caption: i.caption, by: ctx.actor.id });
    return ok("Photo ajoutée au dossier.", { id: d.id });
  },

  async "photo.delete"(ctx, raw) {
    need(ctx, 1, "la suppression d'une photo");
    const i = z.object({ id }).parse(raw);
    const p = await must<{ job_id: string; by: string }>(ctx, "photo", i.id, "Photo");
    if (p.data.by !== ctx.actor.id) need(ctx, 2, "la suppression de la photo d'un autre membre");
    await ctx.store.remove("photo", i.id);
    await mutate<Job>(ctx, "job", p.data.job_id, "Dossier", (j) => ({ ...j, photo_count: Math.max(0, j.photo_count - 1) }));
    return ok("Photo supprimée.");
  },

  // ----- Devis -----
  async "quote.save"(ctx, raw) {
    need(ctx, 1, "la préparation d'un devis");
    const i = z.object({ id: optId, job_id: id, lines: z.array(quoteLineSchema).min(1, "Ajoutez au moins une ligne").max(60), note: txt(1000).default("") }).parse(raw);
    const job = await must<Job>(ctx, "job", i.job_id, "Dossier");
    editable(job.data);
    for (const l of i.lines) if (l.part_id) await must(ctx, "part", l.part_id, "Pièce du devis");
    const lines = i.lines.map((l) => ({ ...l, id: l.id || newId(ctx), part_id: l.kind === "piece" ? l.part_id : null }));
    const totals = quoteTotals(lines);
    if (i.id) {
      await mutate<Quote>(ctx, "quote", i.id, "Devis", (q) => {
        if (q.job_id !== i.job_id) throw new OpError(422, "Ce devis appartient à un autre dossier.");
        if (q.status === "accepte" || q.status === "refuse") throw new OpError(409, "Un devis accepté ou refusé n'est plus modifiable : créez un nouveau devis.");
        const back = q.status === "envoye";
        return { ...q, lines, ...totals, note: i.note, status: "brouillon", history: back ? [...q.history, hist(ctx, "envoye", "brouillon", "Modifié après envoi : à renvoyer au client")] : q.history };
      });
      return ok("Devis modifié.", { id: i.id });
    }
    const q: Quote = { number: await number(ctx, "DEV"), job_id: i.job_id, client_id: job.data.client_id, lines, ...totals, note: i.note, status: "brouillon", history: [hist(ctx, null, "brouillon")], decision: null };
    const d = await ctx.store.insert("quote", q);
    return ok(`Devis ${q.number} créé (brouillon).`, { id: d.id });
  },

  async "quote.status"(ctx, raw) {
    need(ctx, 1, "le suivi d'un devis");
    const i = z.object({ id, to: z.enum(["envoye", "accepte", "refuse"]), channel: z.enum(["signature", "oral", "telephone", "message", "email"]).optional(), note: txt(500).default("") }).parse(raw);
    if (i.to !== "envoye" && !i.channel) throw new OpError(422, "Indiquez comment le client a donné sa réponse (signature, téléphone, message…).");
    const quote = await must<Quote>(ctx, "quote", i.id, "Devis");
    if (i.to === "accepte") {
      const other = await findBy<Quote>(ctx, "quote", (q) => q.job_id === quote.data.job_id && q.status === "accepte");
      if (other && other.id !== i.id) throw new OpError(409, `Le devis ${other.data.number} est déjà accepté pour ce dossier.`);
    }
    await mutate<Quote>(ctx, "quote", i.id, "Devis", (q) => {
      if (q.status === i.to) return null;
      const allowed: Record<string, string[]> = { brouillon: ["envoye", "accepte", "refuse"], envoye: ["accepte", "refuse"], accepte: [], refuse: [] };
      if (!allowed[q.status]!.includes(i.to)) throw new OpError(409, "Ce devis a déjà reçu une réponse.");
      return { ...q, status: i.to, history: [...q.history, hist(ctx, q.status, i.to, i.note)], decision: i.to === "envoye" ? q.decision : { channel: i.channel!, note: i.note, at: nowIso(ctx), recorded_by: ctx.actor.id } };
    });
    // Accord du client : les pièces et travaux du devis alimentent le dossier (sans ressaisie, sans prélèvement).
    if (i.to === "accepte") {
      const parts = (await ctx.store.list("part")) as Doc<Part>[];
      await mutate<Job>(ctx, "job", quote.data.job_id, "Dossier", (j) => {
        const labour = j.labour.length ? j.labour : quote.data.lines.filter((l) => l.kind === "main_oeuvre").map((l) => ({ id: newId(ctx), label: l.label, hours: l.qty, rate: l.unit_price }));
        const known = new Set(j.parts.map((p) => p.part_id));
        const extra: PartLine[] = quote.data.lines
          .filter((l) => l.kind === "piece" && l.part_id && !known.has(l.part_id))
          .map((l) => ({ id: newId(ctx), part_id: l.part_id!, label: l.label, qty: l.qty, unit_price: l.unit_price, unit_cost: parts.find((p) => p.id === l.part_id)?.data.buy_price ?? null, consumed: false, consumed_at: null, move_id: null }));
        return { ...j, labour, parts: [...j.parts, ...extra], history: [...j.history, hist(ctx, j.status, j.status, `Devis ${quote.data.number} accepté (${CHANNEL_LABELS[i.channel!]})`)] };
      });
    }
    return ok(i.to === "envoye" ? "Devis marqué comme envoyé." : i.to === "accepte" ? "Accord du client enregistré : les travaux peuvent démarrer." : "Refus du client enregistré.", { id: i.id });
  },

  // ----- Factures et paiements -----
  async "invoice.create"(ctx, raw) {
    need(ctx, 1, "la création d'une facture");
    const i = z.object({ job_id: id, source: z.enum(["devis", "intervention"]), due_date: optDate }).parse(raw);
    const job = await must<Job>(ctx, "job", i.job_id, "Dossier");
    if (job.data.status === "annule") throw new OpError(409, "Dossier annulé : aucune facture possible.");
    let lines: InvoiceLine[];
    let quoteId: string | null = null;
    if (i.source === "devis") {
      const q = (await ctx.store.list("quote")).find((x) => (x as Doc<Quote>).data.job_id === i.job_id && (x as Doc<Quote>).data.status === "accepte") as Doc<Quote> | undefined;
      if (!q) throw new OpError(409, "Aucun devis accepté pour ce dossier.");
      quoteId = q.id;
      lines = q.data.lines.map((l) => ({ label: l.label, kind: l.kind, qty: l.qty, unit_price: l.unit_price, total: Math.round(l.qty * l.unit_price), part_id: l.part_id }));
    } else {
      if (job.data.requires_quote && !["pret", "remis", "controle", "reparation"].includes(job.data.status)) throw new OpError(409, "Facturez une intervention validée (devis accepté et travaux commencés).");
      lines = [
        ...job.data.labour.map((l) => ({ label: l.label, kind: "main_oeuvre" as const, qty: l.hours, unit_price: l.rate, total: Math.round(l.hours * l.rate), part_id: null })),
        ...job.data.parts.map((p) => ({ label: p.label, kind: "piece" as const, qty: p.qty, unit_price: p.unit_price, total: Math.round(p.qty * p.unit_price), part_id: p.part_id })),
      ];
    }
    const total = lines.reduce((a, l) => a + l.total, 0);
    if (!lines.length || total <= 0) throw new OpError(422, "Rien à facturer : ajoutez les travaux et pièces du dossier.");
    const invId = newId(ctx);
    // Réservation du dossier : une seule facture active par intervention.
    const existing = job.data.invoice_id ? ((await ctx.store.get("invoice", job.data.invoice_id)) as Doc<Invoice> | null) : null;
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      if (j.invoice_id && j.invoice_id !== existing?.id) throw new OpError(409, "Une facture est en cours de création pour ce dossier.");
      if (j.invoice_id && existing && !existing.data.cancelled) throw new OpError(409, `Ce dossier est déjà facturé (${existing.data.number}).`);
      return { ...j, invoice_id: invId };
    });
    try {
      const inv: Invoice = {
        number: await number(ctx, "FAC"),
        job_id: i.job_id,
        client_id: job.data.client_id,
        customer_name: "",
        source: i.source,
        quote_id: quoteId,
        lines,
        total,
        total_parts: lines.filter((l) => l.kind === "piece").reduce((a, l) => a + l.total, 0),
        total_labour: lines.filter((l) => l.kind === "main_oeuvre").reduce((a, l) => a + l.total, 0),
        paid: 0,
        status: "impayee",
        payment_keys: [],
        due_date: i.due_date,
        issued_at: today(ctx.now?.()),
        cancelled: null,
        idem: `job:${i.job_id}:${invId}`,
      };
      await ctx.store.insert("invoice", inv, invId);
      return ok(`Facture ${inv.number} générée : ${total.toLocaleString("fr-FR")} FCFA.`, { id: invId });
    } catch (e) {
      await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => (j.invoice_id === invId ? { ...j, invoice_id: existing?.id ?? null } : null));
      throw e;
    }
  },

  async "invoice.sale"(ctx, raw) {
    need(ctx, 1, "une vente de pièces");
    const i = z.object({ client_id: optId, customer_name: txt(120).default(""), lines: z.array(z.object({ part_id: id, qty, unit_price: optMoney })).min(1).max(40), idem }).parse(raw);
    const dup = await findBy<Invoice>(ctx, "invoice", (x) => x.idem === i.idem);
    if (dup) return ok(`Vente déjà enregistrée (${dup.data.number}).`, { id: dup.id, duplicate: true });
    if (i.client_id) await must(ctx, "client", i.client_id, "Client");
    const lines: InvoiceLine[] = [];
    for (const l of i.lines) {
      const p = await must<Part>(ctx, "part", l.part_id, "Pièce");
      if (!p.data.active) throw new OpError(409, `« ${p.data.name} » est inactive.`);
      const price = l.unit_price ?? p.data.sell_price;
      if (price === null) throw new OpError(422, `Prix de vente non renseigné pour « ${p.data.name} » : indiquez-le.`);
      lines.push({ label: `${p.data.name}${p.data.ref ? ` (${p.data.ref})` : ""}`, kind: "piece", qty: l.qty, unit_price: price, total: Math.round(l.qty * price), part_id: p.id });
    }
    const invId = newId(ctx);
    const done: { part_id: string; qty: number }[] = [];
    try {
      for (const [k, l] of lines.entries()) {
        await stockMove(ctx, { part_id: l.part_id!, delta: -l.qty, type: "vente", reason: "Vente au comptoir", op_key: `sale:${invId}:${k}`, invoice_id: invId });
        done.push({ part_id: l.part_id!, qty: l.qty });
      }
    } catch (e) {
      for (const [k, d] of done.entries()) await stockMove(ctx, { part_id: d.part_id, delta: d.qty, type: "retour", reason: "Annulation automatique d'une vente incomplète", op_key: `salefail:${invId}:${k}`, invoice_id: invId });
      throw e;
    }
    const total = lines.reduce((a, l) => a + l.total, 0);
    const inv: Invoice = { number: await number(ctx, "FAC"), job_id: null, client_id: i.client_id, customer_name: i.customer_name, source: "vente", quote_id: null, lines, total, total_parts: total, total_labour: 0, paid: 0, status: "impayee", payment_keys: [], due_date: null, issued_at: today(ctx.now?.()), cancelled: null, idem: i.idem };
    await ctx.store.insert("invoice", inv, invId);
    return ok(`Vente enregistrée : facture ${inv.number} (${total.toLocaleString("fr-FR")} FCFA), stock déduit.`, { id: invId });
  },

  async "invoice.cancel"(ctx, raw) {
    need(ctx, 2, "l'annulation d'une facture");
    const i = z.object({ id, reason: req(300, "Motif") }).parse(raw);
    const { doc } = await mutate<Invoice>(ctx, "invoice", i.id, "Facture", (inv) => {
      if (inv.cancelled) return null;
      if (inv.paid > 0) throw new OpError(409, "Des paiements sont enregistrés sur cette facture : annulez-les d'abord.");
      return { ...inv, cancelled: { at: nowIso(ctx), by: ctx.actor.id, reason: i.reason }, status: "annulee" };
    });
    if (doc.data.job_id) await mutate<Job>(ctx, "job", doc.data.job_id, "Dossier", (j) => (j.invoice_id === i.id ? { ...j, invoice_id: null } : null));
    if (doc.data.source === "vente")
      for (const [k, l] of doc.data.lines.entries()) if (l.part_id) await stockMove(ctx, { part_id: l.part_id, delta: l.qty, type: "retour", reason: `Annulation de la vente ${doc.data.number}`, op_key: `salecancel:${i.id}:${k}`, invoice_id: i.id });
    return ok("Facture annulée (elle reste dans l'historique).");
  },

  async "payment.add"(ctx, raw) {
    need(ctx, 1, "l'enregistrement d'un paiement");
    const i = z.object({ invoice_id: id, amount: money.refine((n) => n > 0, "Montant supérieur à 0 attendu"), method: z.enum(PAYMENT_METHODS), reference: txt(120).default(""), received_at: date, idem }).parse(raw);
    if (i.received_at > today(ctx.now?.())) throw new OpError(422, "Un paiement ne peut pas être daté dans le futur : enregistrez uniquement l'argent réellement reçu.");
    if (i.method !== "especes" && !i.reference) throw new OpError(422, "Indiquez la référence de la transaction (preuve du paiement).");
    const existing = await findBy<Payment & { idem: string }>(ctx, "payment", (p) => p.idem === i.idem);
    if (existing) return ok(`Paiement déjà enregistré (reçu ${existing.data.receipt_no}).`, { id: existing.id, duplicate: true });
    const payId = newId(ctx);
    const { written } = await mutate<Invoice>(ctx, "invoice", i.invoice_id, "Facture", (inv) => {
      if (inv.payment_keys.includes(i.idem)) return null;
      if (inv.cancelled) throw new OpError(409, "Facture annulée.");
      const due = balance(inv);
      if (due <= 0) throw new OpError(409, "Cette facture est déjà entièrement payée.");
      if (i.amount > due) throw new OpError(422, `Le montant dépasse le solde restant (${due.toLocaleString("fr-FR")} FCFA).`);
      const paid = inv.paid + i.amount;
      return { ...inv, paid, status: invoiceStatus(inv.total, paid, false), payment_keys: [...inv.payment_keys, i.idem].slice(-200) };
    });
    if (!written) return ok("Paiement déjà enregistré.", { duplicate: true });
    const p: Payment & { idem: string } = { invoice_id: i.invoice_id, receipt_no: await number(ctx, "REC"), amount: i.amount, method: i.method, reference: i.reference, received_at: i.received_at, recorded_by: ctx.actor.id, cancelled: null, idem: i.idem };
    await ctx.store.insert("payment", p, payId);
    return ok(`Paiement de ${i.amount.toLocaleString("fr-FR")} FCFA enregistré. Reçu ${p.receipt_no}.`, { id: payId });
  },

  async "payment.cancel"(ctx, raw) {
    need(ctx, 2, "l'annulation d'un paiement");
    const i = z.object({ id, reason: req(300, "Motif") }).parse(raw);
    const { doc, written } = await mutate<Payment>(ctx, "payment", i.id, "Paiement", (p) => (p.cancelled ? null : { ...p, cancelled: { at: nowIso(ctx), by: ctx.actor.id, reason: i.reason } }));
    if (written)
      await mutate<Invoice>(ctx, "invoice", doc.data.invoice_id, "Facture", (inv) => {
        const paid = Math.max(0, inv.paid - doc.data.amount);
        return { ...inv, paid, status: invoiceStatus(inv.total, paid, Boolean(inv.cancelled)) };
      });
    return ok("Paiement annulé : le solde de la facture a été recalculé.");
  },

  // ----- Atelier -----
  async "job.labour"(ctx, raw) {
    need(ctx, 1, "la saisie des travaux");
    const i = z.object({ job_id: id, lines: z.array(z.object({ id: z.string().max(64).optional(), label: req(160, "Travail"), hours: z.coerce.number().finite().min(0).max(1000).transform(round2), rate: money })).max(40) }).parse(raw);
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      editable(j);
      return { ...j, labour: i.lines.map((l) => ({ ...l, id: l.id || newId(ctx) })) };
    });
    return ok("Travaux et main-d'œuvre enregistrés.");
  },

  async "job.part.add"(ctx, raw) {
    need(ctx, 1, "l'ajout d'une pièce");
    const i = z.object({ job_id: id, part_id: id, qty, unit_price: optMoney, consume_now: z.boolean().default(false), line_id: z.string().min(8).max(64) }).parse(raw);
    const part = await must<Part>(ctx, "part", i.part_id, "Pièce");
    if (!part.data.active) throw new OpError(409, `« ${part.data.name} » est inactive.`);
    const { written } = await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      editable(j);
      if (j.parts.some((p) => p.id === i.line_id)) return null;
      const line: PartLine = { id: i.line_id, part_id: i.part_id, label: `${part.data.name}${part.data.ref ? ` (${part.data.ref})` : ""}`, qty: i.qty, unit_price: i.unit_price ?? part.data.sell_price ?? 0, unit_cost: part.data.buy_price, consumed: false, consumed_at: null, move_id: null };
      return { ...j, parts: [...j.parts, line] };
    });
    if (i.consume_now) return consumeLine(ctx, i.job_id, i.line_id);
    return ok(written ? "Pièce ajoutée au dossier (pas encore prélevée du stock)." : "Pièce déjà ajoutée.");
  },

  async "job.part.consume"(ctx, raw) {
    need(ctx, 1, "le prélèvement d'une pièce");
    const i = z.object({ job_id: id, line_id: id }).parse(raw);
    return consumeLine(ctx, i.job_id, i.line_id);
  },

  async "job.part.remove"(ctx, raw) {
    need(ctx, 1, "le retrait d'une pièce");
    const i = z.object({ job_id: id, line_id: id }).parse(raw);
    const job = await must<Job>(ctx, "job", i.job_id, "Dossier");
    const line = job.data.parts.find((p) => p.id === i.line_id);
    if (!line) return ok("Ligne déjà retirée.");
    if (line.consumed) {
      need(ctx, 2, "la remise en stock d'une pièce déjà prélevée");
      await stockMove(ctx, { part_id: line.part_id, delta: line.qty, type: "retour", reason: `Retour en stock depuis le dossier ${job.data.ref}`, op_key: `ret:${i.job_id}:${i.line_id}`, job_id: i.job_id, unit_cost: line.unit_cost });
    }
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      editable(j);
      return { ...j, parts: j.parts.filter((p) => p.id !== i.line_id) };
    });
    return ok(line.consumed ? "Pièce remise en stock et retirée du dossier." : "Pièce retirée du dossier.");
  },

  async "job.missing"(ctx, raw) {
    need(ctx, 1, "le signalement d'une pièce manquante");
    const i = z.object({ job_id: id, id: z.string().max(64).optional(), label: txt(160).optional(), part_id: optId, qty: qty.optional(), status: z.enum(["signalee", "commandee", "recue"]).optional() }).parse(raw);
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      editable(j);
      if (i.id) return { ...j, missing: j.missing.map((m) => (m.id === i.id ? { ...m, status: i.status ?? m.status } : m)) };
      if (!i.label) throw new OpError(422, "Indiquez la pièce manquante.");
      return { ...j, missing: [...j.missing, { id: newId(ctx), label: i.label, part_id: i.part_id, qty: i.qty ?? 1, status: "signalee", at: nowIso(ctx), by: ctx.actor.id }] };
    });
    return ok(i.id ? "Pièce manquante mise à jour." : "Pièce manquante signalée : elle apparaît dans les alertes du bureau.");
  },

  async "time.start"(ctx, raw) {
    need(ctx, 1, "le suivi du temps");
    const i = z.object({ job_id: id }).parse(raw);
    const job = await must<Job>(ctx, "job", i.job_id, "Dossier");
    editable(job.data);
    const running = await findBy<TimeEntry>(ctx, "time", (t) => t.mechanic_id === ctx.actor.id && t.started_at !== null && t.ended_at === null);
    if (running) throw new OpError(409, "Un chronomètre est déjà en cours à votre nom : arrêtez-le d'abord.");
    const d = await ctx.store.insert("time", { job_id: i.job_id, mechanic_id: ctx.actor.id, started_at: nowIso(ctx), ended_at: null, minutes: null, date: today(ctx.now?.()), note: "", by: ctx.actor.id } satisfies TimeEntry);
    return ok("Chronomètre démarré.", { id: d.id });
  },

  async "time.stop"(ctx, raw) {
    need(ctx, 1, "le suivi du temps");
    const i = z.object({ id }).parse(raw);
    await mutate<TimeEntry>(ctx, "time", i.id, "Temps", (t) => {
      if (t.ended_at) return null;
      if (t.mechanic_id !== ctx.actor.id) need(ctx, 2, "l'arrêt du chronomètre d'un autre membre");
      const end = nowIso(ctx);
      return { ...t, ended_at: end, minutes: Math.max(1, Math.round((Date.parse(end) - Date.parse(t.started_at!)) / 60000)) };
    });
    return ok("Temps enregistré.");
  },

  async "time.add"(ctx, raw) {
    need(ctx, 1, "le suivi du temps");
    const i = z.object({ job_id: id, minutes: z.coerce.number().int().min(1).max(1440), date, note: txt(300).default(""), mechanic_id: optId }).parse(raw);
    await must(ctx, "job", i.job_id, "Dossier");
    if (i.date > today(ctx.now?.())) throw new OpError(422, "Date future impossible.");
    const mech = i.mechanic_id ?? ctx.actor.id;
    if (mech !== ctx.actor.id) {
      need(ctx, 2, "la saisie du temps d'un autre membre");
      member(ctx, mech);
    }
    const d = await ctx.store.insert("time", { job_id: i.job_id, mechanic_id: mech, started_at: null, ended_at: null, minutes: i.minutes, date: i.date, note: i.note, by: ctx.actor.id } satisfies TimeEntry);
    return ok("Temps enregistré.", { id: d.id });
  },

  async "time.delete"(ctx, raw) {
    need(ctx, 1, "la suppression d'un temps");
    const i = z.object({ id }).parse(raw);
    const t = await must<TimeEntry>(ctx, "time", i.id, "Temps");
    if (t.data.by !== ctx.actor.id) need(ctx, 2, "la suppression du temps saisi par un autre membre");
    await ctx.store.remove("time", i.id);
    return ok("Saisie de temps supprimée (trace conservée dans l'historique).");
  },

  async "qc.save"(ctx, raw) {
    need(ctx, 1, "le contrôle qualité");
    const i = z.object({ job_id: id, items: z.array(z.object({ label: req(160, "Point de contrôle"), ok: z.boolean(), note: txt(300).default("") })).min(1).max(40), remarks: txt(1000).default("") }).parse(raw);
    await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      if (j.status !== "controle") throw new OpError(409, "Le véhicule doit être « En contrôle » pour enregistrer les vérifications.");
      return { ...j, qc: { items: i.items, remarks: i.remarks, checked_by: ctx.actor.id, checked_at: nowIso(ctx), result: null, validated_by: null, validated_at: null } };
    });
    return ok("Vérifications enregistrées.");
  },

  async "qc.validate"(ctx, raw) {
    need(ctx, 2, "la validation finale du contrôle qualité");
    const i = z.object({ job_id: id, result: z.enum(["ok", "reprendre"]), remarks: txt(1000).default("") }).parse(raw);
    const effects: Effect[] = [];
    const { doc } = await mutate<Job>(ctx, "job", i.job_id, "Dossier", (j) => {
      if (j.status !== "controle") throw new OpError(409, "Le véhicule n'est pas en contrôle.");
      if (!j.qc || !j.qc.checked_at) throw new OpError(409, "Enregistrez d'abord la liste de vérification.");
      if (i.result === "ok" && !j.qc.items.every((x) => x.ok)) throw new OpError(409, "Tous les points doivent être vérifiés et conformes avant de valider.");
      if (i.result === "reprendre" && !i.remarks) throw new OpError(422, "Décrivez les travaux à reprendre.");
      const qc = { ...j.qc, remarks: i.remarks || j.qc.remarks, result: i.result, validated_by: ctx.actor.id, validated_at: nowIso(ctx) };
      if (i.result === "ok") return { ...j, qc, status: "pret" as JobStatus, ready_at: nowIso(ctx), history: [...j.history, hist(ctx, "controle", "pret", "Contrôle qualité validé")] };
      return { ...j, qc, status: "reparation" as JobStatus, rework_count: j.rework_count + 1, history: [...j.history, hist(ctx, "controle", "reparation", `Travaux à reprendre : ${i.remarks}`)] };
    });
    if (i.result === "ok") {
      const v = (await ctx.store.get("vehicle", doc.data.vehicle_id)) as Doc<Vehicle> | null;
      effects.push({ type: "ready", jobId: doc.id, ref: doc.data.ref, plate: v?.data.plate ?? "" });
    }
    return ok(i.result === "ok" ? "Contrôle validé : le véhicule est « Prêt » et l'accueil est prévenu." : "Travaux à reprendre : le véhicule repasse en réparation.", { effects });
  },

  async "tool.report"(ctx, raw) {
    need(ctx, 1, "le signalement d'un outil");
    const i = z.object({ name: req(120, "Outil"), problem: z.enum(["endommage", "manquant"]), note: txt(500).default("") }).parse(raw);
    const d = await ctx.store.insert("tool", { ...i, status: "ouvert", reported_by: ctx.actor.id, at: nowIso(ctx), resolved_by: null, resolved_at: null } satisfies ToolIssue);
    return ok("Signalement enregistré.", { id: d.id });
  },

  async "tool.resolve"(ctx, raw) {
    need(ctx, 1, "la clôture d'un signalement");
    const i = z.object({ id }).parse(raw);
    await mutate<ToolIssue>(ctx, "tool", i.id, "Signalement", (t) => (t.status === "resolu" ? null : { ...t, status: "resolu", resolved_by: ctx.actor.id, resolved_at: nowIso(ctx) }));
    return ok("Signalement clôturé.");
  },

  // ----- Stock -----
  async "part.save"(ctx, raw) {
    need(ctx, 2, "la gestion du catalogue de pièces");
    const i = z
      .object({ id: optId, name: req(120, "Nom"), ref: txt(60).default(""), category: txt(60).default(""), location: txt(60).default(""), min_qty: z.coerce.number().finite().min(0).max(1e6).transform(round2), buy_price: optMoney, sell_price: optMoney, supplier_id: optId, active: z.boolean().default(true), initial_qty: z.coerce.number().finite().min(0).max(1e6).optional() })
      .parse(raw);
    if (i.supplier_id) await must(ctx, "supplier", i.supplier_id, "Fournisseur");
    if (i.ref) {
      const r = i.ref.toUpperCase().replace(/\s/g, "");
      const dup = await findBy<Part>(ctx, "part", (p) => p.ref.toUpperCase().replace(/\s/g, "") === r);
      if (dup && dup.id !== i.id) throw new OpError(409, `La référence ${i.ref} est déjà utilisée par « ${dup.data.name} ».`);
    }
    const fields = { name: i.name, ref: i.ref, category: i.category, location: i.location, min_qty: i.min_qty, buy_price: i.buy_price, sell_price: i.sell_price, supplier_id: i.supplier_id, active: i.active };
    if (i.id) {
      await mutate<Part>(ctx, "part", i.id, "Pièce", (p) => ({ ...p, ...fields }));
      return ok(i.active ? "Pièce mise à jour." : "Pièce marquée inactive (son historique est conservé).", { id: i.id });
    }
    const d = await ctx.store.insert("part", { ...fields, qty: 0, op_keys: [] } satisfies Part);
    if (i.initial_qty) await stockMove(ctx, { part_id: d.id, delta: round2(i.initial_qty), type: "initial", reason: "Stock initial compté à la création", op_key: `init:${d.id}` });
    return ok("Pièce ajoutée au catalogue.", { id: d.id });
  },

  async "stock.receive"(ctx, raw) {
    need(ctx, 1, "une réception de pièces");
    const i = z.object({ part_id: id, qty, unit_cost: optMoney, reason: txt(200).default(""), idem }).parse(raw);
    const m = await stockMove(ctx, { part_id: i.part_id, delta: i.qty, type: "reception", reason: i.reason || "Réception hors commande", op_key: `rcv:${i.idem}`, unit_cost: i.unit_cost, patch: i.unit_cost !== null ? { buy_price: i.unit_cost } : undefined });
    return ok(m ? `Réception enregistrée : nouveau stock ${m.data.balance_after}.` : "Réception déjà enregistrée.", { duplicate: !m });
  },

  async "stock.adjust"(ctx, raw) {
    need(ctx, 2, "un ajustement de stock");
    const i = z.object({ part_id: id, counted: z.coerce.number().finite().min(0).max(1e6).transform(round2), reason: req(200, "Motif"), idem }).parse(raw);
    const part = await must<Part>(ctx, "part", i.part_id, "Pièce");
    if (part.data.qty === i.counted) throw new OpError(409, "Aucun écart avec le stock enregistré.");
    const m = await stockMove(ctx, { part_id: i.part_id, delta: 0, setQty: i.counted, type: "ajustement", reason: i.reason, op_key: `adj:${i.idem}` });
    return ok(m ? `Stock ajusté à ${i.counted} (écart ${m.data.qty > 0 ? "+" : ""}${m.data.qty}).` : "Ajustement déjà enregistré.", { duplicate: !m });
  },

  async "supplier.save"(ctx, raw) {
    need(ctx, 2, "la gestion des fournisseurs");
    const i = z.object({ id: optId, name: req(120, "Nom"), contact: txt(120).default(""), phone: txt(30).default(""), email: z.union([z.string().trim().toLowerCase().email("E-mail invalide").max(120), z.literal("")]).default(""), address: txt(200).default(""), notes: txt(1000).default(""), active: z.boolean().default(true) }).parse(raw);
    const { id: sid, ...data } = i;
    if (sid) {
      await mutate<Supplier>(ctx, "supplier", sid, "Fournisseur", () => data);
      return ok("Fournisseur mis à jour.", { id: sid });
    }
    const d = await ctx.store.insert("supplier", data);
    return ok("Fournisseur enregistré.", { id: d.id });
  },

  async "po.save"(ctx, raw) {
    need(ctx, 2, "la gestion des commandes d'achat");
    const i = z.object({ id: optId, supplier_id: id, lines: z.array(z.object({ id: z.string().max(64).optional(), part_id: id, qty, unit_cost: optMoney })).min(1, "Ajoutez au moins une pièce").max(60), extra_costs: money.default(0), note: txt(1000).default("") }).parse(raw);
    await must(ctx, "supplier", i.supplier_id, "Fournisseur");
    for (const l of i.lines) await must(ctx, "part", l.part_id, "Pièce");
    const lines = i.lines.map((l) => ({ id: l.id || newId(ctx), part_id: l.part_id, qty: l.qty, received_qty: 0, unit_cost: l.unit_cost }));
    if (i.id) {
      await mutate<Po>(ctx, "po", i.id, "Commande", (p) => {
        if (p.status !== "brouillon") throw new OpError(409, "Seule une commande en brouillon est modifiable.");
        return { ...p, supplier_id: i.supplier_id, lines, extra_costs: i.extra_costs, note: i.note };
      });
      return ok("Commande modifiée.", { id: i.id });
    }
    const po: Po = { number: await number(ctx, "BC"), supplier_id: i.supplier_id, lines, extra_costs: i.extra_costs, note: i.note, status: "brouillon", history: [hist(ctx, null, "brouillon")], receptions: [] };
    const d = await ctx.store.insert("po", po);
    return ok(`Commande ${po.number} créée en brouillon (rien n'est envoyé ni reçu automatiquement).`, { id: d.id });
  },

  async "po.status"(ctx, raw) {
    need(ctx, 2, "la gestion des commandes d'achat");
    const i = z.object({ id, to: z.enum(["commandee", "annulee"]), note: txt(300).default("") }).parse(raw);
    await mutate<Po>(ctx, "po", i.id, "Commande", (p) => {
      if (p.status === i.to) return null;
      const allowed = i.to === "commandee" ? ["brouillon"] : ["brouillon", "commandee", "partielle"];
      if (!allowed.includes(p.status)) throw new OpError(409, "Changement impossible pour cette commande.");
      return { ...p, status: i.to, history: [...p.history, hist(ctx, p.status, i.to, i.note)] };
    });
    return ok(i.to === "commandee" ? "Commande marquée comme passée au fournisseur." : "Commande annulée.");
  },

  async "po.receive"(ctx, raw) {
    need(ctx, 2, "la réception d'une commande");
    const i = z.object({ id, lines: z.array(z.object({ part_id: id, qty: z.coerce.number().finite().min(0).max(1e6).transform(round2), unit_cost: optMoney })).min(1), extra_costs: money.default(0), record_expense: z.boolean().default(true), idem }).parse(raw);
    const received = i.lines.filter((l) => l.qty > 0);
    if (!received.length) throw new OpError(422, "Indiquez au moins une quantité reçue.");
    const opKey = `po:${i.id}:${i.idem}`;
    let already = false;
    const { doc } = await mutate<Po>(ctx, "po", i.id, "Commande", (p) => {
      if (p.receptions.some((r) => r.op_key === opKey)) {
        already = true;
        return null;
      }
      if (!["commandee", "partielle"].includes(p.status)) throw new OpError(409, "Marquez d'abord la commande comme passée ; une commande annulée ou reçue ne peut plus être réceptionnée.");
      const lines = p.lines.map((l) => ({ ...l }));
      for (const r of received) {
        const line = lines.find((l) => l.part_id === r.part_id && l.received_qty < l.qty);
        if (!line) throw new OpError(422, "Une pièce reçue ne figure pas dans la commande (ou est déjà entièrement reçue).");
        if (round2(line.received_qty + r.qty) > line.qty) throw new OpError(422, `Quantité reçue supérieure à la quantité commandée (reste ${round2(line.qty - line.received_qty)}).`);
        line.received_qty = round2(line.received_qty + r.qty);
        if (r.unit_cost !== null) line.unit_cost = r.unit_cost;
      }
      const complete = lines.every((l) => l.received_qty >= l.qty);
      const status = complete ? "recue" : "partielle";
      return { ...p, lines, status, history: [...p.history, hist(ctx, p.status, status)], receptions: [...p.receptions, { at: nowIso(ctx), by: ctx.actor.id, lines: received, extra_costs: i.extra_costs, op_key: opKey }] };
    });
    if (already) return ok("Réception déjà enregistrée.", { duplicate: true });
    for (const [k, r] of received.entries())
      await stockMove(ctx, { part_id: r.part_id, delta: r.qty, type: "reception", reason: `Réception commande ${doc.data.number}`, op_key: `${opKey}:${k}`, po_id: i.id, unit_cost: r.unit_cost, patch: r.unit_cost !== null ? { buy_price: r.unit_cost, supplier_id: doc.data.supplier_id } : { supplier_id: doc.data.supplier_id } });
    const amount = received.reduce((a, r) => a + Math.round(r.qty * (r.unit_cost ?? 0)), 0) + i.extra_costs;
    if (i.record_expense && amount > 0) {
      const exp: Expense = { date: today(ctx.now?.()), category: "Achats de pièces", amount, description: `Réception commande ${doc.data.number}${received.some((r) => r.unit_cost === null) ? " (certaines lignes sans coût)" : ""}`, zone: "garage", reference: doc.data.number, source: { type: "po", id: i.id }, deleted: null, idem: opKey };
      if (!(await findBy<Expense>(ctx, "expense", (e) => e.idem === opKey))) await ctx.store.insert("expense", exp);
    }
    return ok(`Réception enregistrée : stock mis à jour${i.record_expense && amount > 0 ? `, dépense de ${amount.toLocaleString("fr-FR")} FCFA ajoutée` : ""}.`);
  },

  // ----- Bureau -----
  async "expense.save"(ctx, raw) {
    need(ctx, 2, "l'enregistrement des dépenses");
    const i = z.object({ id: optId, date, category: req(60, "Catégorie"), amount: money.refine((n) => n > 0, "Montant supérieur à 0 attendu"), description: txt(500).default(""), zone: z.enum(["garage", "salle_repos"]).default("garage"), reference: txt(120).default(""), idem: idem.optional() }).parse(raw);
    if (i.date > today(ctx.now?.())) throw new OpError(422, "Une dépense ne peut pas être datée dans le futur.");
    const data = { date: i.date, category: i.category, amount: i.amount, description: i.description, zone: i.zone, reference: i.reference };
    if (i.id) {
      await mutate<Expense>(ctx, "expense", i.id, "Dépense", (e) => {
        if (e.deleted) throw new OpError(409, "Dépense supprimée.");
        return { ...e, ...data };
      });
      return ok("Dépense modifiée.", { id: i.id });
    }
    const key = i.idem ?? newId(ctx);
    const dup = await findBy<Expense>(ctx, "expense", (e) => e.idem === key);
    if (dup) return ok("Dépense déjà enregistrée.", { id: dup.id, duplicate: true });
    const d = await ctx.store.insert("expense", { ...data, source: null, deleted: null, idem: key } satisfies Expense);
    return ok("Dépense enregistrée.", { id: d.id });
  },

  async "expense.delete"(ctx, raw) {
    need(ctx, 2, "la suppression d'une dépense");
    const i = z.object({ id, reason: req(300, "Motif") }).parse(raw);
    await mutate<Expense>(ctx, "expense", i.id, "Dépense", (e) => (e.deleted ? null : { ...e, deleted: { at: nowIso(ctx), by: ctx.actor.id, reason: i.reason } }));
    return ok("Dépense retirée des calculs (conservée dans l'historique).");
  },

  async "task.save"(ctx, raw) {
    need(ctx, 1, "la création d'une tâche");
    const i = z.object({ id: optId, zone: z.enum(["salle_repos", "garage"]).default("salle_repos"), kind: z.enum(TASK_KINDS), title: req(160, "Titre"), description: txt(1000).default(""), assignee_id: optId, due: optDate, equipment_id: optId }).parse(raw);
    member(ctx, i.assignee_id, "La personne choisie");
    if (i.equipment_id) await must(ctx, "equip", i.equipment_id, "Équipement");
    if (i.id) {
      await mutate<Task>(ctx, "task", i.id, "Tâche", (t) => {
        if (t.created_by !== ctx.actor.id) need(ctx, 2, "la modification de la tâche d'un autre membre");
        if (i.assignee_id !== t.assignee_id) need(ctx, 2, "l'attribution d'une tâche");
        const keepEquip = !("equipment_id" in (raw as object));
        return { ...t, kind: i.kind, title: i.title, description: i.description, assignee_id: i.assignee_id, due: i.due, equipment_id: keepEquip ? t.equipment_id : i.equipment_id };
      });
      return ok("Tâche modifiée.", { id: i.id });
    }
    if (i.assignee_id) need(ctx, 2, "l'attribution d'une tâche");
    const t: Task = { zone: i.zone, kind: i.kind, title: i.title, description: i.description, assignee_id: i.assignee_id, due: i.due, status: "a_faire", done_at: null, cost: null, equipment_id: i.equipment_id, history: [hist(ctx, null, "a_faire")], created_by: ctx.actor.id };
    const d = await ctx.store.insert("task", t);
    return ok(i.assignee_id ? "Tâche créée et attribuée." : LEVEL[ctx.actor.role] >= 2 ? "Tâche créée (non attribuée)." : "Tâche créée : un gérant peut maintenant l'attribuer.", { id: d.id });
  },

  async "task.status"(ctx, raw) {
    need(ctx, 1, "le suivi d'une tâche");
    const i = z.object({ id, to: z.enum(["a_faire", "en_cours", "fait", "annule"]), cost: optMoney, record_expense: z.boolean().default(false), note: txt(300).default("") }).parse(raw);
    if (i.to === "annule" || i.record_expense) need(ctx, 2, i.to === "annule" ? "l'annulation d'une tâche" : "l'enregistrement d'une dépense");
    const { doc } = await mutate<Task>(ctx, "task", i.id, "Tâche", (t) => {
      if (t.assignee_id !== ctx.actor.id && LEVEL[ctx.actor.role] < 2) throw new OpError(403, "Seule la personne chargée de la tâche ou un gérant peut changer son statut.");
      if (t.status === i.to && i.cost === null) return null;
      return { ...t, status: i.to, done_at: i.to === "fait" ? nowIso(ctx) : null, cost: i.cost ?? t.cost, history: t.status === i.to ? t.history : [...t.history, hist(ctx, t.status, i.to, i.note)] };
    });
    if (i.to === "fait" && doc.data.equipment_id && doc.data.kind === "reparation") await mutate<Equip>(ctx, "equip", doc.data.equipment_id, "Équipement", (e) => (e.condition === "bon" ? null : { ...e, condition: "bon" }));
    if (i.record_expense && i.cost && i.cost > 0) {
      const key = `task:${i.id}`;
      if (!(await findBy<Expense>(ctx, "expense", (e) => e.idem === key))) await ctx.store.insert("expense", { date: today(ctx.now?.()), category: doc.data.kind === "reparation" ? "Entretien" : "Autre", amount: i.cost, description: doc.data.title, zone: doc.data.zone, reference: "", source: { type: "task", id: i.id }, deleted: null, idem: key } satisfies Expense);
    }
    return ok(i.to === "fait" ? "Tâche terminée." : "Statut de la tâche mis à jour.");
  },

  // ----- Salle de repos -----
  async "equip.save"(ctx, raw) {
    need(ctx, 2, "l'inventaire des équipements");
    const i = z.object({ id: optId, name: req(120, "Nom"), qty: z.coerce.number().int().min(0).max(10000), condition: z.enum(EQUIP_CONDITIONS), notes: txt(500).default("") }).parse(raw);
    const { id: eid, ...data } = i;
    if (eid) {
      await mutate<Equip>(ctx, "equip", eid, "Équipement", () => data);
      return ok("Équipement mis à jour.", { id: eid });
    }
    const d = await ctx.store.insert("equip", data);
    return ok("Équipement enregistré.", { id: d.id });
  },

  async "equip.report"(ctx, raw) {
    need(ctx, 1, "le signalement d'une panne");
    const i = z.object({ id, condition: z.enum(["endommage", "panne"]), note: txt(500).default("") }).parse(raw);
    const { doc } = await mutate<Equip>(ctx, "equip", i.id, "Équipement", (e) => ({ ...e, condition: i.condition }));
    const t: Task = { zone: "salle_repos", kind: "reparation", title: `Réparer : ${doc.data.name}`.slice(0, 160), description: i.note, assignee_id: null, due: null, status: "a_faire", done_at: null, cost: null, equipment_id: i.id, history: [hist(ctx, null, "a_faire", "Panne signalée")], created_by: ctx.actor.id };
    const d = await ctx.store.insert("task", t);
    return ok("Panne signalée : une tâche de réparation a été créée.", { id: d.id });
  },

  async "supply.save"(ctx, raw) {
    need(ctx, 2, "la gestion des fournitures");
    const i = z.object({ id: optId, name: req(120, "Nom"), unit: req(20, "Unité"), min_qty: z.coerce.number().finite().min(0).max(1e6).transform(round2), initial_qty: z.coerce.number().finite().min(0).max(1e6).optional() }).parse(raw);
    if (i.id) {
      await mutate<Supply>(ctx, "supply", i.id, "Fourniture", (s) => ({ ...s, name: i.name, unit: i.unit, min_qty: i.min_qty }));
      return ok("Fourniture mise à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("supply", { name: i.name, unit: i.unit, qty: 0, min_qty: i.min_qty, last_cost: null, op_keys: [] } satisfies Supply);
    if (i.initial_qty) await supplyMoveApply(ctx, d.id, round2(i.initial_qty), "Quantité initiale comptée", `init:${d.id}`, null);
    return ok("Fourniture ajoutée.", { id: d.id });
  },

  async "supply.move"(ctx, raw) {
    need(ctx, 1, "le suivi des fournitures");
    const i = z.object({ id, qty: z.coerce.number().finite().refine((n) => n !== 0 && Math.abs(n) <= 1e6, "Quantité invalide").transform(round2), reason: txt(200).default(""), cost: optMoney, record_expense: z.boolean().default(false), idem }).parse(raw);
    if (i.record_expense) need(ctx, 2, "l'enregistrement d'un achat en dépense");
    const m = await supplyMoveApply(ctx, i.id, i.qty, i.reason || (i.qty > 0 ? "Entrée" : "Sortie"), `sm:${i.idem}`, i.qty > 0 ? i.cost : null);
    if (!m) return ok("Mouvement déjà enregistré.", { duplicate: true });
    if (i.record_expense && i.qty > 0 && i.cost && i.cost > 0) {
      const s = await must<Supply>(ctx, "supply", i.id, "Fourniture");
      await ctx.store.insert("expense", { date: today(ctx.now?.()), category: "Fournitures", amount: i.cost, description: `Achat : ${s.data.name} (${i.qty} ${s.data.unit})`, zone: "salle_repos", reference: "", source: { type: "supply", id: m.id }, deleted: null, idem: `sm:${i.idem}` } satisfies Expense);
    }
    return ok(`${i.qty > 0 ? "Entrée" : "Sortie"} enregistrée : il reste ${m.data.balance_after}.`);
  },

  async "locker.save"(ctx, raw) {
    need(ctx, 2, "la gestion des casiers");
    const i = z.object({ id: optId, number: req(20, "Numéro"), assignee_id: optId, status: z.enum(["libre", "attribue", "hors_service"]), note: txt(300).default("") }).parse(raw);
    member(ctx, i.assignee_id, "La personne choisie");
    const status = i.assignee_id && i.status === "libre" ? "attribue" : i.status;
    const dup = await findBy<Locker>(ctx, "locker", (l) => l.number.toLowerCase() === i.number.toLowerCase());
    if (dup && dup.id !== i.id) throw new OpError(409, `Le casier ${i.number} existe déjà.`);
    const data: Locker = { number: i.number, assignee_id: status === "attribue" ? i.assignee_id : null, status, note: i.note };
    if (i.id) {
      await mutate<Locker>(ctx, "locker", i.id, "Casier", () => data);
      return ok("Casier mis à jour.", { id: i.id });
    }
    const d = await ctx.store.insert("locker", data);
    return ok("Casier ajouté.", { id: d.id });
  },

  async "settings.save"(ctx, raw) {
    need(ctx, 2, "l'organisation de la salle de repos");
    const n = z.union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(10000)]).optional().transform((v) => (v === "" || v === undefined ? null : v));
    const i = z.object({ capacity: n, seats: n, rules: z.array(z.object({ id: z.string().max(64).optional(), text: req(300, "Règle") })).max(30) }).parse(raw);
    const data: Settings = { capacity: i.capacity, seats: i.seats, rules: i.rules.map((r) => ({ id: r.id || newId(ctx), text: r.text })) };
    const existing = (await ctx.store.list("settings"))[0];
    if (existing) await mutate<Settings>(ctx, "settings", existing.id, "Paramètres", () => data);
    else await ctx.store.insert("settings", data);
    return ok("Organisation de la salle de repos enregistrée.");
  },
};

/** Prélève une ligne de pièce d'un dossier : stock diminué une seule fois, mouvement lié au dossier. */
async function consumeLine(ctx: OpContext, jobId: string, lineId: string): Promise<OpResult> {
  let line: PartLine | undefined;
  let ref = "";
  const { written } = await mutate<Job>(ctx, "job", jobId, "Dossier", (j) => {
    editable(j);
    line = j.parts.find((p) => p.id === lineId);
    ref = j.ref;
    if (!line) throw new OpError(404, "Ligne de pièce introuvable.");
    if (line.consumed) return null;
    return { ...j, parts: j.parts.map((p) => (p.id === lineId ? { ...p, consumed: true, consumed_at: nowIso(ctx) } : p)) };
  });
  if (!written) return ok("Cette pièce a déjà été prélevée du stock pour ce dossier.", { duplicate: true });
  try {
    const m = await stockMove(ctx, { part_id: line!.part_id, delta: -line!.qty, type: "utilisation", reason: `Utilisée sur le dossier ${ref}`, op_key: `use:${jobId}:${lineId}`, job_id: jobId, unit_cost: line!.unit_cost });
    if (m) await mutate<Job>(ctx, "job", jobId, "Dossier", (j) => ({ ...j, parts: j.parts.map((p) => (p.id === lineId ? { ...p, move_id: m.id } : p)) }));
    return ok(`${line!.qty} × ${line!.label} prélevé(s) du stock et lié(s) au dossier ${ref}.`);
  } catch (e) {
    await mutate<Job>(ctx, "job", jobId, "Dossier", (j) => ({ ...j, parts: j.parts.map((p) => (p.id === lineId ? { ...p, consumed: false, consumed_at: null } : p)) }));
    throw e;
  }
}

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
