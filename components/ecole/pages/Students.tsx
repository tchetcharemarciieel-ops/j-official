"use client";

import { FileText, GraduationCap, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PAY_METHODS, STUDENT_STATUS, attendanceStats, dueOf, paidOf, studentName, type Attendance, type Doc, type Guardian, type Invoice, type Klass, type Student, type StudentStatus } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, SearchBox, Tabs, activeStudents, fmtD, sortByName, uid, yearClasses } from "../ui";

/** Élèves et inscriptions : liste, inscription d'un nouvel élève (avec parent et facture des frais), fiche détaillée. */
export function Students() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<"inscrit" | "tous">("inscrit");
  const [enroll, setEnroll] = useState(false);
  const [view, setView] = useState<string | null>(c.focus);
  const klasses = c.data.class as Doc<Klass>[];
  const students = c.data.student as Doc<Student>[];
  const className = (id: string) => klasses.find((k) => k.id === id)?.data.name ?? "—";
  const rows = useMemo(() => students.filter((s) => (status === "tous" || s.data.status === "inscrit") && (!classId || s.data.class_id === classId) && (!q.trim() || [studentName(s.data), s.data.matricule].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())))).sort((a, b) => studentName(a.data).localeCompare(studentName(b.data), "fr")), [students, q, classId, status]);
  const canEnroll = c.may("eleves");
  const sel = students.find((s) => s.id === view);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Nom ou matricule…" /></div>
        <select className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Classe"><option value="">Toutes les classes</option>{[...klasses].sort(sortByName).map((k) => <option key={k.id} value={k.id}>{k.data.name}</option>)}</select>
        <Tabs value={status} onChange={setStatus} items={[["inscrit", "Inscrits"], ["tous", "Tous"]]} />
        {canEnroll && <button className="btn btn-primary" onClick={() => setEnroll(true)}><Plus className="h-4 w-4" /> Inscrire</button>}
      </div>
      {rows.length === 0 ? <Empty icon={GraduationCap} title="Aucun élève" text={klasses.length ? "Inscrivez votre premier élève : sa fiche, son parent et sa facture sont créés ensemble." : "Créez d'abord au moins une classe (page Classes et matières)."} action={canEnroll && klasses.length ? <button className="btn btn-primary" onClick={() => setEnroll(true)}>Inscrire un élève</button> : undefined} /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.slice(0, 200).map((s) => (
            <li key={s.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(s.id)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold">{s.data.first_name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{studentName(s.data)}</span><span className="block truncate text-xs text-slate-500">N° {s.data.matricule} · {className(s.data.class_id)}</span></span>
              {s.data.status !== "inscrit" && <Badge tone="amber">{STUDENT_STATUS[s.data.status]}</Badge>}
            </button></li>
          ))}
        </ul>
      )}
      {rows.length > 200 && <p className="text-xs text-slate-500">200 premiers élèves affichés : affinez la recherche.</p>}
      {enroll && <EnrollForm onClose={() => setEnroll(false)} />}
      {sel && <StudentView s={sel} onClose={() => setView(null)} />}
    </div>
  );
}

