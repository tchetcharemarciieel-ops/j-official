"use client";

import { AlertTriangle, BarChart3 } from "lucide-react";
import { useState } from "react";
import { financeStats, missingData, termReport, type Assign, type Doc, type Exam, type Invoice, type Klass, type Student, type Subject } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Card, Empty, Pick, Stat, activeStudents, sortByName } from "../ui";

/**
 * Analyses de la direction : résumé des résultats d'une classe, matières à surveiller, données manquantes et impayés.
 * Calculées uniquement à partir des fiches saisies ; cette page ne modifie jamais aucune note ni aucun paiement.
 */
export function Analyses() {
  const c = useCtx();
  const classes = (c.data.class as Doc<Klass>[]).sort(sortByName);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [term, setTerm] = useState(1);
  const klass = classes.find((k) => k.id === classId);
  const subjects = c.data.subject as Doc<Subject>[];
  const rep = klass ? termReport({ klass, term, students: c.data.student as Doc<Student>[], assigns: c.data.assign as Doc<Assign>[], exams: c.data.exam as Doc<Exam>[], settings: c.settings }) : null;
  const assigns = (c.data.assign as Doc<Assign>[]).filter((a) => a.data.class_id === classId);
  const perSubject = assigns.map((a) => {
    const v = (rep?.rows ?? []).map((r) => r.subjects.find((x) => x.subject_id === a.data.subject_id)?.avg).filter((x): x is number => typeof x === "number");
    return { name: subjects.find((s) => s.id === a.data.subject_id)?.data.name ?? "?", mean: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null, below: v.filter((x) => x < c.settings.pass_mark).length, n: v.length };
  });
  const weak = (rep?.rows ?? []).filter((r) => r.general !== null && r.general < c.settings.pass_mark);
  const students = c.data.student as Doc<Student>[];
  const missing = missingData(c.data as never);
  const fin = financeStats(c.data.invoice as Doc<Invoice>[], c.data.transaction as never);
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">Ces analyses sont calculées sur vos données. Elles ne modifient jamais les notes ni les paiements.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1"><Pick label="Classe" value={classId} onChange={setClassId} options={classes.map((k) => [k.id, k.data.name])} required /></div>
        <div><span className="label">{c.settings.term_label}</span><select className="input" value={term} onChange={(e) => setTerm(Number(e.target.value))}>{Array.from({ length: c.settings.terms }, (_, i) => <option key={i} value={i + 1}>{c.settings.term_label} {i + 1}</option>)}</select></div>
      </div>
      {!rep || rep.stats.graded === 0 ? <Empty icon={BarChart3} title="Pas encore de résultats" text="Saisissez des notes pour cette classe et cette période." /> : (
        <>
          <Card title={`Résumé de ${klass!.data.name} · ${c.settings.term_label} ${term}`}>
            <p className="text-sm leading-relaxed text-slate-700">
              {rep.stats.graded} élève(s) noté(s) sur {rep.stats.size}. Moyenne de la classe <b>{rep.stats.mean?.toFixed(2)}</b> sur {c.settings.scale} (de {rep.stats.worst?.toFixed(2)} à {rep.stats.best?.toFixed(2)}). Taux de réussite <b>{rep.stats.passRate}%</b> (seuil {c.settings.pass_mark}).
              {weak.length > 0 ? ` ${weak.length} élève(s) sous le seuil : ${weak.slice(0, 5).map((r) => { const s = students.find((x) => x.id === r.student_id); return s ? `${s.data.first_name} ${s.data.last_name}` : "?"; }).join(", ")}${weak.length > 5 ? "…" : ""}.` : " Aucun élève sous le seuil de réussite."}
            </p>
          </Card>
          <Card title="Matières" subtitle="Moyenne de la classe et élèves sous le seuil, par matière">
            <ul className="divide-y divide-slate-100 text-sm">{perSubject.map((s) => <li key={s.name} className="flex items-center justify-between py-1.5"><span>{s.name}</span><span className="text-slate-600">{s.mean === null ? "pas de notes" : <>moyenne <b>{s.mean.toFixed(2)}</b> · {s.below}/{s.n} sous le seuil</>}</span></li>)}</ul>
          </Card>
        </>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Données manquantes" subtitle={`${missing.length} point(s) à compléter`}>
          {missing.length === 0 ? <p className="text-sm text-slate-600">Rien à signaler.</p> : <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">{missing.map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{m.label}</li>)}</ul>}
        </Card>
        {c.may("finances") && <div className="grid grid-cols-2 gap-3 self-start"><Stat label={`Facturé (${c.cur})`} value={c.num(fin.billed)} /><Stat label={`Encaissé (${c.cur})`} value={c.num(fin.paid)} tone="green" /><Stat label={`Impayés (${c.cur})`} value={c.num(fin.due)} tone="amber" hint={`${fin.unpaid} facture(s)`} /><Stat label="Élèves inscrits" value={activeStudents(c.data).length} /></div>}
      </div>
    </div>
  );
}
