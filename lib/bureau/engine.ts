import { z } from "zod";
import { BUREAU_OP_PERMS, opDenied } from "../op-perms";
import type { Permission } from "../team";
import {
  AGENCY_TYPE_IDS,
  APPT_KIND,
  APPT_STATUS,
  ATTENDANCE_STATUS,
  CLIENT_STATUS,
  CONTRACT_STATUS,
  CURRENCIES,
  DOC_CATEGORIES,
  EQUIP_KINDS,
  EQUIP_STATE,
  INTERACTION_TYPES,
  LEVEL,
  PAY_METHODS,
  PRIORITIES,
  PROJECT_STATUS,
  QUOTE_STATUS,
  SECTOR_MODULES,
  TASK_STATUS,
  TX_CATEGORIES,
  balanceOf,
  dmChannel,
  docTotals,
  enabledSectorKeys,
  overlaps,
  paidOf,
  round2,
  settingsOf,
  today,
  type Appointment,
  type Attendance,
  type BureauRole,
  type Client,
  type Col,
  type Comment,
  type Contract,
  type Doc,
  type Document,
  type Employee,
  type Equipment,
  type FileDoc,
  type Interaction,
  type Invoice,
  type Message,
  type Project,
  type Quote,
  type SectorRecord,
  type Settings,
  type Task,
  type Transaction,
} from "./model";

/**
 * Moteur des opérations de MiniSoft Bureau. Chaque opération vérifie le rôle et le poste, valide
 * les données, applique les règles métier et n'écrit qu'à travers le `BureauStore` : mises à jour
 * conditionnelles (`cas`), numéros uniques, paiements et pièces jointes sans doublon.
 */

export interface BureauStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  nextSeq(key: string): Promise<number>;
}

export type OpContext = { store: BureauStore; actor: { id: string; role: BureauRole }; perms?: Permission[] | null; /** Identifiants des membres de l'équipe (participants, responsables, messages privés). */ members: string[]; now?: () => Date; uuid?: () => string };
export type OpResult = { message: string; id?: string; number?: string; data?: unknown };

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
const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Date et heure invalides");
const amt = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform(round2);
const pos = z.coerce.number().finite().positive("Montant supérieur à 0 attendu").max(1e12).transform(round2);
const optAmt = z.union([z.literal(""), z.null(), amt]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const oneOf = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);

const nowIso = (c: OpContext) => (c.now?.() ?? new Date()).toISOString();
const newId = (c: OpContext) => (c.uuid ?? (() => crypto.randomUUID()))();
const year = (c: OpContext) => (c.now?.() ?? new Date()).getFullYear();
const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, ...extra });
const isMgr = (c: OpContext) => LEVEL[c.actor.role] >= 2;

