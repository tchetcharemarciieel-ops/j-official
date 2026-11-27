"use client";

import { BookOpen, Plus } from "lucide-react";
import { useState } from "react";
import type { Assign, Doc, Klass, Level, Subject, Teacher, Year } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, Tabs, activeStudents, currentYear, fmtD, sortByName } from "../ui";

/** Structure de l'établissement : années scolaires, niveaux, classes, matières, coefficients et enseignants affectés. */
export function Structure() {
  const c = useCtx();
  const [tab, setTab] = useState<"classes" | "matieres" | "annees">("classes");
  const can = c.may("classes");
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={[["classes", "Classes et niveaux"], ["matieres", "Matières"], ["annees", "Années scolaires"]]} />
      {tab === "classes" && <Classes can={can} />}
      {tab === "matieres" && <Subjects can={can} />}
      {tab === "annees" && <Years can={can} />}
    </div>
  );
}

function Classes({ can }: { can: boolean }) {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Klass> | "new" | null>(null);
  const [lvl, setLvl] = useState<Doc<Level> | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(c.focus);
  const levels = (c.data.level as Doc<Level>[]).sort((a, b) => a.data.order - b.data.order);
  const year = currentYear(c.data);
  const classes = (c.data.class as Doc<Klass>[]).filter((k) => !year || k.data.year_id === year.id).sort(sortByName);
  const teachers = c.data.teacher as Doc<Teacher>[];
  const sel = classes.find((k) => k.id === open);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {can && <button className="btn btn-primary" onClick={() => setEdit("new")} disabled={!levels.length || !year}><Plus className="h-4 w-4" /> Classe</button>}
        {can && <button className="btn btn-ghost" onClick={() => setLvl("new")}><Plus className="h-4 w-4" /> Niveau</button>}
        {year && <Badge tone="blue">Année {year.data.name}</Badge>}
      </div>
      {!year && <Empty icon={BookOpen} title="Créez d'abord une année scolaire" text="Onglet « Années scolaires »." />}
      {levels.length > 0 && <div className="flex flex-wrap gap-2">{levels.map((l) => <button key={l.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm hover:border-slate-300" onClick={() => can && setLvl(l)}>{l.data.name}</button>)}</div>}
      {classes.length === 0 ? <Empty icon={BookOpen} title="Aucune classe" text="Créez vos classes puis affectez-y des matières avec leurs coefficients." /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((k) => {
            const n = activeStudents(c.data, k.id).length;
            const t = teachers.find((x) => x.id === k.data.titular_id);
            return (
              <li key={k.id}><button className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-300" onClick={() => setOpen(k.id)}>
                <p className="font-semibold">{k.data.name}</p>
                <p className="text-xs text-slate-500">{levels.find((l) => l.id === k.data.level_id)?.data.name} · {n} élève(s){k.data.capacity ? ` / ${k.data.capacity}` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Titulaire : {t?.data.name ?? "—"}</p>
              </button></li>
            );
          })}
        </ul>
      )}
      {edit && year && <ClassForm k={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {lvl && <LevelForm l={lvl === "new" ? null : lvl} onClose={() => setLvl(null)} />}
      {sel && <ClassView k={sel} can={can} onClose={() => setOpen(null)} onEdit={() => (setOpen(null), setEdit(sel))} />}
    </div>
  );
}

function ClassForm({ k, onClose }: { k: Doc<Klass> | null; onClose: () => void }) {
  const c = useCtx();
  const year = currentYear(c.data)!;
  const levels = c.data.level as Doc<Level>[];
  const [f, setF] = useState({ name: k?.data.name ?? "", level_id: k?.data.level_id ?? levels[0]?.id ?? "", titular_id: k?.data.titular_id ?? "", capacity: k?.data.capacity ? String(k.data.capacity) : "" });
  return (
    <Modal title={k ? "Modifier la classe" : "Nouvelle classe"} onClose={onClose} footer={<>
      {k && <DeleteButton confirmText="Supprimer cette classe ? (refusé si elle a des élèves ou des notes)" onConfirm={async () => { if (await c.run("class.delete", { id: k.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!f.name.trim() || !f.level_id} onClick={async () => (await c.run("class.save", { id: k?.id, name: f.name, level_id: f.level_id, year_id: k?.data.year_id ?? year.id, titular_id: f.titular_id || null, capacity: f.capacity || null })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="6ème A" autoFocus /></Field>
        <Pick label="Niveau" value={f.level_id} onChange={(v) => setF({ ...f, level_id: v })} options={levels.map((l) => [l.id, l.data.name])} required />
        <Pick label="Enseignant titulaire" value={f.titular_id} onChange={(v) => setF({ ...f, titular_id: v })} options={(c.data.teacher as Doc<Teacher>[]).map((t) => [t.id, t.data.name])} empty="Aucun" />
        <Field label="Capacité (places)" hint="Vide = illimitée"><input className="input" type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function LevelForm({ l, onClose }: { l: Doc<Level> | null; onClose: () => void }) {
  const c = useCtx();
  const [name, setName] = useState(l?.data.name ?? "");
  const [order, setOrder] = useState(String(l?.data.order ?? (c.data.level.length + 1)));
  return (
    <Modal title={l ? "Modifier le niveau" : "Nouveau niveau"} onClose={onClose} footer={<>
      {l && <DeleteButton confirmText="Supprimer ce niveau ?" onConfirm={async () => { if (await c.run("level.delete", { id: l.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!name.trim()} onClick={async () => (await c.run("level.save", { id: l?.id, name, order: Number(order) })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Nom *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field><Field label="Ordre"><input className="input" type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} /></Field></div>
    </Modal>
  );
}

function ClassView({ k, can, onClose, onEdit }: { k: Doc<Klass>; can: boolean; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const assigns = (c.data.assign as Doc<Assign>[]).filter((a) => a.data.class_id === k.id);
  const subjects = c.data.subject as Doc<Subject>[];
  const teachers = c.data.teacher as Doc<Teacher>[];
  const [add, setAdd] = useState({ subject_id: "", teacher_id: "", coef: "1" });
  const free = subjects.filter((s) => !assigns.some((a) => a.data.subject_id === s.id));
  return (
    <Modal wide title={k.data.name} onClose={onClose} footer={can ? <button className="btn btn-ghost" onClick={onEdit}>Modifier la classe</button> : undefined}>
      <p className="mb-2 text-sm font-semibold">Matières, enseignants et coefficients</p>
      {assigns.length === 0 ? <p className="text-sm text-slate-600">Aucune matière affectée : les bulletins ne pourront pas être calculés.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {assigns.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium">{subjects.find((s) => s.id === a.data.subject_id)?.data.name}</span>
              {can ? (
                <>
                  <select className="input w-auto" value={a.data.teacher_id ?? ""} aria-label="Enseignant" onChange={(e) => void c.run("assign.save", { id: a.id, class_id: k.id, subject_id: a.data.subject_id, teacher_id: e.target.value || null, coef: a.data.coef })}><option value="">Sans enseignant</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.data.name}</option>)}</select>
                  <input className="input w-20" type="number" min="0.5" step="0.5" defaultValue={a.data.coef} aria-label="Coefficient" onBlur={(e) => Number(e.target.value) !== a.data.coef && void c.run("assign.save", { id: a.id, class_id: k.id, subject_id: a.data.subject_id, teacher_id: a.data.teacher_id, coef: Number(e.target.value) })} />
                  <button className="text-xs text-red-700 hover:underline" onClick={() => confirm("Retirer cette matière de la classe ?") && void c.run("assign.delete", { id: a.id })}>Retirer</button>
                </>
              ) : <span className="text-xs text-slate-500">{teachers.find((t) => t.id === a.data.teacher_id)?.data.name ?? "Sans enseignant"} · coef. {a.data.coef}</span>}
            </li>
          ))}
        </ul>
      )}
      {can && free.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1"><Pick label="Ajouter une matière" value={add.subject_id} onChange={(v) => setAdd({ ...add, subject_id: v })} options={free.map((s) => [s.id, s.data.name])} empty="Choisir…" /></div>
          <div className="min-w-[10rem] flex-1"><Pick label="Enseignant" value={add.teacher_id} onChange={(v) => setAdd({ ...add, teacher_id: v })} options={teachers.map((t) => [t.id, t.data.name])} empty="Aucun" /></div>
          <Field label="Coef."><input className="input w-20" type="number" min="0.5" step="0.5" value={add.coef} onChange={(e) => setAdd({ ...add, coef: e.target.value })} /></Field>
          <button className="btn btn-primary" disabled={!add.subject_id} onClick={async () => (await c.run("assign.save", { class_id: k.id, subject_id: add.subject_id, teacher_id: add.teacher_id || null, coef: Number(add.coef) })) && setAdd({ subject_id: "", teacher_id: "", coef: "1" })}>Ajouter</button>
        </div>
      )}
    </Modal>
  );
}

function Subjects({ can }: { can: boolean }) {
  const c = useCtx();
  const [name, setName] = useState("");
  const subjects = (c.data.subject as Doc<Subject>[]).sort(sortByName);
  return (
    <Card title="Matières de l'établissement" subtitle="Créez la liste une fois, puis affectez chaque matière aux classes avec son coefficient.">
      {can && <form className="mb-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await c.run("subject.save", { name })) setName(""); }}><input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathématiques" /><button className="btn btn-primary" disabled={!name.trim()}>Ajouter</button></form>}
      {subjects.length === 0 ? <p className="text-sm text-slate-600">Aucune matière.</p> : <ul className="flex flex-wrap gap-2">{subjects.map((s) => <li key={s.id} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">{s.data.name}{can && <button aria-label={`Supprimer ${s.data.name}`} className="text-slate-400 hover:text-red-600" onClick={() => confirm(`Supprimer la matière ${s.data.name} ?`) && void c.run("subject.delete", { id: s.id })}>×</button>}</li>)}</ul>}
    </Card>
  );
}

function Years({ can }: { can: boolean }) {
  const c = useCtx();
  const years = (c.data.year as Doc<Year>[]).sort((a, b) => b.data.start.localeCompare(a.data.start));
  const y0 = new Date().getFullYear();
  const [f, setF] = useState({ name: `${y0}-${y0 + 1}`, start: `${y0}-09-01`, end: `${y0 + 1}-06-30` });
  return (
    <Card title="Années scolaires" subtitle="Une seule année est « en cours ». Les données des anciennes années sont conservées.">
      <ul className="divide-y divide-slate-100">
        {years.map((y) => (
          <li key={y.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="font-medium">{y.data.name}</span><span className="text-slate-500">{fmtD(y.data.start)} → {fmtD(y.data.end)}</span>{y.data.current ? <Badge tone="green">En cours</Badge> : can && <button className="text-xs text-blue-700 hover:underline" onClick={() => confirm(`Passer à l'année ${y.data.name} ?`) && void c.run("year.current", { id: y.id })}>Définir en cours</button>}</li>
        ))}
      </ul>
      {can && (
        <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); await c.run("year.save", { ...f, current: years.length === 0 }); }}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nom" /><input className="input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} aria-label="Début" /><input className="input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} aria-label="Fin" /><button className="btn btn-primary">Ajouter l&apos;année</button>
        </form>
      )}
    </Card>
  );
}
