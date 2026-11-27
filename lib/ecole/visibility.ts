import { has, type Permission } from "../team";
import { annualReport, settingsOf, termReport, type Announcement, type Assign, type Attendance, type Doc, type EcoleData, type Exam, type Guardian, type Klass, type Student, type Teacher } from "./model";

/** Compte « parent » : aucun autre droit que la consultation de ses propres enfants. */
export const isParentOnly = (perms: Permission[] | null) => perms !== null && perms.includes("espace_parent") && perms.every((p) => p === "espace_parent");
const isWide = (perms: Permission[] | null) => perms === null || has(perms, "classes") || perms.length === 0;

export type ChildReport = { student_id: string; terms: { term: number; general: number | null; rank: number | null; size: number; mention: string; class_mean: number | null; subjects: { subject_id: string; avg: number | null; coef: number }[] }[]; annual: { general: number | null; rank: number | null; size: number; mention: string } };

/** Moyennes et rangs d'un enfant, calculés par le serveur : le parent ne reçoit jamais les notes des autres élèves. */
export function childReports(all: EcoleData, studentIds: string[]): ChildReport[] {
  const settings = settingsOf(all.settings[0]);
  const students = all.student as Doc<Student>[];
  const out: ChildReport[] = [];
  for (const sid of studentIds) {
    const st = students.find((x) => x.id === sid);
    const klass = st && (all.class as Doc<Klass>[]).find((k) => k.id === st.data.class_id);
    if (!st || !klass) continue;
    const common = { klass, students, assigns: all.assign as Doc<Assign>[], exams: all.exam as Doc<Exam>[], settings };
    const terms = Array.from({ length: settings.terms }, (_, i) => {
      const r = termReport({ ...common, term: i + 1 });
      const row = r.rows.find((x) => x.student_id === sid);
      return { term: i + 1, general: row?.general ?? null, rank: row?.rank ?? null, size: r.stats.graded, mention: row?.mention ?? "", class_mean: r.stats.mean, subjects: row?.subjects ?? [] };
    });
    const an = annualReport(common);
    const arow = an.rows.find((x) => x.student_id === sid);
    out.push({ student_id: sid, terms, annual: { general: arow?.general ?? null, rank: arow?.rank ?? null, size: an.stats.graded, mention: arow?.mention ?? "" } });
  }
  return out;
}

/**
 * Données renvoyées à une personne selon son rôle et son poste (le serveur filtre ici) :
 * - direction et administration : tout ;
 * - enseignant : seulement ses classes, ses matières et leurs notes, sans finances ;
 * - comptable : élèves et finances, sans notes ni présences ;
 * - parent : uniquement ses enfants (notes filtrées sur l'enfant), ses factures et les annonces des parents.
 */
export function visibleData(data: EcoleData, me: string, perms: Permission[] | null): EcoleData {
  const out: EcoleData = { ...data, file: [], counter: [] };
  const may = (p: Permission | Permission[]) => has(perms, p);
  const money = may("finances");
  out.invoice = money ? data.invoice : [];
  out.transaction = money ? data.transaction : [];
  out.fee = money ? data.fee : [];
  const annFor = (audiences: string[], classIds: Set<string> | null) =>
    (data.announcement as Doc<Announcement>[]).filter((a) => audiences.includes(a.data.audience) && (!a.data.class_id || !classIds || classIds.has(a.data.class_id)));

  if (isParentOnly(perms)) {
    const mine = (data.guardian as Doc<Guardian>[]).filter((g) => g.data.user_id === me);
    const kids = new Set(mine.flatMap((g) => g.data.student_ids));
    const students = (data.student as Doc<Student>[]).filter((s) => kids.has(s.id));
    const classIds = new Set(students.map((s) => s.data.class_id));
    const only = (scores: Record<string, number | null>) => Object.fromEntries(Object.entries(scores).filter(([k]) => kids.has(k)));
    out.student = students;
    out.guardian = mine;
    out.class = (data.class as Doc<Klass>[]).filter((k) => classIds.has(k.id));
    out.assign = (data.assign as Doc<Assign>[]).filter((a) => classIds.has(a.data.class_id));
    out.exam = (data.exam as Doc<Exam>[]).filter((e) => classIds.has(e.data.class_id)).map((e) => ({ ...e, data: { ...e.data, scores: only(e.data.scores) } }));
    out.attendance = (data.attendance as Doc<Attendance>[]).filter((a) => classIds.has(a.data.class_id)).map((a) => ({ ...a, data: { ...a.data, marks: Object.fromEntries(Object.entries(a.data.marks).filter(([k]) => kids.has(k))) } }));
    out.invoice = (data.invoice as Doc[]).filter((i) => kids.has(String((i.data as { student_id: string }).student_id)));
    out.teacher = [];
    out.transaction = [];
    out.fee = [];
    out.announcement = annFor(["tous", "parents"], classIds);
    return out;
  }

  if (!isWide(perms) && !may("eleves") && (may("notes") || may("presences"))) {
    // Enseignant ou poste limité : périmètre = classes où la personne enseigne ou est titulaire.
    const t = (data.teacher as Doc<Teacher>[]).find((x) => x.data.user_id === me);
    const assigns = t ? (data.assign as Doc<Assign>[]).filter((a) => a.data.teacher_id === t.id) : [];
    const classIds = new Set([...assigns.map((a) => a.data.class_id), ...(t ? (data.class as Doc<Klass>[]).filter((k) => k.data.titular_id === t.id).map((k) => k.id) : [])]);
    const teaches = (e: Doc<Exam>) => assigns.some((a) => a.data.class_id === e.data.class_id && a.data.subject_id === e.data.subject_id);
    out.teacher = t ? [t] : [];
    out.class = (data.class as Doc<Klass>[]).filter((k) => classIds.has(k.id));
    out.assign = (data.assign as Doc<Assign>[]).filter((a) => classIds.has(a.data.class_id));
    out.student = (data.student as Doc<Student>[]).filter((s) => classIds.has(s.data.class_id));
    // Un enseignant ne voit les notes que de ses propres évaluations (matières qu'il enseigne).
    out.exam = may(["notes", "bulletins"]) ? (data.exam as Doc<Exam>[]).filter(teaches) : [];
    out.attendance = may("presences") ? (data.attendance as Doc<Attendance>[]).filter((a) => classIds.has(a.data.class_id)) : [];
    out.guardian = [];
    out.announcement = annFor(["tous", "enseignants", "personnel"], classIds);
    return out;
  }

  // Direction, administration, secrétariat, comptabilité.
  if (!may(["notes", "bulletins", "classes"])) out.exam = [];
  if (!may(["presences", "classes", "eleves"])) out.attendance = [];
  if (!may(["eleves", "finances", "classes", "rapports", "notes", "bulletins", "presences"])) out.student = [];
  if (!may(["eleves", "finances", "classes"])) out.guardian = [];
  out.announcement = data.announcement;
  return out;
}

/** Le logo de l'établissement est le seul fichier servi par l'API. */
export const fileAllowed = (logoId: string | null, fileId: string) => Boolean(logoId) && logoId === fileId;