function EnrollForm({ onClose }: { onClose: () => void }) {
  const c = useCtx();
  const classes = yearClasses(c.data);
  const [f, setF] = useState({ first_name: "", last_name: "", sex: "F" as "F" | "M", birth_date: "", birth_place: "", class_id: classes[0]?.id ?? "", previous_school: "", notes: "", gname: "", gphone: "", gemail: "", grelation: "", invoice: true });
  const left = (id: string) => { const k = classes.find((x) => x.id === id); return k?.data.capacity ? k.data.capacity - activeStudents(c.data, id).length : null; };
  const ok = f.first_name.trim() && f.last_name.trim() && f.class_id && f.gname.trim() && f.gphone.trim().length >= 6;
  return (
    <Modal wide title="Inscrire un élève" onClose={onClose} footer={<button className="btn btn-primary" disabled={!ok} onClick={async () => (await c.run("student.enroll", { first_name: f.first_name, last_name: f.last_name, sex: f.sex, birth_date: f.birth_date || null, birth_place: f.birth_place, class_id: f.class_id, previous_school: f.previous_school, notes: f.notes, invoice: f.invoice, guardian: { name: f.gname, phone: f.gphone, email: f.gemail, relation: f.grelation } })) && onClose()}>Inscrire</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom *"><input className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoFocus /></Field>
        <Field label="Nom *"><input className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Sexe"><select className="input" value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value as "F" | "M" })}><option value="F">Fille</option><option value="M">Garçon</option></select></Field>
        <Field label="Date de naissance"><input className="input" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
        <Field label="Lieu de naissance"><input className="input" value={f.birth_place} onChange={(e) => setF({ ...f, birth_place: e.target.value })} /></Field>
        <Field label="Classe *" hint={left(f.class_id) !== null ? `${left(f.class_id)} place(s) restante(s)` : undefined}><select className="input" value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>{classes.map((k) => <option key={k.id} value={k.id}>{k.data.name}</option>)}</select></Field>
        <Field label="École précédente"><input className="input" value={f.previous_school} onChange={(e) => setF({ ...f, previous_school: e.target.value })} /></Field>
        <Field label="Remarques"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <p className="mb-2 mt-4 text-sm font-semibold text-slate-900">Parent ou tuteur</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={f.gname} onChange={(e) => setF({ ...f, gname: e.target.value })} /></Field>
        <Field label="Téléphone *" hint="Un parent déjà connu (même numéro) est réutilisé pour ses autres enfants."><input className="input" inputMode="tel" value={f.gphone} onChange={(e) => setF({ ...f, gphone: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.gemail} onChange={(e) => setF({ ...f, gemail: e.target.value })} /></Field>
        <Field label="Lien (père, mère, tuteur…)"><input className="input" value={f.grelation} onChange={(e) => setF({ ...f, grelation: e.target.value })} /></Field>
      </div>
      {c.may("finances") && <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.checked })} /> Créer la facture des frais obligatoires du niveau</label>}
    </Modal>
  );
}

