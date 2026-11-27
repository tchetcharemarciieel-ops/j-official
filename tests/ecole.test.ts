import { describe, expect, it } from "vitest";
import { runOp, OpError, type OpContext } from "@/lib/ecole/engine";
import type { EcoleRole } from "@/lib/ecole/model";
import { MemoryStore } from "@/lib/ecole/memory-store";
import { annualReport, dueOf, financeStats, missingData, subjectAverage, termReport, type Assign, type Doc, type Exam, type Guardian, type Invoice, type Klass, type Student } from "@/lib/ecole/model";
import { childReports, isParentOnly, visibleData } from "@/lib/ecole/visibility";
import type { Permission } from "@/lib/team";

const DIR: { id: string; role: EcoleRole } = { id: "dir", role: "manager" };
const store = () => new MemoryStore();
const ctx = (s: MemoryStore, actor = DIR, perms: Permission[] | null = null, members = ["dir", "t1", "p1"]): OpContext => ({ store: s, actor, perms, members, now: () => new Date("2026-10-05T08:00:00Z") });
const ok = async (c: OpContext, op: string, input: unknown) => runOp(c, op, input);
const fail = async (c: OpContext, op: string, input: unknown) => runOp(c, op, input).then(() => null, (e: unknown) => e as OpError);

/** Établissement de test : 1 année, 1 niveau, 1 classe, 2 matières (coef 2 et 1), 1 enseignant, frais d'inscription et de scolarité. */
async function setup(s = store()) {
  const c = ctx(s);
  const year = (await ok(c, "year.save", { name: "2026-2027", start: "2026-09-01", end: "2027-06-30", current: true })).id!;
  const level = (await ok(c, "level.save", { name: "6ème", order: 1 })).id!;
  const teacher = (await ok(c, "teacher.save", { name: "M. Ngoma", user_id: "t1" })).id!;
  const klass = (await ok(c, "class.save", { name: "6ème A", level_id: level, year_id: year, titular_id: teacher, capacity: 3 })).id!;
  const maths = (await ok(c, "subject.save", { name: "Mathématiques" })).id!;
  const fr = (await ok(c, "subject.save", { name: "Français" })).id!;
  await ok(c, "assign.save", { class_id: klass, subject_id: maths, teacher_id: teacher, coef: 2 });
  await ok(c, "assign.save", { class_id: klass, subject_id: fr, teacher_id: null, coef: 1 });
  await ok(c, "fee.save", { name: "Inscription", kind: "inscription", amount: 10000, level_id: null, mandatory: true });
  await ok(c, "fee.save", { name: "Scolarité", kind: "scolarite", amount: 50000, level_id: level, mandatory: true });
  return { s, c, year, level, teacher, klass, maths, fr };
}
const enroll = (c: OpContext, klass: string, first: string, extra: object = {}) => ok(c, "student.enroll", { first_name: first, last_name: "Dupont", sex: "F", birth_date: "2014-03-01", class_id: klass, guardian: { name: "Mme Dupont", phone: "+236 70 00 00 01" }, ...extra });

describe("inscriptions", () => {
  it("inscrit un élève avec matricule, parent et facture des frais obligatoires", async () => {
    const { c, s, klass } = await setup();
    const r = await enroll(c, klass, "Awa");
    expect(r.matricule).toBe("260001");
    expect(r.number).toBe("FAC-26-00001");
    const inv = (await s.list("invoice"))[0] as Doc<Invoice>;
    expect(inv.data.total).toBe(60000);
    expect((await s.list("guardian")).length).toBe(1);
  });
  it("refuse un doublon et une classe complète, réutilise le parent d'un frère ou d'une sœur", async () => {
    const { c, s, klass } = await setup();
    await enroll(c, klass, "Awa");
    expect((await fail(c, "student.enroll", { first_name: "Awa", last_name: "Dupont", sex: "F", birth_date: "2014-03-01", class_id: klass }))?.status).toBe(409);
    await enroll(c, klass, "Binta", { birth_date: "2015-01-01" });
    expect((await s.list("guardian")).length).toBe(1);
    await enroll(c, klass, "Coly", { birth_date: "2016-01-01" });
    expect((await fail(c, "student.enroll", { first_name: "Dia", last_name: "Dupont", sex: "M", class_id: klass }))?.message).toMatch(/complète/);
  });
  it("ne supprime pas un élève qui a des factures", async () => {
    const { c, klass } = await setup();
    const r = await enroll(c, klass, "Awa");
    expect((await fail(c, "student.delete", { id: r.id }))?.status).toBe(409);
  });
});

