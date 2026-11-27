"use client";

import { Plus, Users } from "lucide-react";
import { useState } from "react";
import type { Assign, Doc, Klass, Subject, Teacher } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, Pick, SearchBox, sortByName } from "../ui";

/** Enseignants : fiches, compte de connexion relié (pour la saisie des notes) et matières enseignées. */
export function Teachers() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Teacher> | "new" | null>(null);
  const can = c.may("enseignants");
  const rows = (c.data.teacher as Doc<Teacher>[]).filter((t) => !q.trim() || t.data.name.toLowerCase().includes(q.trim().toLowerCase())).sort(sortByName);
  const assigns = c.data.assign as Doc<Assign>[];
  const klass = c.data.class as Doc<Klass>[];
  const subjects = c.data.subject as Doc<Subject>[];
  const teaching = (id: string) => assigns.filter((a) => a.data.teacher_id === id).map((a) => `${subjects.find((s) => s.id === a.data.subject_id)?.data.name ?? "?"} (${klass.find((k) => k.id === a.data.class_id)?.data.name ?? "?"})`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Nom de l'enseignant…" /></div>{can && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Enseignant</button>}</div>
      {rows.length === 0 ? <Empty icon={Users} title="Aucun enseignant" text="Ajoutez vos enseignants, puis reliez chacun à son compte pour qu'il saisisse les notes de ses classes." /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((t) => (
            <li key={t.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => can && setEdit(t)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold">{t.data.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.data.name}{t.data.specialty ? ` · ${t.data.specialty}` : ""}</span><span className="block truncate text-xs text-slate-500">{teaching(t.id).join(", ") || "Aucune affectation"}</span></span>
              <span className="flex flex-col items-end gap-1">{t.data.status === "inactif" && <Badge>Inactif</Badge>}{t.data.user_id ? <Badge tone="green">Compte relié</Badge> : <Badge tone="amber">Sans compte</Badge>}</span>
            </button></li>
          ))}
        </ul>
      )}
      {edit && <TeacherForm t={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TeacherForm({ t, onClose }: { t: Doc<Teacher> | null; onClose: () => void }) {
  const c = useCtx();
  const d = t?.data;
  const [f, setF] = useState({ name: d?.name ?? "", phone: d?.phone ?? "", email: d?.email ?? "", user_id: d?.user_id ?? "", specialty: d?.specialty ?? "", status: d?.status ?? ("actif" as "actif" | "inactif") });
  return (
    <Modal wide title={t ? "Fiche de l'enseignant" : "Nouvel enseignant"} onClose={onClose} footer={<>
      {t && <DeleteButton confirmText="Supprimer cet enseignant ? (refusé s'il a des classes affectées)" onConfirm={async () => { if (await c.run("teacher.delete", { id: t.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!f.name.trim()} onClick={async () => (await c.run("teacher.save", { id: t?.id, ...f, user_id: f.user_id || null })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Spécialité"><input className="input" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Pick label="Compte de connexion" value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={c.s.members.filter((m) => m.active).map((m) => [m.id, `${m.name}${m.position ? ` (${m.position})` : ""}`])} empty="Aucun (pas d'accès)" />
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "actif" | "inactif" })}><option value="actif">Actif</option><option value="inactif">Inactif</option></select></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">Invitez l&apos;enseignant avec le poste « Enseignant » (Comptes et accès), puis reliez son compte ici : il ne verra que ses classes et ses matières.</p>
    </Modal>
  );
}
