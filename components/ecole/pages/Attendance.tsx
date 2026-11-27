"use client";

import { CalendarCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MARKS, attendanceStats, studentName, type Attendance as Att, type Doc, type Klass, type Mark } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Empty, Field, Pick, Tabs, activeStudents, sortByName } from "../ui";

/** Présences : appel par classe et par date (présent, absent, retard, excusé), historique et assiduité. Les parents des absents sont notifiés dans l'application. */
export function Attendance() {
  const c = useCtx();
  const classes = (c.data.class as Doc<Klass>[]).sort(sortByName);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<"appel" | "historique">("appel");
  const att = (c.data.attendance as Doc<Att>[]).filter((a) => a.data.class_id === classId);
  const students = useMemo(() => activeStudents(c.data, classId).sort((a, b) => studentName(a.data).localeCompare(studentName(b.data), "fr")), [c.data, classId]);
  const today = att.find((a) => a.data.date === date);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  useEffect(() => { setMarks(Object.fromEntries(students.map((s) => [s.id, today?.data.marks[s.id] ?? "present"]))); }, [students, today]);
  const can = c.may("presences");
  const changed = !today || students.some((s) => (today.data.marks[s.id] ?? "present") !== marks[s.id]);
  if (!classes.length) return <Empty icon={CalendarCheck} title="Aucune classe" text="Créez ou obtenez l'accès à une classe pour faire l'appel." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1"><Pick label="Classe" value={classId} onChange={setClassId} options={classes.map((k) => [k.id, k.data.name])} required /></div>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Tabs value={tab} onChange={setTab} items={[["appel", "Appel"], ["historique", "Historique"]]} />
      </div>
      {tab === "appel" ? (
        students.length === 0 ? <p className="text-sm text-slate-600">Aucun élève inscrit.</p> : (
          <>
            <div className="flex gap-2">{can && <button className="btn btn-ghost" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "present"])))}>Tous présents</button>}{today && <Badge tone="green">Appel déjà fait</Badge>}</div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {students.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{studentName(s.data)}</span>
                  <div role="group" aria-label={`Présence de ${studentName(s.data)}`} className="flex gap-1">{(Object.keys(MARKS) as Mark[]).map((m) => <button key={m} disabled={!can} aria-pressed={marks[s.id] === m} onClick={() => setMarks({ ...marks, [s.id]: m })} className={`rounded-lg border px-2.5 py-1 text-xs ${marks[s.id] === m ? { present: "border-green-500 bg-green-50 text-green-800", absent: "border-red-500 bg-red-50 text-red-800", retard: "border-amber-500 bg-amber-50 text-amber-800", excuse: "border-blue-500 bg-blue-50 text-blue-800" }[m] : "border-slate-200 text-slate-600"}`}>{MARKS[m]}</button>)}</div>
                </li>
              ))}
            </ul>
            {can && <button className="btn btn-primary w-full sm:w-auto" disabled={!changed} onClick={() => void c.run("attendance.save", { class_id: classId, date, marks, note: "" })}>Enregistrer l&apos;appel</button>}
          </>
        )
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[520px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Élève</th><th className="px-3 py-2 text-right">Absences</th><th className="px-3 py-2 text-right">Retards</th><th className="px-3 py-2 text-right">Assiduité</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{students.map((s) => { const st = attendanceStats(att, s.id); return <tr key={s.id}><td className="px-3 py-2">{studentName(s.data)}</td><td className="px-3 py-2 text-right">{st.absent}</td><td className="px-3 py-2 text-right">{st.late}</td><td className="px-3 py-2 text-right">{st.rate === null ? "—" : <Badge tone={st.rate >= 90 ? "green" : st.rate >= 75 ? "amber" : "red"}>{st.rate}%</Badge>}</td></tr>; })}</tbody></table>
          <p className="px-3 py-2 text-xs text-slate-500">{att.length} appel(s) enregistré(s) pour cette classe.</p>
        </div>
      )}
    </div>
  );
}
