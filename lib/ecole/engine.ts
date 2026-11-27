import { z } from "zod";
import { ECOLE_OP_PERMS, opDenied } from "../op-perms";
import { has, type Permission } from "../team";
import {
  AUDIENCES, EXAM_KINDS, FEE_KINDS, LEVEL, MARKS, PAY_METHODS, SCHOOL_TYPE_IDS, STUDENT_STATUS, SYSTEM_IDS, TX_CATEGORIES,
  dueOf, invoiceTotal, round2, settingsOf, today,
  type Announcement, type Assign, type Attendance, type Col, type Doc, type EcoleRole, type Exam, type Fee, type Guardian, type Invoice, type Klass, type Level, type Payment, type Student, type Subject, type Teacher, type Transaction, type Year,
} from "./model";

/**
 * Moteur des opérations de MiniSoft École. Chaque opération vérifie le rôle et le poste, valide les
 * données, applique les règles métier (un enseignant ne saisit que les notes de ses classes, aucun
 * paiement au-delà du solde, aucune suppression de données liées) et n'écrit qu'à travers l'`EcoleStore`
 * (mises à jour conditionnelles, numéros uniques, paiements sans doublon). Aucune opération ne
 * supprime des notes ou des paiements sans l'accord explicite d'un poste autorisé.
 */

export interface EcoleStore {
  list(col: Col): Promise<Doc[]>;
  get(col: Col, id: string): Promise<Doc | null>;
  insert(col: Col, data: object, id?: string): Promise<Doc>;
  cas(col: Col, doc: Doc, data: object): Promise<Doc | null>;
  remove(col: Col, id: string): Promise<void>;
  nextSeq(key: string): Promise<number>;
}
export type OpContext = { store: EcoleStore; actor: { id: string; role: EcoleRole }; perms?: Permission[] | null; members: string[]; now?: () => Date };
export type OpResult = { message: string; id?: string; number?: string; matricule?: string; event?: { kind: "absence"; class_id: string; date: string; student_ids: string[] } | { kind: "announcement"; id: string } };

export class OpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const txt = (max: number) => z.string().trim().max(max).default("");
const req = (max: number, label: string) => z.string().trim().min(1, `${label} obligatoire`).max(max);
const id = z.string().min(1).max(64);
const optId = z.string().max(64).nullish().transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optDate = z.union([date, z.literal(""), z.null()]).optional().transform((v) => v || null);
const amt = z.coerce.number().finite().min(0, "Montant positif attendu").max(1e12).transform(round2);
const pos = z.coerce.number().finite().positive("Montant supérieur à 0 attendu").max(1e12).transform(round2);
const oneOf = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);
const phone = z.string().trim().max(30).default("");

const nowD = (c: OpContext) => c.now?.() ?? new Date();
const ok = (message: string, extra: Partial<OpResult> = {}): OpResult => ({ message, ...extra });

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
const list = async <T>(c: OpContext, col: Col) => (await c.store.list(col)) as Doc<T>[];

/** Direction, administration et postes « classes » voient tout ; un enseignant est limité à ses affectations. */
const isWide = (c: OpContext) => c.perms === null || c.perms === undefined || has(c.perms, "classes") || (LEVEL[c.actor.role] >= 2 && c.perms.length === 0);
async function teacherScope(c: OpContext) {
  if (isWide(c)) return null;
  const me = (await list<Teacher>(c, "teacher")).find((t) => t.data.user_id === c.actor.id);
  if (!me) throw new OpError(403, "Votre compte n'est lié à aucun enseignant : demandez à la direction de relier votre profil.");
  const assigns = (await list<Assign>(c, "assign")).filter((a) => a.data.teacher_id === me.id);
  const classes = (await list<Klass>(c, "class")).filter((k) => k.data.titular_id === me.id).map((k) => k.id);
  return { me, assigns, classes: new Set([...assigns.map((a) => a.data.class_id), ...classes]) };
}
async function assertMay(c: OpContext, classId: string, subjectId?: string) {
  const sc = await teacherScope(c);
  if (!sc) return;
  if (subjectId ? !sc.assigns.some((a) => a.data.class_id === classId && a.data.subject_id === subjectId) : !sc.classes.has(classId)) throw new OpError(403, "Cette classe ou cette matière ne fait pas partie de vos affectations.");
}
async function enrolledCount(c: OpContext, classId: string, except?: string) {
  return (await list<Student>(c, "student")).filter((s) => s.data.class_id === classId && s.data.status === "inscrit" && s.id !== except).length;
}