async function number(c: OpContext, prefix: string) {
  const n = await c.store.nextSeq(`${prefix}-${year(c)}`);
  return `${prefix}-${year(c)}-${String(n).padStart(4, "0")}`;
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
const settings = async (c: OpContext): Promise<{ doc: Doc | null; s: Settings }> => {
  const doc = (await c.store.list("settings"))[0] ?? null;
  return { doc, s: settingsOf(doc ?? undefined) };
};
const member = (c: OpContext, uid: string | null, label = "La personne choisie") => {
  if (uid && !c.members.includes(uid)) throw new OpError(422, `${label} ne fait pas partie de l'équipe de ce logiciel.`);
  return uid;
};
const needMgr = (c: OpContext, what: string) => {
  if (!isMgr(c)) throw new OpError(403, `Seul le directeur, un administrateur ou le propriétaire peut ${what}.`);
};
async function ensure(c: OpContext, col: Col, docId: string | null, label: string) {
  if (docId) await must(c, col, docId, label);
}

const lineIn = z.object({ desc: req(300, "Description"), qty: z.coerce.number().finite().positive("Quantité supérieure à 0").max(1e6).transform(round2), unit_price: amt });
const docBase = { client_id: optId, items: z.array(lineIn).min(1, "Ajoutez au moins une ligne").max(100), tax_rate: z.coerce.number().min(0).max(100).default(0), discount: amt.default(0), note: txt(600) };

// ---------- Projets : accès d'un employé limité aux siens ----------
const inProject = (p: Project, uid: string) => p.owner === uid || p.members.includes(uid) || p.created_by === uid;

const HANDLERS: Record<string, (c: OpContext, raw: unknown) => Promise<OpResult>> = {
  async "settings.save"(c, raw) {
    const i = z
      .object({
        name: req(80, "Nom de l'entreprise"),
        agency_type: z.enum(AGENCY_TYPE_IDS as [string, ...string[]]),
        sector: txt(80),
        employees_count: z.coerce.number().int().min(1).max(100000).default(1),
        offices_count: z.coerce.number().int().min(1).max(1000).default(1),
        address: txt(200),
        phone: txt(30),
        email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""),
        logo_id: optId,
        currency: z.enum(Object.keys(CURRENCIES) as [string, ...string[]]),
        primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
        tax_rate: z.coerce.number().min(0).max(100).default(0),
        invoice_note: txt(300),
        modules: z.record(z.string().max(40), z.boolean()).default({}),
        spaces: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{2,30}$/), name: req(40, "Nom de l'espace"), kind: z.enum(["reception", "desk", "meeting", "stock", "counter", "cashier"]), links: z.array(z.string().max(20)).max(8), enabled: z.boolean() })).min(1).max(12),
      })
      .parse(raw);
    const { doc } = await settings(c);
    if (doc) await mutate<Settings>(c, "settings", doc.id, "Réglages", (cur) => ({ ...cur, ...i }) as unknown as Settings);
    else await c.store.insert("settings", i);
    return ok("Configuration enregistrée.");
  },

  // ----- Clients -----
  async "client.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom"), kind: z.enum(["particulier", "entreprise"]).default("particulier"), contact: txt(120), phone: txt(30), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""), address: txt(200), status: oneOf(CLIENT_STATUS).default("prospect"), notes: txt(2000) }).parse(raw);
    const data = { name: i.name, kind: i.kind, contact: i.contact, phone: i.phone, email: i.email, address: i.address, status: i.status, notes: i.notes } as Client;
    if (i.id) {
      await mutate<Client>(c, "client", i.id, "Client", () => data);
      return ok("Client modifié.", { id: i.id });
    }
    const d = await c.store.insert("client", data);
    return ok("Client ajouté.", { id: d.id });
  },
  async "client.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const [pr, qu, iv, ct, ap] = await Promise.all((["project", "quote", "invoice", "contract", "appointment"] as Col[]).map((k) => c.store.list(k)));
    const used = [...(pr ?? []), ...(qu ?? []), ...(iv ?? []), ...(ct ?? []), ...(ap ?? [])].some((d) => (d.data as { client_id?: string }).client_id === i.id);
    if (used) throw new OpError(409, "Ce client a des projets, documents ou rendez-vous : passez son statut à « Archivé » plutôt que de le supprimer.");
    for (const it of (await c.store.list("interaction")) as Doc<Interaction>[]) if (it.data.client_id === i.id) await c.store.remove("interaction", it.id);
    await c.store.remove("client", i.id);
    return ok("Client supprimé.");
  },
  async "interaction.add"(c, raw) {
    const i = z.object({ client_id: id, type: oneOf(INTERACTION_TYPES), text: req(2000, "Texte"), at: dt.optional() }).parse(raw);
    await must(c, "client", i.client_id, "Client");
    const d = await c.store.insert("interaction", { client_id: i.client_id, type: i.type, text: i.text, at: i.at ?? nowIso(c), by: c.actor.id } satisfies Interaction);
    return ok("Interaction enregistrée.", { id: d.id });
  },
  async "interaction.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const d = await must<Interaction>(c, "interaction", i.id, "Interaction");
    if (!isMgr(c) && d.data.by !== c.actor.id) throw new OpError(403, "Vous ne pouvez supprimer que vos propres interactions.");
    await c.store.remove("interaction", i.id);
    return ok("Interaction supprimée.");
  },

  // ----- Projets et tâches -----
  async "project.save"(c, raw) {
    needMgr(c, "créer ou modifier un projet");
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom du projet"), client_id: optId, owner: optId, members: z.array(id).max(50).default([]), start: optDate, due: optDate, status: oneOf(PROJECT_STATUS).default("planifie"), progress: z.coerce.number().min(0).max(100).default(0), budget: optAmt, description: txt(2000) }).parse(raw);
    if (i.start && i.due && i.due < i.start) throw new OpError(422, "La date limite est avant le début du projet.");
    await ensure(c, "client", i.client_id, "Client");
    member(c, i.owner, "Le responsable");
    for (const m of i.members) member(c, m, "Un collaborateur");
    const base = { name: i.name, client_id: i.client_id, owner: i.owner, members: [...new Set(i.members)], start: i.start, due: i.due, status: i.status, progress: Math.round(i.progress), budget: i.budget, description: i.description };
    if (i.id) {
      await mutate<Project>(c, "project", i.id, "Projet", (p) => ({ ...p, ...base }));
      return ok("Projet modifié.", { id: i.id });
    }
    const d = await c.store.insert("project", { ...base, created_by: c.actor.id } satisfies Project);
    return ok("Projet créé.", { id: d.id });
  },
  async "project.status"(c, raw) {
    const i = z.object({ id, status: oneOf(PROJECT_STATUS) }).parse(raw);
    const p = await must<Project>(c, "project", i.id, "Projet");
    if (!isMgr(c) && p.data.owner !== c.actor.id) throw new OpError(403, "Seul le responsable du projet ou la direction peut changer son statut.");
    await mutate<Project>(c, "project", i.id, "Projet", (x) => ({ ...x, status: i.status }));
    return ok("Statut du projet mis à jour.");
  },
  async "project.delete"(c, raw) {
    needMgr(c, "supprimer un projet");
    const i = z.object({ id }).parse(raw);
    await must(c, "project", i.id, "Projet");
    for (const t of (await c.store.list("task")) as Doc<Task>[]) if (t.data.project_id === i.id) await c.store.remove("task", t.id);
    for (const cm of (await c.store.list("comment")) as Doc<Comment>[]) if ((cm.data.target === "project" && cm.data.target_id === i.id)) await c.store.remove("comment", cm.id);
    for (const d of (await c.store.list("document")) as Doc<Document>[]) if (d.data.project_id === i.id) await mutate<Document>(c, "document", d.id, "Document", (x) => ({ ...x, project_id: null }));
    await c.store.remove("project", i.id);
    return ok("Projet supprimé avec ses tâches et commentaires.");
  },
  async "task.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), project_id: optId, title: req(160, "Titre"), description: txt(2000), assignee: optId, due: optDate, status: oneOf(TASK_STATUS).default("a_faire"), priority: oneOf(PRIORITIES).default("normale") }).parse(raw);
    member(c, i.assignee, "La personne assignée");
    let project: Doc<Project> | null = null;
    if (i.project_id) project = await must<Project>(c, "project", i.project_id, "Projet");
    if (!isMgr(c)) {
      // Un employé gère ses propres tâches, dans ses projets.
      if (project && !inProject(project.data, c.actor.id)) throw new OpError(403, "Ce projet ne fait pas partie de vos projets.");
      if (i.assignee && i.assignee !== c.actor.id) throw new OpError(403, "Vous ne pouvez vous assigner que vos propres tâches : demandez au responsable du projet.");
    }
    const base = { project_id: i.project_id, title: i.title, description: i.description, assignee: i.assignee, due: i.due, status: i.status, priority: i.priority };
    if (i.id) {
      await mutate<Task>(c, "task", i.id, "Tâche", (t) => {
        if (!isMgr(c) && t.created_by !== c.actor.id && t.assignee !== c.actor.id) throw new OpError(403, "Cette tâche ne vous est pas attribuée.");
        return { ...t, ...base, done_at: i.status === "termine" ? (t.done_at ?? nowIso(c)) : null };
      });
      return ok("Tâche modifiée.", { id: i.id });
    }
    const d = await c.store.insert("task", { ...base, done_at: i.status === "termine" ? nowIso(c) : null, created_by: c.actor.id } satisfies Task);
    return ok("Tâche créée.", { id: d.id });
  },
  async "task.status"(c, raw) {
    const i = z.object({ id, status: oneOf(TASK_STATUS) }).parse(raw);
    await mutate<Task>(c, "task", i.id, "Tâche", (t) => {
      if (!isMgr(c) && t.assignee !== c.actor.id && t.created_by !== c.actor.id) throw new OpError(403, "Vous ne pouvez changer que le statut de vos tâches.");
      return { ...t, status: i.status, done_at: i.status === "termine" ? (t.done_at ?? nowIso(c)) : null };
    });
    return ok("Tâche mise à jour.");
  },
  async "task.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const t = await must<Task>(c, "task", i.id, "Tâche");
    if (!isMgr(c) && t.data.created_by !== c.actor.id) throw new OpError(403, "Seul le créateur de la tâche ou la direction peut la supprimer.");
    for (const cm of (await c.store.list("comment")) as Doc<Comment>[]) if (cm.data.target === "task" && cm.data.target_id === i.id) await c.store.remove("comment", cm.id);
    await c.store.remove("task", i.id);
    return ok("Tâche supprimée.");
  },
  async "comment.add"(c, raw) {
    const i = z.object({ target: z.enum(["project", "task", "client"]), target_id: id, text: req(2000, "Commentaire") }).parse(raw);
    if (i.target === "client") await must(c, "client", i.target_id, "Client");
    else {
      const pid = i.target === "project" ? i.target_id : (await must<Task>(c, "task", i.target_id, "Tâche")).data.project_id;
      const p = i.target === "project" ? await must<Project>(c, "project", i.target_id, "Projet") : pid ? await must<Project>(c, "project", pid, "Projet") : null;
      if (!isMgr(c) && p && !inProject(p.data, c.actor.id)) throw new OpError(403, "Ce projet ne fait pas partie de vos projets.");
    }
    const d = await c.store.insert("comment", { target: i.target, target_id: i.target_id, text: i.text, by: c.actor.id, at: nowIso(c) } satisfies Comment);
    return ok("Commentaire ajouté.", { id: d.id });
  },
  async "comment.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const d = await must<Comment>(c, "comment", i.id, "Commentaire");
    if (!isMgr(c) && d.data.by !== c.actor.id) throw new OpError(403, "Vous ne pouvez supprimer que vos propres commentaires.");
    await c.store.remove("comment", i.id);
    return ok("Commentaire supprimé.");
  },

  // ----- Personnel -----
  async "employee.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom"), position: txt(80), phone: txt(30), email: z.union([z.literal(""), z.string().trim().email("E-mail invalide").max(120)]).default(""), hired: optDate, user_id: optId, status: z.enum(["actif", "conge", "parti"]).default("actif"), notes: txt(1000) }).parse(raw);
    member(c, i.user_id, "Le compte choisi");
    const all = (await c.store.list("employee")) as Doc<Employee>[];
    if (i.user_id && all.some((e) => e.id !== i.id && e.data.user_id === i.user_id)) throw new OpError(409, "Ce compte est déjà lié à une autre fiche employé.");
    const data = { name: i.name, position: i.position, phone: i.phone, email: i.email, hired: i.hired, user_id: i.user_id, status: i.status, notes: i.notes } as Employee;
    if (i.id) {
      await mutate<Employee>(c, "employee", i.id, "Employé", () => data);
      return ok("Employé modifié.", { id: i.id });
    }
    const d = await c.store.insert("employee", data);
    return ok("Employé ajouté.", { id: d.id });
  },
  async "employee.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await must(c, "employee", i.id, "Employé");
    const eq = ((await c.store.list("equipment")) as Doc<Equipment>[]).filter((e) => e.data.assigned_to === i.id);
    if (eq.length) throw new OpError(409, `Cet employé a ${eq.length} équipement(s) attribué(s) : reprenez-les d'abord.`);
    for (const a of (await c.store.list("attendance")) as Doc<Attendance>[]) if (a.data.employee_id === i.id) await c.store.remove("attendance", a.id);
    await c.store.remove("employee", i.id);
    return ok("Employé supprimé.");
  },
  async "attendance.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), employee_id: id, date, status: oneOf(ATTENDANCE_STATUS), in: z.string().regex(/^\d{2}:\d{2}$/).nullish().transform((v) => v || null), out: z.string().regex(/^\d{2}:\d{2}$/).nullish().transform((v) => v || null), note: txt(300) }).parse(raw);
    await must(c, "employee", i.employee_id, "Employé");
    const all = (await c.store.list("attendance")) as Doc<Attendance>[];
    const dup = all.find((a) => a.id !== i.id && a.data.employee_id === i.employee_id && a.data.date === i.date);
    const data = { employee_id: i.employee_id, date: i.date, status: i.status, in: i.in, out: i.out, note: i.note, by: c.actor.id } as Attendance;
    const target = i.id ?? dup?.id;
    if (target) {
      await mutate<Attendance>(c, "attendance", target, "Présence", () => data);
      return ok("Présence mise à jour.", { id: target });
    }
    const d = await c.store.insert("attendance", data);
    return ok("Présence enregistrée.", { id: d.id });
  },
  async "attendance.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await c.store.remove("attendance", i.id);
    return ok("Présence supprimée.");
  },
  /** Pointage de la personne connectée (arrivée puis départ) ; sa fiche employé doit être liée à son compte. */
  async "attendance.checkin"(c) {
    const emp = ((await c.store.list("employee")) as Doc<Employee>[]).find((e) => e.data.user_id === c.actor.id);
    if (!emp) throw new OpError(409, "Votre fiche employé n'est pas liée à votre compte : demandez au directeur de la relier (page Personnel).");
    const day = today(c.now?.() ?? new Date());
    const hhmm = nowIso(c).slice(11, 16);
    const cur = ((await c.store.list("attendance")) as Doc<Attendance>[]).find((a) => a.data.employee_id === emp.id && a.data.date === day);
    if (!cur) {
      await c.store.insert("attendance", { employee_id: emp.id, date: day, status: "present", in: hhmm, out: null, note: "", by: c.actor.id } satisfies Attendance);
      return ok(`Arrivée enregistrée à ${hhmm}.`);
    }
    if (cur.data.out) return ok(`Départ déjà enregistré à ${cur.data.out}.`);
    await mutate<Attendance>(c, "attendance", cur.id, "Présence", (a) => ({ ...a, out: hhmm }));
    return ok(`Départ enregistré à ${hhmm}.`);
  },

  // ----- Agenda -----
  async "appointment.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), title: req(160, "Titre"), kind: oneOf(APPT_KIND).default("rdv"), start: dt, end: dt, client_id: optId, location: txt(160), participants: z.array(id).max(50).default([]), status: oneOf(APPT_STATUS).default("prevu"), reminder_min: z.coerce.number().int().min(0).max(10080).default(30), notes: txt(2000) }).parse(raw);
    if (i.end <= i.start) throw new OpError(422, "La fin doit être après le début.");
    await ensure(c, "client", i.client_id, "Client");
    for (const m of i.participants) member(c, m, "Un participant");
    const all = (await c.store.list("appointment")) as Doc<Appointment>[];
    const conflicts = all.filter((a) => a.id !== i.id && a.data.status !== "annule" && a.data.participants.some((p) => i.participants.includes(p)) && overlaps(a.data, i)).map((a) => a.data.title);
    const base = { title: i.title, kind: i.kind, start: i.start, end: i.end, client_id: i.client_id, location: i.location, participants: [...new Set(i.participants)], status: i.status, reminder_min: i.reminder_min, notes: i.notes };
    const conflictNote = conflicts.length ? ` Attention : un participant a déjà « ${conflicts[0]} » à ce moment.` : "";
    if (i.id) {
      await mutate<Appointment>(c, "appointment", i.id, "Rendez-vous", (a) => ({ ...a, ...base }));
      return ok(`Rendez-vous modifié.${conflictNote}`, { id: i.id, data: { conflicts } });
    }
    const d = await c.store.insert("appointment", { ...base, created_by: c.actor.id } satisfies Appointment);
    return ok(`Rendez-vous enregistré.${conflictNote}`, { id: d.id, data: { conflicts } });
  },
  async "appointment.status"(c, raw) {
    const i = z.object({ id, status: oneOf(APPT_STATUS) }).parse(raw);
    await mutate<Appointment>(c, "appointment", i.id, "Rendez-vous", (a) => ({ ...a, status: i.status }));
    return ok(i.status === "annule" ? "Rendez-vous annulé." : i.status === "confirme" ? "Rendez-vous confirmé." : "Rendez-vous mis à jour.");
  },
  async "appointment.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await c.store.remove("appointment", i.id);
    return ok("Rendez-vous supprimé.");
  },

  // ----- Devis, factures, contrats -----
  async "quote.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), ...docBase, date: date.optional(), valid_until: optDate }).parse(raw);
    await ensure(c, "client", i.client_id, "Client");
    const { s } = await settings(c);
    const t = docTotals(i.items, i.tax_rate, i.discount);
    if (i.discount > t.subtotal) throw new OpError(422, "La remise dépasse le montant du devis.");
    const base = { client_id: i.client_id, items: i.items, tax_rate: i.tax_rate || 0, discount: i.discount, total: t.total, note: i.note || s.invoice_note, valid_until: i.valid_until };
    if (i.id) {
      await mutate<Quote>(c, "quote", i.id, "Devis", (q) => {
        if (q.status === "accepte" || q.invoice_id) throw new OpError(409, "Ce devis est accepté ou déjà facturé : il n'est plus modifiable.");
        return { ...q, ...base, date: i.date ?? q.date };
      });
      return ok("Devis modifié.", { id: i.id });
    }
    const num = await number(c, "DEV");
    const d = await c.store.insert("quote", { number: num, date: i.date ?? today(c.now?.() ?? new Date()), status: "brouillon", invoice_id: null, archived: false, created_by: c.actor.id, ...base } satisfies Quote);
    return ok(`Devis ${num} créé.`, { id: d.id, number: num });
  },
  async "quote.status"(c, raw) {
    const i = z.object({ id, status: oneOf(QUOTE_STATUS) }).parse(raw);
    await mutate<Quote>(c, "quote", i.id, "Devis", (q) => {
      if (q.invoice_id && i.status !== "accepte") throw new OpError(409, "Ce devis a déjà été facturé.");
      return { ...q, status: i.status };
    });
    return ok("Statut du devis mis à jour.");
  },
  /** Devis → facture (une seule fois) : la facture reprend les lignes, la TVA et la remise. */
  async "quote.convert"(c, raw) {
    const i = z.object({ id, due: optDate }).parse(raw);
    const q = await must<Quote>(c, "quote", i.id, "Devis");
    if (q.data.invoice_id) return ok("Ce devis est déjà facturé.", { id: q.data.invoice_id });
    if (q.data.status === "refuse" || q.data.status === "expire") throw new OpError(409, "Un devis refusé ou expiré ne peut pas être facturé.");
    const num = await number(c, "FAC");
    const inv = await c.store.insert("invoice", { number: num, client_id: q.data.client_id, date: today(c.now?.() ?? new Date()), due: i.due, items: q.data.items, tax_rate: q.data.tax_rate, discount: q.data.discount, total: q.data.total, status: "brouillon", payments: [], note: q.data.note, quote_id: q.id, archived: false, created_by: c.actor.id } satisfies Invoice);
    await mutate<Quote>(c, "quote", i.id, "Devis", (x) => ({ ...x, invoice_id: inv.id, status: "accepte" }));
    return ok(`Facture ${num} créée à partir du devis.`, { id: inv.id, number: num });
  },
  async "quote.archive"(c, raw) {
    const i = z.object({ id, archived: z.boolean() }).parse(raw);
    await mutate<Quote>(c, "quote", i.id, "Devis", (q) => ({ ...q, archived: i.archived }));
    return ok(i.archived ? "Devis archivé." : "Devis désarchivé.");
  },
  async "quote.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const q = await must<Quote>(c, "quote", i.id, "Devis");
    if (q.data.status !== "brouillon" || q.data.invoice_id) throw new OpError(409, "Seul un devis brouillon, non facturé, peut être supprimé : archivez les autres.");
    await c.store.remove("quote", i.id);
    return ok("Devis supprimé.");
  },
  async "invoice.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), ...docBase, date: date.optional(), due: optDate }).parse(raw);
    await ensure(c, "client", i.client_id, "Client");
    const { s } = await settings(c);
    const t = docTotals(i.items, i.tax_rate, i.discount);
    if (i.discount > t.subtotal) throw new OpError(422, "La remise dépasse le montant de la facture.");
    const base = { client_id: i.client_id, items: i.items, tax_rate: i.tax_rate || 0, discount: i.discount, total: t.total, note: i.note || s.invoice_note, due: i.due };
    if (i.id) {
      await mutate<Invoice>(c, "invoice", i.id, "Facture", (v) => {
        if (v.status !== "brouillon") throw new OpError(409, "Une facture envoyée n'est plus modifiable : annulez-la et créez-en une nouvelle.");
        return { ...v, ...base, date: i.date ?? v.date };
      });
      return ok("Facture modifiée.", { id: i.id });
    }
    const num = await number(c, "FAC");
    const d = await c.store.insert("invoice", { number: num, date: i.date ?? today(c.now?.() ?? new Date()), status: "brouillon", payments: [], quote_id: null, archived: false, created_by: c.actor.id, ...base } satisfies Invoice);
    return ok(`Facture ${num} créée.`, { id: d.id, number: num });
  },
  async "invoice.status"(c, raw) {
    const i = z.object({ id, status: z.enum(["envoyee", "annulee"]), reason: txt(300) }).parse(raw);
    await mutate<Invoice>(c, "invoice", i.id, "Facture", (v) => {
      if (v.status === "annulee") throw new OpError(409, "Cette facture est déjà annulée.");
      if (i.status === "annulee") {
        if (paidOf(v) > 0) throw new OpError(409, "Cette facture a des paiements : annulez d'abord les paiements (ou gardez-la).");
        if (!i.reason.trim()) throw new OpError(422, "Indiquez le motif de l'annulation.");
        return { ...v, status: "annulee", cancel_reason: i.reason };
      }
      if (v.status !== "brouillon") return null;
      return { ...v, status: "envoyee" };
    });
    return ok(i.status === "envoyee" ? "Facture marquée comme envoyée." : "Facture annulée.");
  },
  async "invoice.archive"(c, raw) {
    const i = z.object({ id, archived: z.boolean() }).parse(raw);
    await mutate<Invoice>(c, "invoice", i.id, "Facture", (v) => ({ ...v, archived: i.archived }));
    return ok(i.archived ? "Facture archivée." : "Facture désarchivée.");
  },
  async "invoice.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const v = await must<Invoice>(c, "invoice", i.id, "Facture");
    if (v.data.status !== "brouillon") throw new OpError(409, "Seule une facture brouillon peut être supprimée : annulez ou archivez les autres (une facture émise reste dans l'historique).");
    if (v.data.quote_id) await mutate<Quote>(c, "quote", v.data.quote_id, "Devis", (q) => (q.invoice_id === i.id ? { ...q, invoice_id: null } : null)).catch(() => undefined);
    await c.store.remove("invoice", i.id);
    return ok("Facture supprimée.");
  },
  /** Paiement d'une facture : reçu numéroté et recette enregistrée en finances, une seule fois par identifiant. */
  async "invoice.payment"(c, raw) {
    const i = z.object({ invoice_id: id, pid: uuid, amount: pos, method: oneOf(PAY_METHODS), date: date.optional(), ref: txt(80) }).parse(raw);
    const inv = await must<Invoice>(c, "invoice", i.invoice_id, "Facture");
    if (inv.data.payments.some((p) => p.id === i.pid)) return ok("Paiement déjà enregistré.");
    if (inv.data.status !== "envoyee") throw new OpError(409, inv.data.status === "brouillon" ? "Marquez d'abord la facture comme envoyée." : "Cette facture est annulée.");
    const bal = balanceOf(inv.data);
    if (i.amount > bal) throw new OpError(422, `Il ne reste que ${bal.toLocaleString("fr-FR")} à payer sur cette facture.`);
    const receipt = await number(c, "REC");
    const day = i.date ?? today(c.now?.() ?? new Date());
    const tx = await c.store.insert("transaction", { type: "recette", amount: i.amount, category: "prestation", date: day, description: `Paiement facture ${inv.data.number}`, method: i.method, client_id: inv.data.client_id, invoice_id: inv.id, by: c.actor.id } satisfies Transaction);
    const { written } = await mutate<Invoice>(c, "invoice", i.invoice_id, "Facture", (v) => {
      if (v.payments.some((p) => p.id === i.pid)) return null;
      if (i.amount > balanceOf(v)) throw new OpError(422, "Le solde a changé : actualisez la facture.");
      return { ...v, payments: [...v.payments, { id: i.pid, amount: i.amount, method: i.method, date: day, ref: i.ref, receipt, by: c.actor.id, tx_id: tx.id }] };
    }).catch(async (e) => {
      await c.store.remove("transaction", tx.id);
      throw e;
    });
    if (!written) await c.store.remove("transaction", tx.id);
    return ok(`Paiement enregistré. Reçu ${receipt}.`, { number: receipt });
  },
  async "invoice.payment_cancel"(c, raw) {
    needMgr(c, "annuler un paiement");
    const i = z.object({ invoice_id: id, pid: id, reason: req(300, "Motif") }).parse(raw);
    let txId: string | null = null;
    await mutate<Invoice>(c, "invoice", i.invoice_id, "Facture", (v) => {
      const p = v.payments.find((x) => x.id === i.pid);
      if (!p) throw new OpError(404, "Paiement introuvable.");
      txId = p.tx_id;
      return { ...v, payments: v.payments.filter((x) => x.id !== i.pid) };
    });
    if (txId) await c.store.remove("transaction", txId);
    return ok("Paiement annulé : la recette correspondante est retirée des finances.");
  },
  async "contract.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), title: req(160, "Titre"), client_id: optId, kind: txt(60), start: optDate, end: optDate, amount: optAmt, status: oneOf(CONTRACT_STATUS).default("brouillon"), terms: txt(8000) }).parse(raw);
    if (i.start && i.end && i.end < i.start) throw new OpError(422, "La fin est avant le début du contrat.");
    await ensure(c, "client", i.client_id, "Client");
    const base = { title: i.title, client_id: i.client_id, kind: i.kind, start: i.start, end: i.end, amount: i.amount, status: i.status, terms: i.terms };
    if (i.id) {
      await mutate<Contract>(c, "contract", i.id, "Contrat", (x) => ({ ...x, ...base }));
      return ok("Contrat modifié.", { id: i.id });
    }
    const d = await c.store.insert("contract", { ...base, archived: false, created_by: c.actor.id } satisfies Contract);
    return ok("Contrat créé.", { id: d.id });
  },
  async "contract.status"(c, raw) {
    const i = z.object({ id, status: oneOf(CONTRACT_STATUS) }).parse(raw);
    await mutate<Contract>(c, "contract", i.id, "Contrat", (x) => ({ ...x, status: i.status }));
    return ok("Statut du contrat mis à jour.");
  },
  async "contract.archive"(c, raw) {
    const i = z.object({ id, archived: z.boolean() }).parse(raw);
    await mutate<Contract>(c, "contract", i.id, "Contrat", (x) => ({ ...x, archived: i.archived }));
    return ok(i.archived ? "Contrat archivé." : "Contrat désarchivé.");
  },
  async "contract.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const x = await must<Contract>(c, "contract", i.id, "Contrat");
    if (x.data.status === "actif") throw new OpError(409, "Un contrat actif ne peut pas être supprimé : résiliez-le ou archivez-le.");
    await c.store.remove("contract", i.id);
    return ok("Contrat supprimé.");
  },

  // ----- Documents (fichiers) -----
  async "document.add"(c, raw) {
    const i = z.object({ name: req(160, "Nom"), category: oneOf(DOC_CATEGORIES).default("autre"), client_id: optId, project_id: optId, file: z.object({ name: req(160, "Nom du fichier"), mime: z.enum(ALLOWED_MIME), data: z.string().max(520_000).regex(/^[A-Za-z0-9+/=]+$/, "Fichier invalide") }) }).parse(raw);
    await ensure(c, "client", i.client_id, "Client");
    await ensure(c, "project", i.project_id, "Projet");
    const size = Math.floor((i.file.data.length * 3) / 4) - (i.file.data.endsWith("==") ? 2 : i.file.data.endsWith("=") ? 1 : 0);
    if (size > 380_000) throw new OpError(413, "Fichier trop lourd (380 Ko maximum) : réduisez-le ou compressez-le.");
    const f = await c.store.insert("file", { name: i.file.name, mime: i.file.mime, size, data: i.file.data } satisfies FileDoc);
    const d = await c.store.insert("document", { name: i.name, category: i.category, client_id: i.client_id, project_id: i.project_id, file_id: f.id, mime: i.file.mime, size, archived: false, at: nowIso(c), by: c.actor.id } satisfies Document);
    return ok("Document enregistré.", { id: d.id });
  },
  async "document.archive"(c, raw) {
    const i = z.object({ id, archived: z.boolean() }).parse(raw);
    await mutate<Document>(c, "document", i.id, "Document", (d) => ({ ...d, archived: i.archived }));
    return ok(i.archived ? "Document archivé." : "Document désarchivé.");
  },
  async "document.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const d = await must<Document>(c, "document", i.id, "Document");
    if (!isMgr(c) && d.data.by !== c.actor.id) throw new OpError(403, "Seul l'auteur du document ou la direction peut le supprimer.");
    if (d.data.file_id) await c.store.remove("file", d.data.file_id);
    await c.store.remove("document", i.id);
    return ok("Document supprimé.");
  },

  // ----- Finances -----
  async "transaction.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), type: z.enum(["recette", "depense"]), amount: pos, category: oneOf(TX_CATEGORIES), date, description: txt(300), method: oneOf(PAY_METHODS).default("especes"), client_id: optId }).parse(raw);
    await ensure(c, "client", i.client_id, "Client");
    const base = { type: i.type, amount: i.amount, category: i.category, date: i.date, description: i.description, method: i.method, client_id: i.client_id };
    if (i.id) {
      await mutate<Transaction>(c, "transaction", i.id, "Opération", (t) => {
        if (t.invoice_id) throw new OpError(409, "Cette recette vient d'un paiement de facture : annulez le paiement dans la facture.");
        return { ...t, ...base };
      });
      return ok("Opération modifiée.", { id: i.id });
    }
    const d = await c.store.insert("transaction", { ...base, invoice_id: null, by: c.actor.id } satisfies Transaction);
    return ok(i.type === "recette" ? "Recette enregistrée." : "Dépense enregistrée.", { id: d.id });
  },
  async "transaction.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const t = await must<Transaction>(c, "transaction", i.id, "Opération");
    if (t.data.invoice_id) throw new OpError(409, "Cette recette vient d'un paiement de facture : annulez le paiement dans la facture.");
    await c.store.remove("transaction", i.id);
    return ok("Opération supprimée.");
  },

  // ----- Équipements -----
  async "equipment.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom"), kind: oneOf(EQUIP_KINDS), serial: txt(80), state: oneOf(EQUIP_STATE).default("bon"), assigned_to: optId, location: txt(80), purchase_date: optDate, purchase_price: optAmt, notes: txt(1000) }).parse(raw);
    await ensure(c, "employee", i.assigned_to, "Employé");
    const base = { name: i.name, kind: i.kind, serial: i.serial, state: i.state, assigned_to: i.assigned_to, location: i.location, purchase_date: i.purchase_date, purchase_price: i.purchase_price, notes: i.notes };
    if (i.id) {
      await mutate<Equipment>(c, "equipment", i.id, "Équipement", (e) => ({ ...e, ...base, history: [...e.history, { at: nowIso(c), by: c.actor.id, text: "Fiche modifiée" }].slice(-100) }));
      return ok("Équipement modifié.", { id: i.id });
    }
    const d = await c.store.insert("equipment", { ...base, history: [{ at: nowIso(c), by: c.actor.id, text: "Équipement enregistré" }] } satisfies Equipment);
    return ok("Équipement ajouté.", { id: d.id });
  },
  async "equipment.assign"(c, raw) {
    const i = z.object({ id, assigned_to: optId, note: txt(200) }).parse(raw);
    let who = "le stock";
    if (i.assigned_to) who = (await must<Employee>(c, "employee", i.assigned_to, "Employé")).data.name;
    await mutate<Equipment>(c, "equipment", i.id, "Équipement", (e) => ({ ...e, assigned_to: i.assigned_to, history: [...e.history, { at: nowIso(c), by: c.actor.id, text: i.assigned_to ? `Attribué à ${who}${i.note ? ` (${i.note})` : ""}` : `Repris : retourné au stock${i.note ? ` (${i.note})` : ""}` }].slice(-100) }));
    return ok(i.assigned_to ? `Équipement attribué à ${who}.` : "Équipement repris.");
  },
  async "equipment.state"(c, raw) {
    const i = z.object({ id, state: oneOf(EQUIP_STATE), note: txt(200) }).parse(raw);
    await mutate<Equipment>(c, "equipment", i.id, "Équipement", (e) => ({ ...e, state: i.state, history: [...e.history, { at: nowIso(c), by: c.actor.id, text: `État : ${EQUIP_STATE[i.state]}${i.note ? ` (${i.note})` : ""}` }].slice(-100) }));
    return ok("État mis à jour.");
  },
  async "equipment.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const e = await must<Equipment>(c, "equipment", i.id, "Équipement");
    if (e.data.assigned_to) throw new OpError(409, "Cet équipement est attribué : reprenez-le d'abord.");
    await c.store.remove("equipment", i.id);
    return ok("Équipement supprimé.");
  },

  // ----- Messagerie -----
  async "message.send"(c, raw) {
    const i = z.object({ channel: z.string().max(140), text: req(2000, "Message") }).parse(raw);
    await channelAllowed(c, i.channel);
    const d = await c.store.insert("message", { channel: i.channel, from: c.actor.id, text: i.text, at: nowIso(c), read_by: [c.actor.id] } satisfies Message);
    return ok("Message envoyé.", { id: d.id });
  },
  async "message.read"(c, raw) {
    const i = z.object({ channel: z.string().max(140) }).parse(raw);
    await channelAllowed(c, i.channel);
    let n = 0;
    for (const m of (await c.store.list("message")) as Doc<Message>[])
      if (m.data.channel === i.channel && !m.data.read_by.includes(c.actor.id)) {
        await mutate<Message>(c, "message", m.id, "Message", (x) => (x.read_by.includes(c.actor.id) ? null : { ...x, read_by: [...x.read_by, c.actor.id] }));
        n++;
      }
    return ok(`${n} message(s) lu(s).`);
  },

  // ----- Modules du métier (fiches génériques validées par leur définition) -----
  async "record.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), mod: z.string().max(40), data: z.record(z.string().max(40), z.unknown()) }).parse(raw);
    const { s } = await settings(c);
    const def = SECTOR_MODULES[i.mod];
    if (!def || !enabledSectorKeys(s).includes(i.mod)) throw new OpError(404, "Ce module n'est pas activé pour votre entreprise.");
    const out: SectorRecord["data"] = {};
    for (const fd of def.fields) {
      const v = i.data[fd.key];
      const empty = v === undefined || v === null || v === "";
      if (empty) {
        if (fd.required) throw new OpError(422, `${fd.label} obligatoire.`);
        out[fd.key] = fd.type === "boolean" ? false : null;
        continue;
      }
      if (fd.type === "number" || fd.type === "money") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new OpError(422, `${fd.label} : nombre positif attendu.`);
        out[fd.key] = round2(n);
      } else if (fd.type === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new OpError(422, `${fd.label} : date invalide.`);
        out[fd.key] = String(v);
      } else if (fd.type === "select") {
        if (!fd.options?.includes(String(v))) throw new OpError(422, `${fd.label} : choix invalide.`);
        out[fd.key] = String(v);
      } else if (fd.type === "relation") {
        const rel = fd.rel!;
        const ok2 = rel === "client" ? await c.store.get("client", String(v)) : rel === "employee" ? await c.store.get("employee", String(v)) : ((await c.store.get("record", String(v))) as Doc<SectorRecord> | null)?.data.mod === rel ? true : null;
        if (!ok2) throw new OpError(422, `${fd.label} : fiche introuvable.`);
        out[fd.key] = String(v);
      } else if (fd.type === "boolean") out[fd.key] = Boolean(v);
      else {
        const sv = String(v).trim();
        if (sv.length > (fd.type === "longtext" ? 4000 : 200)) throw new OpError(422, `${fd.label} : texte trop long.`);
        if (fd.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sv)) throw new OpError(422, `${fd.label} : e-mail invalide.`);
        out[fd.key] = sv;
      }
    }
    if (i.id) {
      await mutate<SectorRecord>(c, "record", i.id, def.singular, (r) => {
        if (r.mod !== i.mod) throw new OpError(409, "Fiche d'un autre module.");
        return { mod: i.mod, data: out };
      });
      return ok(`${def.singular} modifié(e).`, { id: i.id });
    }
    const d = await c.store.insert("record", { mod: i.mod, data: out } satisfies SectorRecord);
    return ok(`${def.singular} enregistré(e).`, { id: d.id });
  },
  async "record.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const r = await must<SectorRecord>(c, "record", i.id, "Fiche");
    // Une fiche référencée par une autre ne se supprime pas (on évite les liens cassés).
    const all = (await c.store.list("record")) as Doc<SectorRecord>[];
    const used = all.some((o) => o.id !== i.id && Object.entries(o.data.data).some(([k, v]) => v === i.id && SECTOR_MODULES[o.data.mod]?.fields.find((f) => f.key === k)?.rel === r.data.mod));
    if (used) throw new OpError(409, "Cette fiche est utilisée par une autre : supprimez ou modifiez d'abord les fiches liées.");
    await c.store.remove("record", i.id);
    return ok("Fiche supprimée.");
  },
};