describe("notes, moyennes et classement", () => {
  async function graded() {
    const base = await setup();
    const a = (await enroll(base.c, base.klass, "Awa")).id!;
    const b = (await enroll(base.c, base.klass, "Binta", { birth_date: "2015-01-01" })).id!;
    const m = (await ok(base.c, "exam.save", { name: "Devoir 1", class_id: base.klass, subject_id: base.maths, term: 1, kind: "devoir", date: "2026-10-10", max: 20, weight: 1 })).id!;
    const f = (await ok(base.c, "exam.save", { name: "Dictée", class_id: base.klass, subject_id: base.fr, term: 1, kind: "devoir", date: "2026-10-11", max: 10, weight: 1 })).id!;
    await ok(base.c, "grades.save", { exam_id: m, scores: { [a]: 16, [b]: 10 } });
    await ok(base.c, "grades.save", { exam_id: f, scores: { [a]: 5, [b]: 9 } });
    return { ...base, a, b, m, f };
  }
  it("calcule moyennes pondérées (coefficients), rang et mention selon le barème", async () => {
    const { s, a, b, klass } = await graded();
    const st = (await s.list("student")) as Doc<Student>[];
    const rep = termReport({ klass: (await s.get("class", klass)) as Doc<Klass>, term: 1, students: st, assigns: (await s.list("assign")) as Doc<Assign>[], exams: (await s.list("exam")) as Doc<Exam>[], settings: (await import("@/lib/ecole/model")).settingsOf(undefined) });
    const ra = rep.rows.find((r) => r.student_id === a)!, rb = rep.rows.find((r) => r.student_id === b)!;
    // Awa : maths 16/20 (coef 2), français 5/10 = 10/20 (coef 1) → (32 + 10) / 3 = 14
    expect(ra.general).toBe(14);
    expect(ra.mention).toBe("Très bien");
    // Binta : maths 10, français 9/10 = 18/20 → (20 + 18) / 3 = 12,67
    expect(rb.general).toBe(12.67);
    expect(ra.rank).toBe(1);
    expect(rb.rank).toBe(2);
    expect(rep.stats.mean).toBe(13.34);
    expect(rep.stats.passRate).toBe(100);
  });
  it("calcule la moyenne annuelle sur les périodes notées", async () => {
    const { s, a, klass } = await graded();
    const rep = annualReport({ klass: (await s.get("class", klass)) as Doc<Klass>, students: (await s.list("student")) as Doc<Student>[], assigns: (await s.list("assign")) as Doc<Assign>[], exams: (await s.list("exam")) as Doc<Exam>[], settings: (await import("@/lib/ecole/model")).settingsOf(undefined) });
    expect(rep.rows.find((r) => r.student_id === a)?.general).toBe(14);
  });
  it("ignore les matières sans note et gère les évaluations pondérées", () => {
    const e = (max: number, weight: number, v: number | null): Doc<Exam> => ({ id: "e", created_at: "", updated_at: "", data: { name: "", class_id: "c", subject_id: "s", term: 1, kind: "devoir", date: "", max, weight, scores: { x: v }, by: "" } });
    expect(subjectAverage([e(20, 1, 10), e(20, 3, 18)], "x", 20)).toBe(16);
    expect(subjectAverage([e(20, 1, null)], "x", 20)).toBeNull();
  });
  it("refuse une note hors barème et un élève d'une autre classe", async () => {
    const { c, m, a } = await graded();
    expect((await fail(c, "grades.save", { exam_id: m, scores: { [a]: 25 } }))?.status).toBe(422);
    expect((await fail(c, "grades.save", { exam_id: m, scores: { inconnu: 10 } }))?.status).toBe(422);
  });
  it("un enseignant ne saisit que les notes de sa matière et de ses classes", async () => {
    const { s, m, f, a, klass } = await graded();
    const teacher = ctx(s, { id: "t1", role: "employee" }, ["notes", "presences", "bulletins"]);
    expect((await ok(teacher, "grades.save", { exam_id: m, scores: { [a]: 17 } })).message).toMatch(/enregistrée/);
    expect((await fail(teacher, "grades.save", { exam_id: f, scores: { [a]: 6 } }))?.status).toBe(403); // français : pas son enseignement
    const stranger = ctx(s, { id: "t9", role: "employee" }, ["notes", "presences", "bulletins"]);
    expect((await fail(stranger, "grades.save", { exam_id: m, scores: { [a]: 1 } }))?.status).toBe(403);
    expect((await fail(teacher, "fee.save", { name: "x", kind: "autre", amount: 1, level_id: null }))?.status).toBe(403);
    expect(klass).toBeTruthy();
  });
  it("ne supprime pas une évaluation notée sans accord explicite de la direction", async () => {
    const { c, s, m } = await graded();
    expect((await fail(c, "exam.delete", { id: m }))?.status).toBe(409);
    const teacher = ctx(s, { id: "t1", role: "employee" }, ["notes", "presences", "bulletins"]);
    expect((await fail(teacher, "exam.delete", { id: m, confirm: true }))?.status).toBe(403);
    expect((await ok(c, "exam.delete", { id: m, confirm: true })).message).toMatch(/supprimée/);
  });
  it("signale les données manquantes", async () => {
    const { s } = await graded();
    const miss = missingData({ class: await s.list("class"), student: await s.list("student"), assign: await s.list("assign"), exam: await s.list("exam"), teacher: await s.list("teacher"), guardian: await s.list("guardian"), subject: await s.list("subject") });
    expect(miss.some((x) => x.kind === "enseignant" && x.label.includes("Français"))).toBe(true);
  });
});