const HANDLERS: Record<string, (c: OpContext, raw: unknown) => Promise<OpResult>> = {
  // ----- Établissement -----
  async "settings.save"(c, raw) {
    const i = z.object({
      name: req(120, "Nom de l'établissement"), school_type: z.enum(SCHOOL_TYPE_IDS as [string, ...string[]]), system: z.enum(SYSTEM_IDS as [string, ...string[]]), system_note: txt(200),
      address: txt(240), phone, email: txt(120), students_count: z.coerce.number().int().min(0).max(100000).default(0), teachers_count: z.coerce.number().int().min(0).max(10000).default(0), classes_count: z.coerce.number().int().min(0).max(1000).default(0),
      terms: z.coerce.number().int().min(1).max(6), term_label: z.enum(["Trimestre", "Semestre", "Période"]), scale: z.coerce.number().min(1).max(1000), pass_mark: z.coerce.number().min(0).max(1000),
      mentions: z.array(z.object({ min: z.coerce.number().min(0).max(1000), label: req(40, "Mention") })).max(10),
      currency: z.enum(["XAF", "XOF", "EUR", "USD", "CDF", "GNF"]), primary: z.string().regex(/^#[0-9a-fA-F]{6}$/), needs: txt(1000), bulletin_note: txt(300),
    }).parse(raw);
    if (i.pass_mark > i.scale) throw new OpError(422, "Le seuil de réussite ne peut pas dépasser le barème.");
    const { doc, s } = await settings(c);
    const next = { ...s, ...i, mentions: [...i.mentions].sort((a, b) => b.min - a.min) };
    if (doc) await mutate<Record<string, unknown>>(c, "settings", doc.id, "Paramètres", () => next as never);
    else await c.store.insert("settings", next);
    return ok("Paramètres enregistrés.");
  },

  // ----- Années, niveaux, classes, matières -----
  async "year.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(40, "Nom de l'année"), start: date, end: date, current: z.boolean().default(false) }).parse(raw);
    if (i.end <= i.start) throw new OpError(422, "La fin de l'année doit être après son début.");
    const all = await list<Year>(c, "year");
    if (all.some((y) => y.id !== i.id && y.data.name.toLowerCase() === i.name.toLowerCase())) throw new OpError(409, "Cette année scolaire existe déjà.");
    const makeCurrent = i.current || all.length === 0;
    let yid = i.id;
    if (!yid) yid = (await c.store.insert("year", { name: i.name, start: i.start, end: i.end, current: makeCurrent } satisfies Year)).id;
    else await mutate<Year>(c, "year", yid, "Année", (v) => ({ ...v, name: i.name, start: i.start, end: i.end }));
    if (makeCurrent) await setCurrentYear(c, yid);
    return ok(i.id ? "Année modifiée." : "Année scolaire créée.", { id: yid });
  },
  async "year.current"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await must(c, "year", i.id, "Année");
    await setCurrentYear(c, i.id);
    return ok("Année scolaire en cours changée. Les données des autres années sont conservées.");
  },
  async "year.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    if ((await list<Klass>(c, "class")).some((k) => k.data.year_id === i.id)) throw new OpError(409, "Cette année contient des classes : elle ne peut pas être supprimée.");
    await c.store.remove("year", i.id);
    return ok("Année supprimée.");
  },
  async "level.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(40, "Nom du niveau"), order: z.coerce.number().int().min(0).max(100).default(0) }).parse(raw);
    const all = await list<Level>(c, "level");
    if (all.some((l) => l.id !== i.id && l.data.name.toLowerCase() === i.name.toLowerCase())) throw new OpError(409, "Ce niveau existe déjà.");
    if (!i.id) { const d = await c.store.insert("level", { name: i.name, order: i.order || all.length + 1 } satisfies Level); return ok("Niveau ajouté.", { id: d.id }); }
    await mutate<Level>(c, "level", i.id, "Niveau", (v) => ({ ...v, name: i.name, order: i.order }));
    return ok("Niveau modifié.", { id: i.id });
  },
  async "level.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    if ((await list<Klass>(c, "class")).some((k) => k.data.level_id === i.id)) throw new OpError(409, "Des classes utilisent ce niveau : supprimez ou déplacez-les d'abord.");
    await c.store.remove("level", i.id);
    return ok("Niveau supprimé.");
  },
  async "class.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(60, "Nom de la classe"), level_id: id, year_id: id, titular_id: optId, capacity: z.union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(500)]).optional().transform((v) => (v === "" || v === null || v === undefined ? null : v)) }).parse(raw);
    await must(c, "level", i.level_id, "Niveau");
    await must(c, "year", i.year_id, "Année");
    if (i.titular_id) await must(c, "teacher", i.titular_id, "Enseignant");
    const all = await list<Klass>(c, "class");
    if (all.some((k) => k.id !== i.id && k.data.year_id === i.year_id && k.data.name.toLowerCase() === i.name.toLowerCase())) throw new OpError(409, "Une classe porte déjà ce nom cette année.");
    if (!i.id) { const d = await c.store.insert("class", { name: i.name, level_id: i.level_id, year_id: i.year_id, titular_id: i.titular_id, capacity: i.capacity } satisfies Klass); return ok("Classe créée.", { id: d.id }); }
    if (i.capacity && (await enrolledCount(c, i.id)) > i.capacity) throw new OpError(409, "La capacité est inférieure au nombre d'élèves déjà inscrits.");
    await mutate<Klass>(c, "class", i.id, "Classe", (v) => ({ ...v, name: i.name, level_id: i.level_id, year_id: i.year_id, titular_id: i.titular_id, capacity: i.capacity }));
    return ok("Classe modifiée.", { id: i.id });
  },
  async "class.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    if ((await list<Student>(c, "student")).some((s) => s.data.class_id === i.id)) throw new OpError(409, "Cette classe a des élèves : déplacez-les d'abord. Rien n'est supprimé automatiquement.");
    if ((await list<Exam>(c, "exam")).some((e) => e.data.class_id === i.id)) throw new OpError(409, "Cette classe a des évaluations et des notes : elle est conservée.");
    for (const a of (await list<Assign>(c, "assign")).filter((x) => x.data.class_id === i.id)) await c.store.remove("assign", a.id);
    await c.store.remove("class", i.id);
    return ok("Classe supprimée.");
  },
  async "subject.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(60, "Nom de la matière"), code: txt(12) }).parse(raw);
    const all = await list<Subject>(c, "subject");
    if (all.some((s) => s.id !== i.id && s.data.name.toLowerCase() === i.name.toLowerCase())) throw new OpError(409, "Cette matière existe déjà.");
    if (!i.id) { const d = await c.store.insert("subject", { name: i.name, code: i.code } satisfies Subject); return ok("Matière ajoutée.", { id: d.id }); }
    await mutate<Subject>(c, "subject", i.id, "Matière", (v) => ({ ...v, name: i.name, code: i.code }));
    return ok("Matière modifiée.", { id: i.id });
  },
  async "subject.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    if ((await list<Assign>(c, "assign")).some((a) => a.data.subject_id === i.id)) throw new OpError(409, "Cette matière est affectée à des classes : retirez-la d'abord.");
    await c.store.remove("subject", i.id);
    return ok("Matière supprimée.");
  },
  /** Affecte une matière à une classe avec son enseignant et son coefficient (le coefficient change les moyennes de la classe). */
  async "assign.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), class_id: id, subject_id: id, teacher_id: optId, coef: z.coerce.number().min(0.5, "Coefficient minimal 0,5").max(20) }).parse(raw);
    await must(c, "class", i.class_id, "Classe");
    await must(c, "subject", i.subject_id, "Matière");
    if (i.teacher_id) await must(c, "teacher", i.teacher_id, "Enseignant");
    const all = await list<Assign>(c, "assign");
    if (all.some((a) => a.id !== i.id && a.data.class_id === i.class_id && a.data.subject_id === i.subject_id)) throw new OpError(409, "Cette matière est déjà affectée à cette classe.");
    if (!i.id) { const d = await c.store.insert("assign", { class_id: i.class_id, subject_id: i.subject_id, teacher_id: i.teacher_id, coef: i.coef } satisfies Assign); return ok("Matière affectée à la classe.", { id: d.id }); }
    await mutate<Assign>(c, "assign", i.id, "Affectation", (v) => ({ ...v, teacher_id: i.teacher_id, coef: i.coef }));
    return ok("Affectation modifiée.", { id: i.id });
  },
  async "assign.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const a = await must<Assign>(c, "assign", i.id, "Affectation");
    if ((await list<Exam>(c, "exam")).some((e) => e.data.class_id === a.data.class_id && e.data.subject_id === a.data.subject_id)) throw new OpError(409, "Des évaluations existent pour cette matière dans cette classe : elle est conservée.");
    await c.store.remove("assign", i.id);
    return ok("Affectation retirée.");
  },

  // ----- Enseignants -----
  async "teacher.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(120, "Nom"), phone, email: txt(120), user_id: optId, specialty: txt(80), status: z.enum(["actif", "inactif"]).default("actif") }).parse(raw);
    if (i.user_id && !c.members.includes(i.user_id)) throw new OpError(422, "Ce compte ne fait pas partie de l'équipe de l'établissement.");
    const all = await list<Teacher>(c, "teacher");
    if (i.user_id && all.some((t) => t.id !== i.id && t.data.user_id === i.user_id)) throw new OpError(409, "Ce compte est déjà relié à un autre enseignant.");
    if (!i.id) { const d = await c.store.insert("teacher", { name: i.name, phone: i.phone, email: i.email, user_id: i.user_id, specialty: i.specialty, status: i.status } satisfies Teacher); return ok("Enseignant ajouté.", { id: d.id }); }
    await mutate<Teacher>(c, "teacher", i.id, "Enseignant", (v) => ({ ...v, name: i.name, phone: i.phone, email: i.email, user_id: i.user_id, specialty: i.specialty, status: i.status }));
    return ok("Enseignant modifié.", { id: i.id });
  },
  async "teacher.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    if ((await list<Assign>(c, "assign")).some((a) => a.data.teacher_id === i.id) || (await list<Klass>(c, "class")).some((k) => k.data.titular_id === i.id)) throw new OpError(409, "Cet enseignant est affecté à des classes : retirez ses affectations d'abord.");
    await c.store.remove("teacher", i.id);
    return ok("Enseignant supprimé.");
  },

  // ----- Élèves et parents -----
  /** Inscription : fiche élève, matricule unique, parent ou tuteur, et facture des frais obligatoires du niveau. */
  async "student.enroll"(c, raw) {
    const i = z.object({
      first_name: req(80, "Prénom"), last_name: req(80, "Nom"), sex: z.enum(["M", "F"]), birth_date: optDate, birth_place: txt(80), class_id: id, previous_school: txt(120), notes: txt(1000), invoice: z.boolean().default(true),
      guardian: z.object({ name: req(120, "Nom du parent"), phone: z.string().trim().min(6, "Téléphone du parent obligatoire").max(30), email: txt(120), relation: txt(40) }).nullish(),
    }).parse(raw);
    const klass = await must<Klass>(c, "class", i.class_id, "Classe");
    const cap = klass.data.capacity;
    if (cap && (await enrolledCount(c, i.class_id)) >= cap) throw new OpError(409, `La classe ${klass.data.name} est complète (${cap} élèves).`);
    const year = await must<Year>(c, "year", klass.data.year_id, "Année");
    const students = await list<Student>(c, "student");
    const same = students.find((s) => s.data.year_id === year.id && s.data.first_name.toLowerCase() === i.first_name.toLowerCase() && s.data.last_name.toLowerCase() === i.last_name.toLowerCase() && s.data.birth_date === i.birth_date);
    if (same) throw new OpError(409, "Cet élève est déjà inscrit cette année.");
    const yy = year.data.start.slice(2, 4);
    const matricule = `${yy}${String(await c.store.nextSeq(`matricule:${year.id}`)).padStart(4, "0")}`;
    const st = await c.store.insert("student", { matricule, first_name: i.first_name, last_name: i.last_name, sex: i.sex, birth_date: i.birth_date, birth_place: i.birth_place, class_id: i.class_id, year_id: year.id, status: "inscrit", enrolled_at: today(nowD(c)), guardian_ids: [], previous_school: i.previous_school, notes: i.notes } satisfies Student);
    if (i.guardian) await linkGuardian(c, st.id, { name: i.guardian.name, phone: i.guardian.phone, email: i.guardian.email, relation: i.guardian.relation, user_id: null });
    let number: string | undefined;
    if (i.invoice) {
      const fees = (await list<Fee>(c, "fee")).filter((f) => f.data.mandatory && (!f.data.level_id || f.data.level_id === klass.data.level_id));
      if (fees.length) number = await createInvoice(c, st.id, year.id, fees.map((f) => ({ label: f.data.name, amount: f.data.amount })), 0);
    }
    return ok(`${i.first_name} ${i.last_name} est inscrit(e) en ${klass.data.name} (matricule ${matricule}).${number ? ` Facture ${number} créée.` : ""}`, { id: st.id, matricule, number });
  },
  async "student.save"(c, raw) {
    const i = z.object({ id, first_name: req(80, "Prénom"), last_name: req(80, "Nom"), sex: z.enum(["M", "F"]), birth_date: optDate, birth_place: txt(80), previous_school: txt(120), notes: txt(1000) }).parse(raw);
    await mutate<Student>(c, "student", i.id, "Élève", (v) => ({ ...v, first_name: i.first_name, last_name: i.last_name, sex: i.sex, birth_date: i.birth_date, birth_place: i.birth_place, previous_school: i.previous_school, notes: i.notes }));
    return ok("Fiche élève modifiée.", { id: i.id });
  },
  async "student.move"(c, raw) {
    const i = z.object({ id, class_id: id }).parse(raw);
    const klass = await must<Klass>(c, "class", i.class_id, "Classe");
    if (klass.data.capacity && (await enrolledCount(c, i.class_id, i.id)) >= klass.data.capacity) throw new OpError(409, `La classe ${klass.data.name} est complète.`);
    await mutate<Student>(c, "student", i.id, "Élève", (v) => ({ ...v, class_id: i.class_id, year_id: klass.data.year_id }));
    return ok(`Élève déplacé en ${klass.data.name}. Ses notes déjà saisies restent dans leur classe d'origine.`, { id: i.id });
  },
  async "student.status"(c, raw) {
    const i = z.object({ id, status: oneOf(STUDENT_STATUS) }).parse(raw);
    await mutate<Student>(c, "student", i.id, "Élève", (v) => ({ ...v, status: i.status }));
    return ok(`Statut : ${STUDENT_STATUS[i.status]}. L'historique de l'élève est conservé.`, { id: i.id });
  },
  /** Suppression refusée dès que l'élève a des notes, des présences ou une facture : on change son statut à la place. */
  async "student.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const hasScores = (await list<Exam>(c, "exam")).some((e) => i.id in e.data.scores);
    const hasInvoice = (await list<Invoice>(c, "invoice")).some((x) => x.data.student_id === i.id);
    const hasAtt = (await list<Attendance>(c, "attendance")).some((a) => i.id in a.data.marks);
    if (hasScores || hasInvoice || hasAtt) throw new OpError(409, "Cet élève a des notes, des présences ou une facture : il ne peut pas être supprimé. Changez son statut (transféré, abandon…).");
    for (const g of await list<Guardian>(c, "guardian")) if (g.data.student_ids.includes(i.id)) await mutate<Guardian>(c, "guardian", g.id, "Parent", (v) => ({ ...v, student_ids: v.student_ids.filter((x) => x !== i.id) }));
    await c.store.remove("student", i.id);
    return ok("Fiche élève supprimée.");
  },
  async "guardian.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), student_id: id, name: req(120, "Nom"), phone: z.string().trim().min(6, "Téléphone obligatoire").max(30), email: txt(120), relation: txt(40), user_id: optId }).parse(raw);
    if (i.user_id && !c.members.includes(i.user_id)) throw new OpError(422, "Ce compte ne fait pas partie de l'équipe de l'établissement : invitez d'abord le parent (poste Parent).");
    await must(c, "student", i.student_id, "Élève");
    if (i.id) {
      await mutate<Guardian>(c, "guardian", i.id, "Parent", (v) => ({ ...v, name: i.name, phone: i.phone, email: i.email, relation: i.relation, user_id: i.user_id }));
      await linkGuardian(c, i.student_id, null, i.id);
      return ok("Parent modifié.", { id: i.id });
    }
    const gid = await linkGuardian(c, i.student_id, { name: i.name, phone: i.phone, email: i.email, relation: i.relation, user_id: i.user_id });
    return ok("Parent ajouté.", { id: gid });
  },

  // ----- Évaluations et notes -----
  async "exam.save"(c, raw) {
    const { s } = await settings(c);
    const i = z.object({ id: z.string().max(64).optional(), name: req(80, "Nom de l'évaluation"), class_id: id, subject_id: id, term: z.coerce.number().int().min(1), kind: oneOf(EXAM_KINDS).default("devoir"), date, max: z.coerce.number().positive("Barème supérieur à 0").max(1000), weight: z.coerce.number().positive().max(20).default(1) }).parse(raw);
    if (i.term > s.terms) throw new OpError(422, `Cet établissement n'a que ${s.terms} ${s.term_label.toLowerCase()}(s).`);
    if (!(await list<Assign>(c, "assign")).some((a) => a.data.class_id === i.class_id && a.data.subject_id === i.subject_id)) throw new OpError(422, "Cette matière n'est pas affectée à cette classe.");
    await assertMay(c, i.class_id, i.subject_id);
    if (!i.id) {
      const d = await c.store.insert("exam", { name: i.name, class_id: i.class_id, subject_id: i.subject_id, term: i.term, kind: i.kind, date: i.date, max: i.max, weight: i.weight, scores: {}, by: c.actor.id } satisfies Exam);
      return ok("Évaluation créée.", { id: d.id });
    }
    const cur = await must<Exam>(c, "exam", i.id, "Évaluation");
    await assertMay(c, cur.data.class_id, cur.data.subject_id);
    if (cur.data.class_id !== i.class_id || cur.data.subject_id !== i.subject_id) throw new OpError(409, "La classe et la matière d'une évaluation ne changent pas : créez une nouvelle évaluation.");
    if (Object.values(cur.data.scores).some((v) => typeof v === "number" && v > i.max)) throw new OpError(409, "Des notes dépassent le nouveau barème : corrigez-les d'abord.");
    await mutate<Exam>(c, "exam", i.id, "Évaluation", (v) => ({ ...v, name: i.name, term: i.term, kind: i.kind, date: i.date, max: i.max, weight: i.weight }));
    return ok("Évaluation modifiée.", { id: i.id });
  },
  /** Supprimer une évaluation qui contient des notes demande un accord explicite (`confirm`) d'un poste de direction. */
  async "exam.delete"(c, raw) {
    const i = z.object({ id, confirm: z.boolean().default(false) }).parse(raw);
    const e = await must<Exam>(c, "exam", i.id, "Évaluation");
    await assertMay(c, e.data.class_id, e.data.subject_id);
    const noted = Object.values(e.data.scores).filter((v) => typeof v === "number").length;
    if (noted) {
      if (!isWide(c)) throw new OpError(403, "Cette évaluation contient des notes : seule la direction peut la supprimer.");
      if (!i.confirm) throw new OpError(409, `Cette évaluation contient ${noted} note(s). Confirmez explicitement pour la supprimer.`);
    }
    await c.store.remove("exam", i.id);
    return ok("Évaluation supprimée.");
  },
  /** Saisie des notes : seules les valeurs envoyées changent ; chaque modification est tracée dans l'historique des fiches. */
  async "grades.save"(c, raw) {
    const i = z.object({ exam_id: id, scores: z.record(z.string(), z.union([z.literal(""), z.null(), z.coerce.number().finite()])) }).parse(raw);
    const e = await must<Exam>(c, "exam", i.exam_id, "Évaluation");
    await assertMay(c, e.data.class_id, e.data.subject_id);
    const students = (await list<Student>(c, "student")).filter((s) => s.data.class_id === e.data.class_id);
    const ids = new Set(students.map((s) => s.id));
    const next: Record<string, number | null> = {};
    for (const [sid, v] of Object.entries(i.scores)) {
      if (!ids.has(sid)) throw new OpError(422, "Une note concerne un élève qui n'est pas dans cette classe.");
      if (v === "" || v === null) { next[sid] = null; continue; }
      if (v < 0 || v > e.data.max) throw new OpError(422, `Note invalide : elle doit être comprise entre 0 et ${e.data.max}.`);
      next[sid] = round2(v);
    }
    await mutate<Exam>(c, "exam", i.exam_id, "Évaluation", (v) => ({ ...v, scores: { ...v.scores, ...next } }));
    return ok(`${Object.keys(next).length} note(s) enregistrée(s).`, { id: i.exam_id });
  },

  // ----- Présences -----
  async "attendance.save"(c, raw) {
    const i = z.object({ class_id: id, date, marks: z.record(z.string(), oneOf(MARKS)), note: txt(300) }).parse(raw);
    await must(c, "class", i.class_id, "Classe");
    await assertMay(c, i.class_id);
    const ids = new Set((await list<Student>(c, "student")).filter((s) => s.data.class_id === i.class_id).map((s) => s.id));
    for (const sid of Object.keys(i.marks)) if (!ids.has(sid)) throw new OpError(422, "Une présence concerne un élève qui n'est pas dans cette classe.");
    const cur = (await list<Attendance>(c, "attendance")).find((a) => a.data.class_id === i.class_id && a.data.date === i.date);
    const before = cur?.data.marks ?? {};
    const body = { class_id: i.class_id, date: i.date, marks: i.marks, note: i.note, by: c.actor.id } satisfies Attendance;
    if (cur) await mutate<Attendance>(c, "attendance", cur.id, "Appel", () => body);
    else await c.store.insert("attendance", body);
    const newAbsent = Object.entries(i.marks).filter(([sid, m]) => (m === "absent" || m === "retard") && before[sid] !== m).map(([sid]) => sid);
    return ok("Appel enregistré.", newAbsent.length ? { event: { kind: "absence", class_id: i.class_id, date: i.date, student_ids: newAbsent } } : {});
  },

  // ----- Finances -----
  async "fee.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), name: req(80, "Nom des frais"), kind: oneOf(FEE_KINDS), amount: pos, level_id: optId, mandatory: z.boolean().default(true) }).parse(raw);
    if (i.level_id) await must(c, "level", i.level_id, "Niveau");
    if (!i.id) { const d = await c.store.insert("fee", { name: i.name, kind: i.kind, amount: i.amount, level_id: i.level_id, mandatory: i.mandatory } satisfies Fee); return ok("Frais ajoutés. Ils sont facturés aux prochaines inscriptions ; les factures déjà émises ne changent pas.", { id: d.id }); }
    await mutate<Fee>(c, "fee", i.id, "Frais", (v) => ({ ...v, name: i.name, kind: i.kind, amount: i.amount, level_id: i.level_id, mandatory: i.mandatory }));
    return ok("Frais modifiés (les factures déjà émises ne changent pas).", { id: i.id });
  },
  async "fee.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await c.store.remove("fee", i.id);
    return ok("Frais supprimés du barème (les factures déjà émises ne changent pas).");
  },
  async "invoice.create"(c, raw) {
    const i = z.object({ student_id: id, lines: z.array(z.object({ label: req(120, "Libellé"), amount: pos })).min(1, "Ajoutez au moins une ligne").max(30), discount: amt.default(0) }).parse(raw);
    const st = await must<Student>(c, "student", i.student_id, "Élève");
    const sum = i.lines.reduce((a, l) => a + l.amount, 0);
    if (i.discount > sum) throw new OpError(422, "La remise dépasse le total.");
    const number = await createInvoice(c, st.id, st.data.year_id, i.lines, i.discount);
    return ok(`Facture ${number} créée.`, { number });
  },
  async "invoice.discount"(c, raw) {
    const i = z.object({ id, discount: amt }).parse(raw);
    const inv = await must<Invoice>(c, "invoice", i.id, "Facture");
    const sum = inv.data.lines.reduce((a, l) => a + l.amount, 0);
    if (i.discount > sum) throw new OpError(422, "La remise dépasse le total.");
    await mutate<Invoice>(c, "invoice", i.id, "Facture", (v) => {
      const total = invoiceTotal(v.lines, i.discount);
      if (total < v.payments.filter((p) => !p.cancelled).reduce((a, p) => a + p.amount, 0)) throw new OpError(409, "Cette remise ramènerait le total sous le montant déjà payé.");
      return { ...v, discount: i.discount, total };
    });
    return ok("Remise enregistrée.", { id: i.id });
  },
  /** Paiement : jamais au-delà du solde, jamais en double (identifiant `pid`), avec numéro de reçu unique et écriture de recette. */
  async "payment.add"(c, raw) {
    const i = z.object({ invoice_id: id, pid: id, amount: pos, method: oneOf(PAY_METHODS).default("especes"), date: optDate, note: txt(300) }).parse(raw);
    const inv = await must<Invoice>(c, "invoice", i.invoice_id, "Facture");
    if (inv.data.payments.some((p) => p.id === i.pid)) return ok("Paiement déjà enregistré.", { id: i.pid });
    if (i.amount > dueOf(inv.data)) throw new OpError(422, `Le montant dépasse le solde de la facture (${dueOf(inv.data)}).`);
    const day = i.date ?? today(nowD(c));
    const st = await must<Student>(c, "student", inv.data.student_id, "Élève");
    const receipt = `REC-${day.slice(0, 4)}-${String(await c.store.nextSeq(`receipt:${day.slice(0, 4)}`)).padStart(5, "0")}`;
    const tx = await c.store.insert("transaction", { type: "recette", amount: i.amount, category: "scolarite", date: day, description: `${receipt} · ${st.data.last_name} ${st.data.first_name}`, method: i.method, invoice_id: inv.id, by: c.actor.id } satisfies Transaction);
    const payment: Payment = { id: i.pid, receipt, amount: i.amount, method: i.method, date: day, by: c.actor.id, note: i.note, cancelled: false, tx_id: tx.id };
    try {
      const { written } = await mutate<Invoice>(c, "invoice", inv.id, "Facture", (v) => {
        if (v.payments.some((p) => p.id === i.pid)) return null;
        if (i.amount > dueOf(v)) throw new OpError(422, "Le montant dépasse le solde de la facture.");
        return { ...v, payments: [...v.payments, payment] };
      });
      if (!written) await c.store.remove("transaction", tx.id);
    } catch (e) { await c.store.remove("transaction", tx.id); throw e; }
    return ok(`Paiement de ${i.amount} enregistré (reçu ${receipt}).`, { id: i.pid, number: receipt });
  },
  /** Annulation : le paiement reste visible (barré) dans la facture pour la traçabilité ; la recette liée est retirée. */
  async "payment.cancel"(c, raw) {
    const i = z.object({ invoice_id: id, pid: id }).parse(raw);
    const inv = await must<Invoice>(c, "invoice", i.invoice_id, "Facture");
    const p = inv.data.payments.find((x) => x.id === i.pid);
    if (!p) throw new OpError(404, "Paiement introuvable.");
    if (p.cancelled) return ok("Paiement déjà annulé.");
    await mutate<Invoice>(c, "invoice", inv.id, "Facture", (v) => ({ ...v, payments: v.payments.map((x) => (x.id === i.pid ? { ...x, cancelled: true } : x)) }));
    if (p.tx_id) await c.store.remove("transaction", p.tx_id);
    return ok(`Paiement ${p.receipt} annulé. Il reste visible dans la facture.`);
  },
  async "transaction.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), type: z.enum(["recette", "depense"]), amount: pos, category: oneOf(TX_CATEGORIES), date, description: txt(300), method: oneOf(PAY_METHODS).default("especes") }).parse(raw);
    const base = { type: i.type, amount: i.amount, category: i.category, date: i.date, description: i.description, method: i.method };
    if (!i.id) { const d = await c.store.insert("transaction", { ...base, invoice_id: null, by: c.actor.id } satisfies Transaction); return ok("Écriture enregistrée.", { id: d.id }); }
    const cur = await must<Transaction>(c, "transaction", i.id, "Écriture");
    if (cur.data.invoice_id) throw new OpError(409, "Cette recette vient d'un paiement de scolarité : annulez le paiement dans la facture.");
    await mutate<Transaction>(c, "transaction", i.id, "Écriture", (v) => ({ ...v, ...base }));
    return ok("Écriture modifiée.", { id: i.id });
  },
  async "transaction.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    const cur = await must<Transaction>(c, "transaction", i.id, "Écriture");
    if (cur.data.invoice_id) throw new OpError(409, "Cette recette vient d'un paiement de scolarité : annulez le paiement dans la facture.");
    await c.store.remove("transaction", i.id);
    return ok("Écriture supprimée.");
  },

  // ----- Annonces -----
  async "announcement.save"(c, raw) {
    const i = z.object({ id: z.string().max(64).optional(), title: req(120, "Titre"), body: req(2000, "Message"), audience: oneOf(AUDIENCES).default("tous"), class_id: optId }).parse(raw);
    if (i.class_id) await must(c, "class", i.class_id, "Classe");
    const base = { title: i.title, body: i.body, audience: i.audience, class_id: i.class_id };
    if (!i.id) { const d = await c.store.insert("announcement", { ...base, date: today(nowD(c)), by: c.actor.id } satisfies Announcement); return ok("Annonce publiée.", { id: d.id, event: { kind: "announcement", id: d.id } }); }
    await mutate<Announcement>(c, "announcement", i.id, "Annonce", (v) => ({ ...v, ...base }));
    return ok("Annonce modifiée.", { id: i.id });
  },
  async "announcement.delete"(c, raw) {
    const i = z.object({ id }).parse(raw);
    await c.store.remove("announcement", i.id);
    return ok("Annonce supprimée.");
  },
};

