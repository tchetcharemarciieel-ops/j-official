"use client";

import { AlertTriangle, GraduationCap, Megaphone, UserCheck, Users, Wallet } from "lucide-react";
import { SCHOOL_TYPES, attendanceStats, financeStats, missingData, monthlySeries, today, type Attendance, type Doc, type Invoice, type Klass, type Transaction } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Card, DualBars, Stat, activeStudents, currentYear, yearClasses } from "../ui";

/** Tableau de bord de la direction : effectifs, assiduité du jour, impayés, résultat et alertes. Tout est calculé sur les fiches saisies. */
export function Dashboard() {
  const c = useCtx();
  const d = c.data;
  const year = currentYear(d);
  const classes = yearClasses(d);
  const students = activeStudents(d);
  const att = (d.attendance as Doc<Attendance>[]).filter((a) => a.data.date === today());
  const absentToday = att.reduce((n, a) => n + Object.values(a.data.marks).filter((m) => m === "absent").length, 0);
  const fin = financeStats(d.invoice as Doc<Invoice>[], d.transaction as Doc<Transaction>[]);
  const missing = missingData(d as never);
  const money = c.may("finances");
  const bars = classes.map((k) => ({ label: k.data.name, n: activeStudents(d, k.id).length, cap: k.data.capacity }));
  const max = Math.max(1, ...bars.map((b) => b.n));
  void attendanceStats;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[var(--brand)] p-5 text-white">
        <p className="text-sm opacity-90">{SCHOOL_TYPES[c.settings.school_type]?.label}{year ? ` · année ${year.data.name}` : ""}</p>
        <h2 className="font-display text-2xl font-bold">{c.settings.name}</h2>
        {!year && <p className="mt-2 text-sm">Commencez par créer l&apos;année scolaire, les niveaux et les classes (page « Classes et matières »).</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Élèves inscrits" value={students.length} icon={GraduationCap} hint={c.settings.students_count ? `prévu : ${c.settings.students_count}` : undefined} onClick={() => c.go("eleves")} />
        <Stat label="Enseignants" value={d.teacher.length} icon={Users} onClick={() => c.may("enseignants") && c.go("enseignants")} />
        <Stat label="Classes" value={classes.length} onClick={() => c.may("classes") && c.go("structure")} />
        <Stat label="Absents aujourd'hui" value={absentToday} icon={UserCheck} tone={absentToday ? "amber" : "slate"} hint={att.length ? `${att.length} appel(s) fait(s)` : "aucun appel"} />
        {money && <Stat label={`Impayés (${c.cur})`} value={c.num(fin.due)} icon={Wallet} tone={fin.due ? "amber" : "slate"} hint={`${fin.unpaid} facture(s)`} onClick={() => c.go("finances")} />}
        {money && <Stat label={`Encaissé aujourd'hui (${c.cur})`} value={c.num(fin.revenueDay)} tone="green" />}
        {money && <Stat label={`Résultat (${c.cur})`} value={c.num(fin.result)} tone={fin.result >= 0 ? "blue" : "red"} />}
        <Stat label="Annonces" value={d.announcement.length} icon={Megaphone} onClick={() => c.go("annonces")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Élèves par classe">
          {bars.length === 0 ? <p className="text-sm text-slate-600">Aucune classe.</p> : <ul className="space-y-2">{bars.map((b) => <li key={b.label} className="text-sm"><div className="flex justify-between"><span>{b.label}</span><span className="text-slate-500">{b.n}{b.cap ? ` / ${b.cap}` : ""}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${(b.n / max) * 100}%` }} /></div></li>)}</ul>}
        </Card>
        {money && <Card title="Recettes et dépenses" subtitle="6 derniers mois"><DualBars data={monthlySeries(d.transaction as Doc<Transaction>[]).map((m) => ({ label: m.label, a: m.income, b: m.expense }))} /></Card>}
      </div>
      {c.may(["classes", "eleves"]) && missing.length > 0 && (
        <Card title="À compléter" subtitle="Données manquantes repérées">
          <ul className="space-y-1 text-sm">{missing.slice(0, 8).map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{m.label}</li>)}</ul>
          {missing.length > 8 && <button className="mt-2 text-sm text-blue-700 hover:underline" onClick={() => c.go("analyses")}>Voir les {missing.length} alertes</button>}
        </Card>
      )}
      {d.class.length === 0 && <Card><p className="text-sm text-slate-600">Aucune classe pour l&apos;instant. {(d.class as Doc<Klass>[]).length}</p></Card>}
    </div>
  );
}
