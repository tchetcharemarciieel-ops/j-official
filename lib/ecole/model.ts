/**
 * Module « MiniSoft École » : inscriptions, classes, notes et bulletins, présences, finances de
 * l'établissement, espace parents. Modèle partagé par le serveur, le navigateur et les tests.
 *
 * Les données sont rangées dans la table `records` existante sous des identifiants réservés
 * (« ec:… »). Chaque établissement est un projet MiniSoft : l'isolation repose sur `project_id`.
 * Aucune valeur n'est inventée : moyennes, rangs et soldes sont calculés sur les fiches saisies.
 */

export const COLLECTIONS = ["settings", "year", "level", "class", "subject", "assign", "teacher", "student", "guardian", "exam", "attendance", "fee", "invoice", "transaction", "announcement", "file", "counter"] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `ec:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("ec:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};
export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };
export type EcoleData = { [K in Col]: Doc[] };
export const emptyData = (): EcoleData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as EcoleData;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

export type EcoleRole = "owner" | "admin" | "manager" | "employee" | "viewer";
export const LEVEL: Record<EcoleRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };

export const CURRENCIES = {
  XAF: { label: "FCFA", name: "Franc CFA (XAF)", decimals: 0 },
  XOF: { label: "FCFA", name: "Franc CFA (XOF)", decimals: 0 },
  EUR: { label: "€", name: "Euro", decimals: 2 },
  USD: { label: "$", name: "Dollar américain", decimals: 2 },
  CDF: { label: "FC", name: "Franc congolais", decimals: 0 },
  GNF: { label: "GNF", name: "Franc guinéen", decimals: 0 },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const money = (n: number | null | undefined, code: CurrencyCode = "XAF") => {
  if (n === null || n === undefined) return "—";
  const c = CURRENCIES[code] ?? CURRENCIES.XAF;
  const v = c.decimals ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("fr-FR");
  return `${v} ${c.label}`;
};

// ---------- Établissement ----------
export const SCHOOL_TYPES = {
  maternelle: { label: "École maternelle", icon: "🧸" },
  primaire: { label: "École primaire", icon: "🎒" },
  college: { label: "Collège", icon: "📘" },
  lycee: { label: "Lycée", icon: "🎓" },
  college_lycee: { label: "Collège et lycée", icon: "🏫" },
  centre: { label: "Centre de formation", icon: "🛠️" },
  superieur: { label: "Établissement supérieur", icon: "🏛️" },
} as const;
export type SchoolType = keyof typeof SCHOOL_TYPES;
export const SCHOOL_TYPE_IDS = Object.keys(SCHOOL_TYPES) as SchoolType[];

export const SYSTEMS = { francophone: "Système francophone", anglophone: "Système anglophone", bilingue: "Système bilingue", autre: "Autre (précisé par l'établissement)" } as const;
export type SystemId = keyof typeof SYSTEMS;
export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];

/** Niveaux proposés à la création selon le type d'établissement (modifiables ensuite par la direction). */
export const DEFAULT_LEVELS: Record<SchoolType, string[]> = {
  maternelle: ["Petite section", "Moyenne section", "Grande section"],
  primaire: ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
  college: ["6ème", "5ème", "4ème", "3ème"],
  lycee: ["Seconde", "Première", "Terminale"],
  college_lycee: ["6ème", "5ème", "4ème", "3ème", "Seconde", "Première", "Terminale"],
  centre: ["1ère année", "2ème année"],
  superieur: ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2"],
};

export type Mention = { min: number; label: string };
export type Settings = {
  name: string;
  school_type: SchoolType;
  system: SystemId;
  system_note: string;
  address: string;
  phone: string;
  email: string;
  logo_id: string | null;
  students_count: number;
  teachers_count: number;
  classes_count: number;
  /** Découpage de l'année : 2 semestres ou 3 trimestres (ou davantage de périodes pour un centre de formation). */
  terms: number;
  term_label: "Trimestre" | "Semestre" | "Période";
  /** Barème (note maximale) et seuil de réussite, selon le règlement de l'établissement. */
  scale: number;
  pass_mark: number;
  mentions: Mention[];
  currency: CurrencyCode;
  primary: string;
  needs: string;
  bulletin_note: string;
};
export const defaultMentions = (scale = 20, pass = 10): Mention[] => [
  { min: round2(scale * 0.8), label: "Excellent" },
  { min: round2(scale * 0.7), label: "Très bien" },
  { min: round2(scale * 0.6), label: "Bien" },
  { min: round2(scale * 0.5), label: "Assez bien" },
  { min: pass, label: "Passable" },
  { min: 0, label: "Insuffisant" },
];
export const defaultSettings = (name = "Mon établissement", type: SchoolType = "college"): Settings => ({
  name, school_type: type, system: "francophone", system_note: "", address: "", phone: "", email: "", logo_id: null,
  students_count: 0, teachers_count: 0, classes_count: 0, terms: 3, term_label: "Trimestre", scale: 20, pass_mark: 10, mentions: defaultMentions(20, 10),
  currency: "XAF", primary: "#1d4ed8", needs: "", bulletin_note: "",
});
export function settingsOf(doc: Doc | undefined, fallbackName = "Mon établissement"): Settings {
  const d = defaultSettings(fallbackName);
  const s = (doc?.data ?? {}) as Partial<Settings>;
  const scale = s.scale ?? d.scale;
  return { ...d, ...s, mentions: s.mentions?.length ? [...s.mentions].sort((a, b) => b.min - a.min) : defaultMentions(scale, s.pass_mark ?? d.pass_mark) };
}
export const mentionOf = (avg: number | null, s: Pick<Settings, "mentions">) => (avg === null ? "" : (s.mentions.find((m) => avg >= m.min)?.label ?? ""));

// ---------- Structure ----------
export type Year = { name: string; start: string; end: string; current: boolean };
export type Level = { name: string; order: number };
export type Klass = { name: string; level_id: string; year_id: string; titular_id: string | null; capacity: number | null };
export type Subject = { name: string; code: string };
/** Matière enseignée dans une classe : enseignant et coefficient propres à la classe. */
export type Assign = { class_id: string; subject_id: string; teacher_id: string | null; coef: number };
export type Teacher = { name: string; phone: string; email: string; user_id: string | null; specialty: string; status: "actif" | "inactif" };

export const STUDENT_STATUS = { inscrit: "Inscrit", transfere: "Transféré", abandon: "Abandon", diplome: "Diplômé" } as const;
export type StudentStatus = keyof typeof STUDENT_STATUS;
export type Student = {
  matricule: string; first_name: string; last_name: string; sex: "M" | "F"; birth_date: string | null; birth_place: string;
  class_id: string; year_id: string; status: StudentStatus; enrolled_at: string; guardian_ids: string[]; previous_school: string; notes: string;
};
export type Guardian = { name: string; phone: string; email: string; relation: string; user_id: string | null; student_ids: string[] };
export const studentName = (s: Pick<Student, "first_name" | "last_name">) => `${s.last_name.toUpperCase()} ${s.first_name}`.trim();

// ---------- Évaluations et notes ----------
export const EXAM_KINDS = { interro: "Interrogation", devoir: "Devoir", composition: "Composition", examen: "Examen" } as const;
export type ExamKind = keyof typeof EXAM_KINDS;
/** Une évaluation et les notes de toute la classe (null = non noté ou absent). */
export type Exam = { name: string; class_id: string; subject_id: string; term: number; kind: ExamKind; date: string; max: number; weight: number; scores: Record<string, number | null>; by: string };

export type SubjectLine = { subject_id: string; avg: number | null; coef: number };
export type Row = { student_id: string; subjects: SubjectLine[]; general: number | null; rank: number | null; mention: string };
export type ClassReport = { class_id: string; term: number | "annuel"; rows: Row[]; stats: { size: number; graded: number; mean: number | null; best: number | null; worst: number | null; passRate: number | null } };

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Moyenne d'un élève dans une matière sur la période : moyenne pondérée des évaluations, ramenées au barème de l'établissement. */
export function subjectAverage(exams: Doc<Exam>[], studentId: string, scale: number): number | null {
  let sum = 0, w = 0;
  for (const e of exams) {
    const v = e.data.scores[studentId];
    if (typeof v !== "number" || !(e.data.max > 0)) continue;
    const weight = e.data.weight > 0 ? e.data.weight : 1;
    sum += (v / e.data.max) * scale * weight;
    w += weight;
  }
  return w ? round2(sum / w) : null;
}

/**
 * Bulletin d'une classe pour une période : moyennes par matière, moyenne générale pondérée par les
 * coefficients de la classe (matières sans note ignorées), rang (égalités = même rang), mention.
 */
export function termReport(p: { klass: Doc<Klass>; term: number; students: Doc<Student>[]; assigns: Doc<Assign>[]; exams: Doc<Exam>[]; settings: Settings }): ClassReport {
  const { settings: s } = p;
  const students = p.students.filter((x) => x.data.class_id === p.klass.id && x.data.status === "inscrit");
  const assigns = p.assigns.filter((a) => a.data.class_id === p.klass.id);
  const exams = p.exams.filter((e) => e.data.class_id === p.klass.id && e.data.term === p.term);
  const rows: Row[] = students.map((st) => {
    const subjects = assigns.map((a) => ({ subject_id: a.data.subject_id, coef: a.data.coef, avg: subjectAverage(exams.filter((e) => e.data.subject_id === a.data.subject_id), st.id, s.scale) }));
    const used = subjects.filter((x) => x.avg !== null);
    const cw = used.reduce((a, x) => a + x.coef, 0);
    const general = cw > 0 ? round2(used.reduce((a, x) => a + (x.avg as number) * x.coef, 0) / cw) : null;
    return { student_id: st.id, subjects, general, rank: null, mention: mentionOf(general, s) };
  });
  return finish(rows, p.klass.id, p.term, s);
}

/** Moyenne annuelle : moyenne des moyennes générales des périodes qui ont des notes. */
export function annualReport(p: { klass: Doc<Klass>; students: Doc<Student>[]; assigns: Doc<Assign>[]; exams: Doc<Exam>[]; settings: Settings }): ClassReport {
  const terms = Array.from({ length: p.settings.terms }, (_, i) => termReport({ ...p, term: i + 1 }));
  const base = terms[0]?.rows ?? [];
  const rows: Row[] = base.map((b) => {
    const gens = terms.map((t) => t.rows.find((r) => r.student_id === b.student_id)?.general).filter((x): x is number => typeof x === "number");
    const general = gens.length ? round2(avgOf(gens) as number) : null;
    const subjects = b.subjects.map((sub) => {
      const avgs = terms.map((t) => t.rows.find((r) => r.student_id === b.student_id)?.subjects.find((x) => x.subject_id === sub.subject_id)?.avg).filter((x): x is number => typeof x === "number");
      return { ...sub, avg: avgs.length ? round2(avgOf(avgs) as number) : null };
    });
    return { student_id: b.student_id, subjects, general, rank: null, mention: mentionOf(general, p.settings) };
  });
  return finish(rows, p.klass.id, "annuel", p.settings);
}

function finish(rows: Row[], classId: string, term: number | "annuel", s: Settings): ClassReport {
  const graded = rows.filter((r) => r.general !== null).sort((a, b) => (b.general as number) - (a.general as number));
  graded.forEach((r) => { r.rank = 1 + graded.filter((o) => (o.general as number) > (r.general as number)).length; });
  const gens = graded.map((r) => r.general as number);
  const stats = {
    size: rows.length, graded: graded.length,
    mean: gens.length ? round2(avgOf(gens) as number) : null,
    best: gens.length ? Math.max(...gens) : null, worst: gens.length ? Math.min(...gens) : null,
    passRate: gens.length ? Math.round((gens.filter((g) => g >= s.pass_mark).length / gens.length) * 100) : null,
  };
  return { class_id: classId, term, rows, stats };
}

/** Données manquantes à signaler à la direction : classes sans élève, matières sans enseignant, évaluations non saisies. */
export function missingData(d: Pick<EcoleData, "class" | "student" | "assign" | "exam" | "teacher" | "guardian" | "subject">) {
  const out: { kind: string; label: string }[] = [];
  const students = d.student as Doc<Student>[];
  for (const c of d.class as Doc<Klass>[]) {
    const here = students.filter((s) => s.data.class_id === c.id && s.data.status === "inscrit");
    if (!here.length) out.push({ kind: "classe", label: `Classe ${c.data.name} : aucun élève inscrit.` });
    const as = (d.assign as Doc<Assign>[]).filter((a) => a.data.class_id === c.id);
    if (!as.length) out.push({ kind: "matieres", label: `Classe ${c.data.name} : aucune matière affectée.` });
    for (const a of as) if (!a.data.teacher_id) out.push({ kind: "enseignant", label: `Classe ${c.data.name} : ${(d.subject as Doc<Subject>[]).find((x) => x.id === a.data.subject_id)?.data.name ?? "matière"} sans enseignant.` });
  }
  for (const e of d.exam as Doc<Exam>[]) {
    const here = students.filter((s) => s.data.class_id === e.data.class_id && s.data.status === "inscrit");
    const missing = here.filter((s) => typeof e.data.scores[s.id] !== "number").length;
    if (missing) out.push({ kind: "notes", label: `${e.data.name} : ${missing} note(s) non saisie(s) sur ${here.length}.` });
  }
  for (const s of students) if (s.data.status === "inscrit" && !(d.guardian as Doc<Guardian>[]).some((g) => g.data.student_ids.includes(s.id))) out.push({ kind: "parent", label: `${studentName(s.data)} : aucun parent ou tuteur renseigné.` });
  return out;
}

// ---------- Présences ----------
export const MARKS = { present: "Présent", absent: "Absent", retard: "Retard", excuse: "Excusé" } as const;
export type Mark = keyof typeof MARKS;
export type Attendance = { class_id: string; date: string; marks: Record<string, Mark>; note: string; by: string };
export function attendanceStats(att: Doc<Attendance>[], studentId: string) {
  let present = 0, absent = 0, late = 0, excused = 0;
  for (const a of att) {
    const m = a.data.marks[studentId];
    if (m === "present") present++; else if (m === "absent") absent++; else if (m === "retard") late++; else if (m === "excuse") excused++;
  }
  const total = present + absent + late + excused;
  return { present, absent, late, excused, total, rate: total ? Math.round(((present + late + excused) / total) * 100) : null };
}

// ---------- Finances ----------
export const FEE_KINDS = { inscription: "Inscription", scolarite: "Scolarité", autre: "Autre frais" } as const;
export type FeeKind = keyof typeof FEE_KINDS;
/** Frais prévus : pour un niveau précis ou pour tous (level_id vide). Facturés à l'inscription si obligatoires. */
export type Fee = { name: string; kind: FeeKind; amount: number; level_id: string | null; mandatory: boolean };
export const PAY_METHODS = { especes: "Espèces", mobile_money: "Paiement mobile", virement: "Virement", cheque: "Chèque" } as const;
export type PayMethod = keyof typeof PAY_METHODS;
export type Payment = { id: string; receipt: string; amount: number; method: PayMethod; date: string; by: string; note: string; cancelled: boolean; tx_id: string | null };
export type Invoice = { number: string; student_id: string; year_id: string; lines: { label: string; amount: number }[]; discount: number; total: number; payments: Payment[]; at: string; by: string };
export const invoiceTotal = (lines: { amount: number }[], discount = 0) => Math.max(0, round2(lines.reduce((a, l) => a + l.amount, 0) - discount));
export const paidOf = (i: Pick<Invoice, "payments">) => round2(i.payments.filter((p) => !p.cancelled).reduce((a, p) => a + p.amount, 0));
export const dueOf = (i: Pick<Invoice, "payments" | "total">) => Math.max(0, round2(i.total - paidOf(i)));
export const TX_CATEGORIES = { scolarite: "Frais scolaires", salaires: "Salaires", fournitures: "Fournitures", entretien: "Entretien", loyer: "Loyer", eau_elec: "Eau et électricité", transport: "Transport scolaire", autre: "Autres" } as const;
export type TxCategory = keyof typeof TX_CATEGORIES;
export type Transaction = { type: "recette" | "depense"; amount: number; category: TxCategory; date: string; description: string; method: PayMethod; invoice_id: string | null; by: string };

export function financeStats(invoices: Doc<Invoice>[], txs: Doc<Transaction>[], day = today()) {
  const due = invoices.reduce((a, i) => a + dueOf(i.data), 0);
  const billed = invoices.reduce((a, i) => a + i.data.total, 0);
  const paid = invoices.reduce((a, i) => a + paidOf(i.data), 0);
  const rec = txs.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0);
  const dep = txs.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0);
  const recDay = txs.filter((t) => t.data.type === "recette" && t.data.date === day).reduce((a, t) => a + t.data.amount, 0);
  return { billed: round2(billed), paid: round2(paid), due: round2(due), unpaid: invoices.filter((i) => dueOf(i.data) > 0).length, revenue: round2(rec), expense: round2(dep), result: round2(rec - dep), revenueDay: round2(recDay) };
}
export function monthlySeries(txs: Doc<Transaction>[], now = new Date(), months = 6) {
  const out: { ym: string; label: string; income: number; expense: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = txs.filter((t) => t.data.date.startsWith(ym));
    out.push({ ym, label: d.toLocaleDateString("fr-FR", { month: "short" }), income: round2(list.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0)), expense: round2(list.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0)) });
  }
  return out;
}

export const AUDIENCES = { tous: "Tout le monde", parents: "Parents", enseignants: "Enseignants", personnel: "Personnel" } as const;
export type Audience = keyof typeof AUDIENCES;
export type Announcement = { title: string; body: string; audience: Audience; class_id: string | null; date: string; by: string };
export type FileDoc = { name: string; mime: string; size: number; data: string };