async function setCurrentYear(c: OpContext, yearId: string) {
  for (const y of await list<Year>(c, "year")) {
    const want = y.id === yearId;
    if (y.data.current !== want) await mutate<Year>(c, "year", y.id, "Année", (v) => ({ ...v, current: want }));
  }
}
async function createInvoice(c: OpContext, studentId: string, yearId: string, lines: { label: string; amount: number }[], discount: number) {
  const year = (await c.store.get("year", yearId)) as Doc<Year> | null;
  const yy = year?.data.start.slice(2, 4) ?? String(nowD(c).getFullYear()).slice(2);
  const number = `FAC-${yy}-${String(await c.store.nextSeq(`invoice:${yy}`)).padStart(5, "0")}`;
  await c.store.insert("invoice", { number, student_id: studentId, year_id: yearId, lines, discount, total: invoiceTotal(lines, discount), payments: [], at: nowD(c).toISOString(), by: c.actor.id } satisfies Invoice);
  return number;
}
/** Relie un parent à un élève : un parent déjà connu (même téléphone) est réutilisé, ce qui évite les doublons entre frères et sœurs. */
async function linkGuardian(c: OpContext, studentId: string, g: Omit<Guardian, "student_ids"> | null, guardianId?: string): Promise<string> {
  let gid = guardianId;
  if (!gid && g) {
    const phoneKey = g.phone.replace(/\D/g, "");
    const known = phoneKey ? (await list<Guardian>(c, "guardian")).find((x) => x.data.phone.replace(/\D/g, "") === phoneKey) : undefined;
    if (known) {
      gid = known.id;
      await mutate<Guardian>(c, "guardian", known.id, "Parent", (v) => ({ ...v, student_ids: v.student_ids.includes(studentId) ? v.student_ids : [...v.student_ids, studentId] }));
    } else gid = (await c.store.insert("guardian", { ...g, student_ids: [studentId] } satisfies Guardian)).id;
  } else if (gid) {
    await mutate<Guardian>(c, "guardian", gid, "Parent", (v) => ({ ...v, student_ids: v.student_ids.includes(studentId) ? v.student_ids : [...v.student_ids, studentId] }));
  }
  if (!gid) throw new OpError(400, "Parent invalide.");
  await mutate<Student>(c, "student", studentId, "Élève", (v) => ({ ...v, guardian_ids: v.guardian_ids.includes(gid!) ? v.guardian_ids : [...v.guardian_ids, gid!] }));
  return gid;
}

export const ECOLE_OPS = Object.keys(HANDLERS);

export async function runOp(ctx: OpContext, op: string, input: unknown): Promise<OpResult> {
  try {
    const h = HANDLERS[op];
    if (!h) throw new OpError(400, "Opération inconnue.");
    if (LEVEL[ctx.actor.role] < 1) throw new OpError(403, "Votre rôle (lecture seule) ne permet pas de modifier les données.");
    const denied = opDenied(ECOLE_OP_PERMS, op, ctx.perms);
    if (denied) throw new OpError(403, denied);
    return await h(ctx, input);
  } catch (e) {
    if (e instanceof z.ZodError) throw new OpError(422, e.issues[0]?.message ?? "Données invalides.");
    throw e;
  }
}
