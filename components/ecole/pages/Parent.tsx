"use client";

import { FileText, Megaphone } from "lucide-react";
import { useState } from "react";
import { PAY_METHODS, attendanceStats, dueOf, paidOf, studentName, type Announcement, type Assign, type Attendance, type Doc, type Exam, type Invoice, type Klass, type Student, type Subject } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Tabs, fmtD } from "../ui";

/** Espace parent : uniquement les enfants du compte connecté (le serveur ne renvoie rien d'autre). Notes, bulletins, absences, paiements et annonces. */
export function Parent() {
  const c = useCtx();
  const kids = (c.data.student as Doc<Student>[]).sort((a, b) => a.data.first_name.localeCompare(b.data.first_name, "fr"));
  const [kid, setKid] = useState(kids[0]?.id ?? "");
  const [tab, setTab] = useState<"notes" | "absences" | "paiements" | "annonces">("notes");
  const st = kids.find((k) => k.id === kid) ?? kids[0];
  if (!st) return <Empty icon={Megaphone} title="Aucun enfant relié à votre compte" text="Demandez à l'école de relier votre compte à la fiche de votre enfant (secrétariat)." />;
  const rep = c.s.reports.find((r) => r.student_id === st.id);
  const subjects = c.data.subject as Doc<Subject>[];
  const klass = (c.data.class as Doc<Klass>[]).find((k) => k.id === st.data.class_id);
  const exams = (c.data.exam as Doc<Exam>[]).filter((e) => e.data.class_id === st.data.class_id && typeof e.data.scores[st.id] === "number").sort((a, b) => b.data.date.localeCompare(a.data.date));
  const att = (c.data.attendance as Doc<Attendance>[]).filter((a) => a.data.class_id === st.data.class_id).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const stats = attendanceStats(att, st.id);
  const invoices = (c.data.invoice as Doc<Invoice>[]).filter((i) => i.data.student_id === st.id);
  const anns = (c.data.announcement as Doc<Announcement>[]).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const assigns = c.data.assign as Doc<Assign>[];
  return (
    <div className="space-y-4">
      {kids.length > 1 && <div className="flex flex-wrap gap-2">{kids.map((k) => <button key={k.id} onClick={() => setKid(k.id)} aria-pressed={k.id === st.id} className={`rounded-full border px-3 py-1.5 text-sm ${k.id === st.id ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-200 bg-white"}`}>{k.data.first_name}</button>)}</div>}
      <div className="rounded-2xl bg-[var(--brand)] p-5 text-white"><p className="text-sm opacity-90">Classe {klass?.data.name ?? "—"} · N° {st.data.matricule}</p><h2 className="font-display text-2xl font-bold">{studentName(st.data)}</h2></div>
      <Tabs value={tab} onChange={setTab} items={[["notes", "Notes et bulletins"], ["absences", "Absences"], ["paiements", "Paiements"], ["annonces", "Annonces"]]} />
      {tab === "notes" && (
        <div className="space-y-3">
          {rep?.terms.filter((t) => t.general !== null).map((t) => (
            <Card key={t.term} title={`${c.settings.term_label} ${t.term}`} action={<a className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline" href={c.docUrl("bulletin", st.id, { term: String(t.term) })} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Bulletin PDF</a>}>
              <p className="text-sm">Moyenne <b>{t.general?.toFixed(2)}</b> / {c.settings.scale}{t.rank ? <> · rang <b>{t.rank}</b> sur {t.size}</> : null} {t.mention && <Badge tone={t.general! >= c.settings.pass_mark ? "green" : "red"}>{t.mention}</Badge>}</p>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">{t.subjects.map((s) => <li key={s.subject_id} className="flex justify-between py-1"><span>{subjects.find((x) => x.id === s.subject_id)?.data.name} <span className="text-xs text-slate-400">coef {assigns.find((a) => a.data.class_id === st.data.class_id && a.data.subject_id === s.subject_id)?.data.coef ?? s.coef}</span></span><span>{s.avg === null ? "—" : s.avg.toFixed(2)}</span></li>)}</ul>
            </Card>
          ))}
          {rep && rep.annual.general !== null && <Card title="Moyenne annuelle"><p className="text-sm"><b>{rep.annual.general.toFixed(2)}</b> / {c.settings.scale}{rep.annual.rank ? <> · rang {rep.annual.rank} sur {rep.annual.size}</> : null} {rep.annual.mention}</p><a className="mt-1 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline" href={c.docUrl("bulletin", st.id, { term: "annuel" })} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Bulletin annuel PDF</a></Card>}
          <Card title="Dernières notes">{exams.length === 0 ? <p className="text-sm text-slate-600">Aucune note pour le moment.</p> : <ul className="divide-y divide-slate-100 text-sm">{exams.slice(0, 15).map((e) => <li key={e.id} className="flex justify-between py-1.5"><span>{e.data.name} <span className="text-xs text-slate-500">· {subjects.find((s) => s.id === e.data.subject_id)?.data.name} · {fmtD(e.data.date)}</span></span><b>{e.data.scores[st.id]} / {e.data.max}</b></li>)}</ul>}</Card>
        </div>
      )}
      {tab === "absences" && <Card title="Assiduité">{stats.total === 0 ? <p className="text-sm text-slate-600">Aucun appel enregistré.</p> : <><p className="text-sm">{stats.absent} absence(s), {stats.late} retard(s), {stats.excused} excusé(s) sur {stats.total} appel(s) · assiduité <b>{stats.rate}%</b></p><ul className="mt-2 divide-y divide-slate-100 text-sm">{att.filter((a) => a.data.marks[st.id] && a.data.marks[st.id] !== "present").slice(0, 30).map((a) => <li key={a.id} className="flex justify-between py-1"><span>{fmtD(a.data.date)}</span><Badge tone={a.data.marks[st.id] === "absent" ? "red" : "amber"}>{a.data.marks[st.id] === "absent" ? "Absent" : a.data.marks[st.id] === "retard" ? "Retard" : "Excusé"}</Badge></li>)}</ul></>}</Card>}
      {tab === "paiements" && (invoices.length === 0 ? <Empty icon={Megaphone} title="Aucune facture" /> : invoices.map((i) => (
        <Card key={i.id} title={i.data.number} action={<Badge tone={dueOf(i.data) > 0 ? "amber" : "green"}>{dueOf(i.data) > 0 ? `Reste ${c.fmt(dueOf(i.data))}` : "Soldée"}</Badge>}>
          <ul className="text-sm text-slate-700">{i.data.lines.map((l, k) => <li key={k}>{l.label} : {c.fmt(l.amount)}</li>)}</ul>
          <p className="mt-1 text-sm">Total {c.fmt(i.data.total)} · payé {c.fmt(paidOf(i.data))}</p>
          {i.data.payments.filter((p) => !p.cancelled).map((p) => <p key={p.id} className="text-xs text-slate-600">{fmtD(p.date)} · {c.fmt(p.amount)} · {PAY_METHODS[p.method]} · <a className="text-blue-700 underline" href={c.docUrl("receipt", i.id, { pid: p.id })} target="_blank" rel="noreferrer">reçu {p.receipt}</a></p>)}
        </Card>
      )))}
      {tab === "annonces" && (anns.length === 0 ? <Empty icon={Megaphone} title="Aucune annonce" /> : anns.map((a) => <Card key={a.id} title={a.data.title} subtitle={fmtD(a.data.date)}><p className="whitespace-pre-wrap text-sm text-slate-700">{a.data.body}</p></Card>))}
    </div>
  );
}