describe("finances", () => {
  it("encaisse sans dépasser le solde, une seule fois par identifiant, avec reçu et recette", async () => {
    const { c, s, klass } = await setup();
    await enroll(c, klass, "Awa");
    const inv = (await s.list("invoice"))[0] as Doc<Invoice>;
    const pay = (pid: string, amount: number) => ok(c, "payment.add", { invoice_id: inv.id, pid, amount, method: "especes" });
    const r = await pay("11111111-1111-4111-8111-111111111111", 25000);
    expect(r.number).toBe("REC-2026-00001");
    await pay("11111111-1111-4111-8111-111111111111", 25000); // même identifiant : pas de doublon
    expect(((await s.get("invoice", inv.id)) as Doc<Invoice>).data.payments).toHaveLength(1);
    expect(await s.list("transaction")).toHaveLength(1);
    expect((await fail(c, "payment.add", { invoice_id: inv.id, pid: "22222222-2222-4222-8222-222222222222", amount: 40000 }))?.status).toBe(422);
    const after = (await s.get("invoice", inv.id)) as Doc<Invoice>;
    expect(dueOf(after.data)).toBe(35000);
    const stats = financeStats((await s.list("invoice")) as Doc<Invoice>[], (await s.list("transaction")) as never, "2026-10-05");
    expect(stats).toMatchObject({ billed: 60000, paid: 25000, due: 35000, unpaid: 1, revenue: 25000 });
  });
  it("annule un paiement sans l'effacer et retire la recette", async () => {
    const { c, s, klass } = await setup();
    await enroll(c, klass, "Awa");
    const inv = (await s.list("invoice"))[0] as Doc<Invoice>;
    await ok(c, "payment.add", { invoice_id: inv.id, pid: "33333333-3333-4333-8333-333333333333", amount: 10000 });
    await ok(c, "payment.cancel", { invoice_id: inv.id, pid: "33333333-3333-4333-8333-333333333333" });
    const after = (await s.get("invoice", inv.id)) as Doc<Invoice>;
    expect(after.data.payments[0]!.cancelled).toBe(true);
    expect(dueOf(after.data)).toBe(60000);
    expect(await s.list("transaction")).toHaveLength(0);
  });
  it("seul un poste finances encaisse ; le secrétariat inscrit mais n'encaisse pas", async () => {
    const { s, klass } = await setup();
    const sec = ctx(s, { id: "sec", role: "employee" }, ["eleves", "classes", "presences", "annonces", "bulletins", "rapports"]);
    expect((await enroll(sec, klass, "Awa")).matricule).toBeTruthy();
    const inv = (await s.list("invoice"))[0] as Doc<Invoice>;
    expect((await fail(sec, "payment.add", { invoice_id: inv.id, pid: "44444444-4444-4444-8444-444444444444", amount: 100 }))?.status).toBe(403);
    const acc = ctx(s, { id: "acc", role: "employee" }, ["finances", "rapports"]);
    expect((await ok(acc, "payment.add", { invoice_id: inv.id, pid: "44444444-4444-4444-8444-444444444444", amount: 100 })).number).toBeTruthy();
    expect((await fail(acc, "exam.save", {}))?.status).toBe(403);
  });
});

describe("présences", () => {
  it("enregistre l'appel et signale les nouvelles absences (notification aux parents)", async () => {
    const { c, klass, s } = await setup();
    const a = (await enroll(c, klass, "Awa")).id!;
    const r = await ok(c, "attendance.save", { class_id: klass, date: "2026-10-05", marks: { [a]: "absent" } });
    expect(r.event).toMatchObject({ kind: "absence", student_ids: [a] });
    const again = await ok(c, "attendance.save", { class_id: klass, date: "2026-10-05", marks: { [a]: "absent" } });
    expect(again.event).toBeUndefined();
    expect(await s.list("attendance")).toHaveLength(1);
  });
});

