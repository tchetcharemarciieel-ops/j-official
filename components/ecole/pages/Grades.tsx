"use client";

import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EXAM_KINDS, studentName, type Assign, type Doc, type Exam, type Klass, type Student, type Subject, type Teacher } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, activeStudents, fmtD, sortByName } from "../ui";

/** Notes : évaluations par classe et période, saisie des notes de toute la classe. Un enseignant ne voit et ne saisit que ses matières. */
export function Grades() {
  const c = useCtx();
  const wide = c.may("classes");
  const classes = (c.data.class as Doc<Klass>[]).sort(sortByName);
  const [classId, setClassId] = useState(c.focus && classes.some((k) => k.id === c.focus) ? c.focus : classes[0]?.id ?? "");
  const [term, setTerm] = useState(1);
  const [edit, setEdit] = useState<Doc<Exam> | "new" | null>(null);
  const [enter, setEnter] = useState<string | null>(null);
  const me = (c.data.teacher as Doc<Teacher>[]).find((t) => t.data.user_id === c.s.me);
  const assigns = (c.data.assign as Doc<Assign>[]).filter((a) => a.data.class_id === classId && (wide || a.data.teacher_id === me?.id));
  const subjects = c.data.subject as Doc<Subject>[];
  const exams = (c.data.exam as Doc<Exam>[]).filter((e) => e.data.class_id === classId && e.data.term === term).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const n = activeStudents(c.data, classId).length;
  const canEdit = c.may("notes");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1"><Pick label="Classe" value={classId} onChange={setClassId} options={classes.map((k) => [k.id, k.data.name])} required /></div>
        <Field label={c.settings.term_label}><select className="input" value={term} onChange={(e) => setTerm(Number(e.target.value))}>{Array.from({ length: c.settings.terms }, (_, i) => <option key={i} value={i + 1}>{c.settings.term_label} {i + 1}</option>)}</select></Field>
        {canEdit && <button className="btn btn-primary" disabled={!assigns.length} onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Évaluation</button>}
      </div>
      {classes.length === 0 ? <Empty icon={ClipboardList} title="Aucune classe" text={wide ? "Créez d'abord vos classes et leurs matières." : "Aucune classe ne vous est affectée : la direction doit vous relier à vos matières."} /> : exams.length === 0 ? (
        <Empty icon={ClipboardList} title="Aucune évaluation" text={assigns.length ? "Créez un devis, un devoir ou une composition, puis saisissez les notes." : "Aucune matière affectée à cette classe pour vous."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {exams.map((e) => {
            const noted = Object.values(e.data.scores).filter((v) => typeof v === "number").length;
            return (
              <li key={e.id}><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{e.data.name}</p><p className="text-xs text-slate-500">{subjects.find((s) => s.id === e.data.subject_id)?.data.name} · {EXAM_KINDS[e.data.kind]} · {fmtD(e.data.date)}</p></div><Badge tone={noted >= n && n > 0 ? "green" : "amber"}>{noted}/{n}</Badge></div>
                <p className="mt-1 text-xs text-slate-500">Sur {e.data.max} · poids {e.data.weight}</p>
                {canEdit && <div className="mt-3 flex gap-2"><button className="btn btn-primary flex-1" onClick={() => setEnter(e.id)}>Saisir les notes</button><button className="btn btn-ghost" onClick={() => setEdit(e)}>Modifier</button></div>}
              </div></li>
            );
          })}
        </ul>
      )}
      {edit && <ExamForm e={edit === "new" ? null : edit} classId={classId} term={term} assigns={assigns} onClose={() => setEdit(null)} />}
      {enter && <ScoreGrid exam={(c.data.exam as Doc<Exam>[]).find((e) => e.id === enter)!} onClose={() => setEnter(null)} />}
    </div>
  );
}

