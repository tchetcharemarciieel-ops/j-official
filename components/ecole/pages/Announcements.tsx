"use client";

import { Megaphone, Plus } from "lucide-react";
import { useState } from "react";
import { AUDIENCES, type Announcement, type Doc, type Klass } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, Pick, fmtD, sortByName } from "../ui";

/** Annonces de l'école : visibles par les parents, les enseignants ou le personnel (notification dans l'application pour les parents). */
export function Announcements() {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Announcement> | "new" | null>(null);
  const rows = (c.data.announcement as Doc<Announcement>[]).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const can = c.may("annonces");
  return (
    <div className="space-y-4">
      {can && <div className="flex justify-end"><button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Annonce</button></div>}
      {rows.length === 0 ? <Empty icon={Megaphone} title="Aucune annonce" text="Publiez les informations importantes : réunion de parents, vacances, résultats…" /> : (
        <ul className="space-y-3">{rows.map((a) => (
          <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{a.data.title}</p><Badge tone="blue">{AUDIENCES[a.data.audience]}</Badge>{a.data.class_id && <Badge>{(c.data.class as Doc<Klass>[]).find((k) => k.id === a.data.class_id)?.data.name}</Badge>}<span className="ml-auto text-xs text-slate-500">{fmtD(a.data.date)}</span></div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{a.data.body}</p>
            {can && <button className="mt-2 text-xs text-blue-700 hover:underline" onClick={() => setEdit(a)}>Modifier</button>}
          </li>
        ))}</ul>
      )}
      {edit && <Form a={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Form({ a, onClose }: { a: Doc<Announcement> | null; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ title: a?.data.title ?? "", body: a?.data.body ?? "", audience: a?.data.audience ?? ("tous" as keyof typeof AUDIENCES), class_id: a?.data.class_id ?? "" });
  return (
    <Modal wide title={a ? "Modifier l'annonce" : "Nouvelle annonce"} onClose={onClose} footer={<>
      {a && <DeleteButton confirmText="Supprimer cette annonce ?" onConfirm={async () => { if (await c.run("announcement.delete", { id: a.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!f.title.trim() || !f.body.trim()} onClick={async () => (await c.run("announcement.save", { id: a?.id, ...f, class_id: f.class_id || null })) && onClose()}>{a ? "Enregistrer" : "Publier"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre *" className="sm:col-span-2"><input className="input" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Field label="Pour"><select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as keyof typeof AUDIENCES })}>{Object.entries(AUDIENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pick label="Classe concernée" value={f.class_id} onChange={(v) => setF({ ...f, class_id: v })} options={(c.data.class as Doc<Klass>[]).sort(sortByName).map((k) => [k.id, k.data.name])} empty="Toutes" />
        <Field label="Message *" className="sm:col-span-2"><textarea className="input" rows={5} value={f.body} maxLength={2000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      </div>
      {!a && <p className="mt-2 text-xs text-slate-500">Les parents reliés à un compte reçoivent une notification dans l&apos;application. Aucun SMS ni e-mail n&apos;est envoyé.</p>}
    </Modal>
  );
}