describe("confidentialité des dossiers", () => {
  it("le parent ne voit que ses enfants, ses factures et les notes de son enfant", async () => {
    const { c, s, klass, m } = await (async () => {
      const b = await setup();
      const a = (await enroll(b.c, b.klass, "Awa")).id!;
      const o = (await enroll(b.c, b.klass, "Omar", { birth_date: "2015-05-05", guardian: { name: "M. Autre", phone: "+236 70 99 99 99" } })).id!;
      const e = (await ok(b.c, "exam.save", { name: "D1", class_id: b.klass, subject_id: b.maths, term: 1, kind: "devoir", date: "2026-10-10", max: 20, weight: 1 })).id!;
      await ok(b.c, "grades.save", { exam_id: e, scores: { [a]: 15, [o]: 8 } });
      const g = ((await b.s.list("guardian")) as Doc<Guardian>[]).find((x) => x.data.name === "Mme Dupont")!;
      await ok(b.c, "guardian.save", { id: g.id, student_id: a, name: g.data.name, phone: g.data.phone, user_id: "p1" });
      return { ...b, m: e };
    })();
    const perms: Permission[] = ["espace_parent"];
    expect(isParentOnly(perms)).toBe(true);
    const all = { ...(await (async () => { const d: Record<string, Doc[]> = {}; for (const k of ["settings", "year", "level", "class", "subject", "assign", "teacher", "student", "guardian", "exam", "attendance", "fee", "invoice", "transaction", "announcement", "file", "counter"]) d[k] = await s.list(k as never); return d; })()) } as never;
    const v = visibleData(all, "p1", perms);
    expect(v.student).toHaveLength(1);
    expect(v.invoice).toHaveLength(1);
    expect(v.teacher).toHaveLength(0);
    expect(v.transaction).toHaveLength(0);
    expect(Object.keys((v.exam[0] as Doc<Exam>).data.scores)).toHaveLength(1);
    const rep = childReports(all, v.student.map((x) => x.id));
    expect(rep[0]!.terms[0]!.general).toBe(15);
    expect(rep[0]!.terms[0]!.rank).toBe(1);
    expect(rep[0]!.terms[0]!.size).toBe(2);
    expect(klass && c && m).toBeTruthy();
  });
  it("le comptable ne voit ni les notes ni les présences ; l'enseignant ne voit ni finances ni autres classes", async () => {
    const b = await setup();
    await enroll(b.c, b.klass, "Awa");
    const all = await (async () => { const d: Record<string, Doc[]> = {}; for (const k of ["settings", "year", "level", "class", "subject", "assign", "teacher", "student", "guardian", "exam", "attendance", "fee", "invoice", "transaction", "announcement", "file", "counter"]) d[k] = await b.s.list(k as never); return d; })() as never;
    const acc = visibleData(all, "acc", ["finances", "rapports"]);
    expect(acc.invoice.length).toBe(1);
    expect(acc.exam).toHaveLength(0);
    expect(acc.attendance).toHaveLength(0);
    const t = visibleData(all, "t1", ["notes", "presences", "bulletins"]);
    expect(t.invoice).toHaveLength(0);
    expect(t.fee).toHaveLength(0);
    expect(t.student).toHaveLength(1);
    const other = visibleData(all, "t9", ["notes", "presences", "bulletins"]);
    expect(other.student).toHaveLength(0);
  });
});

import { bulletinPdf, receiptPdf } from "@/lib/ecole/pdf";
import { settingsOf } from "@/lib/ecole/model";

describe("documents PDF", () => {
  it("génère un bulletin et un reçu PDF valides", async () => {
    const { s, c, klass, maths } = await setup();
    const a = (await enroll(c, klass, "Awa")).id!;
    const e = (await ok(c, "exam.save", { name: "D1", class_id: klass, subject_id: maths, term: 1, kind: "devoir", date: "2026-10-10", max: 20, weight: 1 })).id!;
    await ok(c, "grades.save", { exam_id: e, scores: { [a]: 15 } });
    const settings = settingsOf(undefined, "Collège test");
    const st = (await s.get("student", a)) as Doc<Student>;
    const k = (await s.get("class", klass)) as Doc<Klass>;
    const rep = termReport({ klass: k, term: 1, students: [st], assigns: (await s.list("assign")) as Doc<Assign>[], exams: (await s.list("exam")) as Doc<Exam>[], settings });
    const pdf = bulletinPdf({ student: st, klass: k, row: rep.rows[0]!, size: 1, stats: rep.stats, subjects: (await s.list("subject")) as never, label: "Trimestre 1", year: "2026-2027", attendance: [], settings });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);
    const inv = (await s.list("invoice"))[0] as Doc<Invoice>;
    await ok(c, "payment.add", { invoice_id: inv.id, pid: "55555555-5555-4555-8555-555555555555", amount: 1000 });
    const after = (await s.get("invoice", inv.id)) as Doc<Invoice>;
    expect(receiptPdf(after, after.data.payments[0]!, st, k, settings).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