function ExamForm({ e, classId, term, assigns, onClose }: { e: Doc<Exam> | null; classId: string; term: number; assigns: Doc<Assign>[]; onClose: () => void }) {
  const c = useCtx();
  const subjects = c.data.subject as Doc<Subject>[];
  const d = e?.data;
  const [f, setF] = useState({ name: d?.name ?? "", subject_id: d?.subject_id ?? assigns[0]?.data.subject_id ?? "", term: d?.term ?? term, kind: d?.kind ?? ("devoir" as keyof typeof EXAM_KINDS), date: d?.date ?? new Date().toISOString().slice(0, 10), max: String(d?.max ?? c.settings.scale), weight: String(d?.weight ?? 1) });
  return (
    <Modal wide title={e ? "Modifier l'évaluation" : "Nouvelle évaluation"} onClose={onClose} footer={<>
      {e && <DeleteButton confirmText="Supprimer cette évaluation ? Si elle contient des notes, la direction doit confirmer." onConfirm={async () => { const noted = Object.values(e.data.scores).some((v) => typeof v === "number"); if (noted && c.may("classes") && !confirm("Cette évaluation contient des notes. Les supprimer définitivement ?")) return; if (await c.run("exam.delete", { id: e.id, confirm: noted })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!f.name.trim() || !f.subject_id} onClick={async () => (await c.run("exam.save", { id: e?.id, class_id: classId, ...f, max: Number(f.max), weight: Number(f.weight) })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Devoir n°1" autoFocus /></Field>
        <Pick label="Matière" value={f.subject_id} onChange={(v) => setF({ ...f, subject_id: v })} options={assigns.map((a) => [a.data.subject_id, subjects.find((s) => s.id === a.data.subject_id)?.data.name ?? "?"])} required />
        <Field label="Type"><select className="input" value={f.kind} onChange={(x) => setF({ ...f, kind: x.target.value as keyof typeof EXAM_KINDS })}>{Object.entries(EXAM_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={c.settings.term_label}><select className="input" value={f.term} onChange={(x) => setF({ ...f, term: Number(x.target.value) })}>{Array.from({ length: c.settings.terms }, (_, i) => <option key={i} value={i + 1}>{c.settings.term_label} {i + 1}</option>)}</select></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} /></Field>
        <Field label="Note maximale"><input className="input" type="number" min="1" value={f.max} onChange={(x) => setF({ ...f, max: x.target.value })} /></Field>
        <Field label="Poids dans la moyenne" hint="1 par défaut ; une composition peut compter 2."><input className="input" type="number" min="0.5" step="0.5" value={f.weight} onChange={(x) => setF({ ...f, weight: x.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ScoreGrid({ exam, onClose }: { exam: Doc<Exam>; onClose: () => void }) {
  const c = useCtx();
  const students = useMemo(() => activeStudents(c.data, exam.data.class_id).sort((a, b) => studentName(a.data).localeCompare(studentName(b.data), "fr")), [c.data, exam.data.class_id]);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { setVals(Object.fromEntries(students.map((s) => [s.id, typeof exam.data.scores[s.id] === "number" ? String(exam.data.scores[s.id]) : ""]))); }, [students, exam.data.scores]);
  const bad = (s: Doc<Student>) => { const v = vals[s.id]; return v !== undefined && v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > exam.data.max); };
  const changed = students.filter((s) => (vals[s.id] ?? "") !== (typeof exam.data.scores[s.id] === "number" ? String(exam.data.scores[s.id]) : ""));
  return (
    <Modal wide title={`${exam.data.name} · notes sur ${exam.data.max}`} onClose={onClose} footer={<button className="btn btn-primary" disabled={!changed.length || changed.some(bad)} onClick={async () => (await c.run("grades.save", { exam_id: exam.id, scores: Object.fromEntries(changed.map((s) => [s.id, vals[s.id] === "" ? null : Number(vals[s.id])])) })) && onClose()}>Enregistrer {changed.length ? `(${changed.length})` : ""}</button>}>
      {students.length === 0 ? <p className="text-sm text-slate-600">Aucun élève inscrit dans cette classe.</p> : (
        <ul className="divide-y divide-slate-100">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 truncate text-sm">{studentName(s.data)}</span>
              <input className={`input w-24 text-right ${bad(s) ? "border-red-400" : ""}`} inputMode="decimal" value={vals[s.id] ?? ""} placeholder="—" aria-label={`Note de ${studentName(s.data)}`} onChange={(e) => setVals({ ...vals, [s.id]: e.target.value.replace(",", ".") })} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">Laissez vide pour « non noté ». Chaque modification est conservée dans l&apos;historique des fiches.</p>
    </Modal>
  );
}
void Card;
