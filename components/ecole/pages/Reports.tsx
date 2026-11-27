"use client";

import { Download, FileText, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { annualReport, studentName, termReport, type Assign, type Doc, type Exam, type Klass, type Student, type Subject } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Pick, Stat, downloadText, sortByName, toCsv } from "../ui";

/** Bulletins et classements : moyennes par matière (coefficients de la classe), moyenne générale, rang, mention, PDF de chaque élève. */
export function Reports() {
  const c = useCtx();
  const full = c.may("classes") || (c.may("bulletins") && c.may("eleves"));
  const classes = (c.data.class as Doc<Klass>[]).sort(sortByName);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [period, setPeriod] = useState<string>("1");
  const klass = classes.find((k) => k.id === classId);
  const subjects = c.data.subject as Doc<Subject>[];
  const common = useMemo(() => klass && { klass, students: c.data.student as Doc<Student>[], assigns: c.data.assign as Doc<Assign>[], exams: c.data.exam as Doc<Exam>[], settings: c.settings }, [klass, c.data.student, c.data.assign, c.data.exam, c.settings]);
  const report = useMemo(() => (common && full ? (period === "annuel" ? annualReport(common) : termReport({ ...common, term: Number(period) })) : null), [common, period, full]);
  const students = c.data.student as Doc<Student>[];
  const cols = ((c.data.assign as Doc<Assign>[]).filter((a) => a.data.class_id === classId));
  const rows = report ? [...report.rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || (students.find((s) => s.id === a.student_id)?.data.last_name ?? "").localeCompare(students.find((s) => s.id === b.student_id)?.data.last_name ?? "", "fr")) : [];
  const nameOf = (id: string) => { const s = students.find((x) => x.id === id); return s ? studentName(s.data) : "?"; };
  const exportCsv = () => downloadText(`classement-${klass?.data.name ?? "classe"}-${period}.csv`, toCsv([["Rang", "Matricule", "Élève", ...cols.map((a) => subjects.find((s) => s.id === a.data.subject_id)?.data.name ?? "?"), "Moyenne", "Mention"], ...rows.map((r) => [r.rank ?? "", students.find((s) => s.id === r.student_id)?.data.matricule ?? "", nameOf(r.student_id), ...cols.map((a) => r.subjects.find((x) => x.subject_id === a.data.subject_id)?.avg ?? ""), r.general ?? "", r.mention])]));
  if (!full) return <TeacherStats />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1"><Pick label="Classe" value={classId} onChange={setClassId} options={classes.map((k) => [k.id, k.data.name])} required /></div>
        <div><span className="label">Période</span><select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>{Array.from({ length: c.settings.terms }, (_, i) => <option key={i} value={String(i + 1)}>{c.settings.term_label} {i + 1}</option>)}<option value="annuel">Moyenne annuelle</option></select></div>
        {report && rows.length > 0 && <button className="btn btn-ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Excel (CSV)</button>}
      </div>
      {!report || rows.length === 0 ? <Empty icon={Trophy} title="Aucun résultat" text="Il faut une classe avec des élèves inscrits, des matières affectées et des notes saisies." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Moyenne de la classe" value={report.stats.mean?.toFixed(2) ?? "—"} hint={`sur ${c.settings.scale}`} />
            <Stat label="Meilleure moyenne" value={report.stats.best?.toFixed(2) ?? "—"} tone="green" />
            <Stat label="Plus faible" value={report.stats.worst?.toFixed(2) ?? "—"} tone="amber" />
            <Stat label="Taux de réussite" value={report.stats.passRate === null ? "—" : `${report.stats.passRate}%`} hint={`seuil ${c.settings.pass_mark}`} tone="blue" />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Rang</th><th className="px-3 py-2">Élève</th>{cols.map((a) => <th key={a.id} className="px-3 py-2 text-right">{subjects.find((s) => s.id === a.data.subject_id)?.data.name}<span className="block font-normal">coef {a.data.coef}</span></th>)}<th className="px-3 py-2 text-right">Moyenne</th><th className="px-3 py-2">Mention</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-3 py-2 font-semibold">{r.rank ?? "—"}</td><td className="px-3 py-2">{nameOf(r.student_id)}</td>
                    {cols.map((a) => { const v = r.subjects.find((x) => x.subject_id === a.data.subject_id)?.avg; return <td key={a.id} className={`px-3 py-2 text-right ${typeof v === "number" && v < c.settings.pass_mark ? "text-red-600" : ""}`}>{v === null || v === undefined ? "—" : v.toFixed(2)}</td>; })}
                    <td className="px-3 py-2 text-right font-semibold">{r.general === null ? "—" : r.general.toFixed(2)}</td>
                    <td className="px-3 py-2">{r.mention && <Badge tone={r.general !== null && r.general >= c.settings.pass_mark ? "green" : "red"}>{r.mention}</Badge>}</td>
                    <td className="px-3 py-2 text-right">{r.general !== null && <a className="inline-flex items-center gap-1 text-blue-700 hover:underline" href={c.docUrl("bulletin", r.student_id, { term: period })} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Bulletin</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Moyennes calculées d&apos;après les évaluations saisies, avec les coefficients de la classe ; une matière sans note est ignorée. Rangs : égalités = même rang.</p>
        </>
      )}
    </div>
  );
}

/** Enseignant : résultats de ses propres évaluations (il ne voit pas les autres matières). */
function TeacherStats() {
  const c = useCtx();
  const subjects = c.data.subject as Doc<Subject>[];
  const klass = c.data.class as Doc<Klass>[];
  const exams = (c.data.exam as Doc<Exam>[]).sort((a, b) => b.data.date.localeCompare(a.data.date));
  if (!exams.length) return <Empty icon={Trophy} title="Aucune évaluation" text="Vos résultats apparaîtront ici dès que vous aurez saisi des notes." />;
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {exams.map((e) => {
          const v = Object.values(e.data.scores).filter((x): x is number => typeof x === "number");
          const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
          return <li key={e.id}><Card title={e.data.name} subtitle={`${subjects.find((s) => s.id === e.data.subject_id)?.data.name} · ${klass.find((k) => k.id === e.data.class_id)?.data.name}`}><p className="text-sm">{v.length ? <>Moyenne <b>{mean!.toFixed(2)}</b> / {e.data.max} · meilleure {Math.max(...v)} · plus faible {Math.min(...v)}</> : "Aucune note saisie."}</p></Card></li>;
        })}
      </ul>
    </div>
  );
}