const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] as const;

/** Canaux : « general » (toute l'équipe), « dm:a:b » (privé, deux personnes) ou « project:<id> » (membres du projet). */
async function channelAllowed(c: OpContext, ch: string) {
  if (ch === "general") return;
  const dm = /^dm:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(ch);
  if (dm) {
    if (ch !== dmChannel(dm[1]!, dm[2]!) || ![dm[1], dm[2]].includes(c.actor.id)) throw new OpError(403, "Cette conversation privée ne vous concerne pas.");
    const other = dm[1] === c.actor.id ? dm[2]! : dm[1]!;
    if (!c.members.includes(other)) throw new OpError(422, "Cette personne ne fait pas partie de l'équipe.");
    return;
  }
  const pr = /^project:([0-9a-zA-Z-]{8,64})$/.exec(ch);
  if (pr) {
    const p = await must<Project>(c, "project", pr[1]!, "Projet");
    if (!isMgr(c) && !inProject(p.data, c.actor.id)) throw new OpError(403, "Vous ne faites pas partie de ce projet.");
    return;
  }
  throw new OpError(422, "Conversation inconnue.");
}

export const BUREAU_OPS = Object.keys(HANDLERS);

export async function runOp(ctx: OpContext, op: string, input: unknown): Promise<OpResult> {
  try {
    const h = HANDLERS[op];
    if (!h) throw new OpError(400, "Opération inconnue.");
    if (LEVEL[ctx.actor.role] < 1) throw new OpError(403, "Votre rôle (lecture seule) ne permet pas de modifier les données.");
    const denied = opDenied(BUREAU_OP_PERMS, op, ctx.perms);
    if (denied) throw new OpError(403, denied);
    return await h(ctx, input);
  } catch (e) {
    if (e instanceof z.ZodError) throw new OpError(422, e.issues[0]?.message ?? "Données invalides.");
    throw e;
  }
}