function StudentView({ s, onClose }: { s: Doc<Student>; onClose: () => void }) {
  const c = useCtx();
  const [tab, setTab] = useState<"fiche" | "parents" | "finances" | "presences">("fiche");
  const [moveTo, setMoveTo] = useState(s.data.class_id);
  const classes = yearClasses(c.data);
  const guardians = (c.data.guardian as Doc<Guardian>[]).filter((g) => g.data.student_ids.includes(s.id));
  const invoices = (c.data.invoice as Doc<Invoice>[]).filter((i) => i.data.student_id === s.id);
  const att = attendanceStats((c.data.attendance as Doc<Attendance>[]).filter((a) => a.data.class_id === s.data.class_id), s.id);
  const klass = (c.data.class as Doc<Klass>[]).find((k) => k.id === s.data.class_id);
  const [pay, setPay] = useState<{ inv: Doc<Invoice>; amount: string; method: keyof typeof PAY_METHODS } | null>(null);
  const [gUser, setGUser] = useState<Record<string, string>>({});
  const items: ["fiche" | "parents" | "finances" | "presences", string][] = [["fiche", "Fiche"], ["parents", "Parents"], ...(c.may("finances") ? [["finances", "Frais"] as ["finances", string]] : []), ...(c.may(["presences", "eleves"]) ? [["presences", "Présences"] as ["presences", string]] : [])];
  return (
    <Modal wide title={studentName(s.data)} onClose={onClose}>
      <Tabs value={tab} onChange={setTab} items={items} />
      <div className="mt-4 space-y-3 text-sm">
        {tab === "fiche" && (
          <>
            <p><b>Matricule</b> {s.data.matricule} · <b>Classe</b> {klass?.data.name ?? "—"} · <b>Statut</b> {STUDENT_STATUS[s.data.status]}</p>
            <p><b>Né(e)</b> {fmtD(s.data.birth_date)}{s.data.birth_place ? ` à ${s.data.birth_place}` : ""} · <b>Inscrit le</b> {fmtD(s.data.enrolled_at)}</p>
            {s.data.previous_school && <p><b>École précédente</b> {s.data.previous_school}</p>}
            {s.data.notes && <p><b>Remarques</b> {s.data.notes}</p>}
            {c.may("eleves") && (
              <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <div className="flex items-end gap-2"><div className="flex-1"><Pick label="Changer de classe" value={moveTo} onChange={setMoveTo} options={classes.map((k) => [k.id, k.data.name])} required /></div><button className="btn btn-ghost" disabled={moveTo === s.data.class_id} onClick={() => void c.run("student.move", { id: s.id, class_id: moveTo })}>Déplacer</button></div>
                <Field label="Statut"><select className="input" value={s.data.status} onChange={(e) => void c.run("student.status", { id: s.id, status: e.target.value as StudentStatus })}>{Object.entries(STUDENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <div className="sm:col-span-2"><DeleteButton label="Supprimer la fiche" confirmText="Supprimer cette fiche élève ? (refusé s'il a des notes, des présences ou une facture)" onConfirm={async () => { if (await c.run("student.delete", { id: s.id })) onClose(); }} /></div>
              </div>
            )}
          </>
        )}
        {tab === "parents" && (guardians.length === 0 ? <p className="text-slate-600">Aucun parent renseigné.</p> : guardians.map((g) => (
          <div key={g.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-medium">{g.data.name}{g.data.relation ? ` · ${g.data.relation}` : ""}</p>
            <p className="text-slate-600">{g.data.phone}{g.data.email ? ` · ${g.data.email}` : ""}</p>
            {c.may("eleves") && c.s.members.length > 0 && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1"><Pick label="Compte de connexion (espace parent)" value={gUser[g.id] ?? g.data.user_id ?? ""} onChange={(v) => setGUser({ ...gUser, [g.id]: v })} options={c.s.members.filter((m) => m.active).map((m) => [m.id, `${m.name}${m.position ? ` (${m.position})` : ""}`])} empty="Aucun" /></div>
                <button className="btn btn-ghost" onClick={() => void c.run("guardian.save", { id: g.id, student_id: s.id, name: g.data.name, phone: g.data.phone, email: g.data.email, relation: g.data.relation, user_id: (gUser[g.id] ?? g.data.user_id ?? "") || null })}>Relier</button>
              </div>
            )}
            {c.may("eleves") && <p className="mt-1 text-xs text-slate-500">Invitez le parent avec le poste « Parent » (Comptes et accès), puis reliez son compte ici : il verra uniquement ses enfants.</p>}
          </div>
        )))}
        {tab === "finances" && (invoices.length === 0 ? <p className="text-slate-600">Aucune facture.</p> : invoices.map((i) => (
          <div key={i.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{i.data.number}</p><Badge tone={dueOf(i.data) > 0 ? "amber" : "green"}>{dueOf(i.data) > 0 ? `Reste ${c.fmt(dueOf(i.data))}` : "Soldée"}</Badge></div>
            <ul className="mt-1 text-slate-600">{i.data.lines.map((l, k) => <li key={k}>{l.label} : {c.fmt(l.amount)}</li>)}</ul>
            <p className="mt-1">Total {c.fmt(i.data.total)} · payé {c.fmt(paidOf(i.data))}</p>
            {i.data.payments.map((p) => <p key={p.id} className={`text-xs ${p.cancelled ? "text-slate-400 line-through" : "text-slate-600"}`}>{fmtD(p.date)} · {c.fmt(p.amount)} · {PAY_METHODS[p.method]} · {p.receipt}{!p.cancelled && <> · <a className="text-blue-700 underline" href={c.docUrl("receipt", i.id, { pid: p.id })} target="_blank" rel="noreferrer"><FileText className="inline h-3 w-3" /> reçu</a></>}</p>)}
            {dueOf(i.data) > 0 && <button className="btn btn-primary mt-2" onClick={() => setPay({ inv: i, amount: String(dueOf(i.data)), method: "especes" })}>Encaisser</button>}
          </div>
        )))}
        {tab === "presences" && <p>{att.total ? <>Sur {att.total} appel(s) : <b>{att.absent}</b> absence(s), <b>{att.late}</b> retard(s), <b>{att.excused}</b> excusé(s). Assiduité {att.rate}%.</> : "Aucun appel enregistré pour cet élève."}</p>}
      </div>
      {pay && (
        <Modal title={`Encaisser · ${pay.inv.data.number}`} onClose={() => setPay(null)} footer={<button className="btn btn-primary" disabled={!(Number(pay.amount) > 0)} onClick={async () => (await c.run("payment.add", { invoice_id: pay.inv.id, pid: uid(), amount: Number(pay.amount), method: pay.method })) && setPay(null)}>Enregistrer le paiement</button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Montant (reste ${c.fmt(dueOf(pay.inv.data))})`}><input className="input" type="number" min="1" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Mode"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as keyof typeof PAY_METHODS })}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
void Card;
