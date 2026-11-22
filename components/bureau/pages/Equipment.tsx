"use client";

import { Laptop, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EQUIP_KINDS, EQUIP_STATE, type Doc, type Equipment as Eq } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, Pick, SearchBox, fmtDate, timeFmt } from "../ui";

/** Équipements : attribution aux employés, état et historique des mouvements. */
export function Equipment() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [edit, setEdit] = useState<Doc<Eq> | "new" | null>(null);
  const canEdit = c.may("equipements");
  const rows = useMemo(() => (c.data.equipment as Doc<Eq>[]).filter((e) => (!state || e.data.state === state) && (!q.trim() || [e.data.name, e.data.serial, e.data.location, c.empName(e.data.assigned_to)].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())))).sort((a, b) => a.data.name.localeCompare(b.data.name, "fr")), [c.data.equipment, q, state, c]);
  const tone = (s: string) => (s === "panne" ? "red" : s === "reforme" ? "slate" : s === "usage" ? "amber" : "green") as "red" | "slate" | "amber" | "green";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Nom, n° de série, lieu, personne…" /></div>
        <select className="input !w-auto" value={state} onChange={(e) => setState(e.target.value)} aria-label="État"><option value="">Tous les états</option>{Object.entries(EQUIP_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Équipement</button>}
      </div>
      {rows.length === 0 ? <Empty icon={Laptop} title="Aucun équipement" text="Suivez ordinateurs, imprimantes, mobilier et leur attribution." /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((e) => (
            <li key={e.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setEdit(e)}>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.data.name}</span><span className="block truncate text-xs text-slate-500">{EQUIP_KINDS[e.data.kind]}{e.data.serial ? ` · ${e.data.serial}` : ""}{e.data.location ? ` · ${e.data.location}` : ""} · {e.data.assigned_to ? `attribué à ${c.empName(e.data.assigned_to)}` : "non attribué"}</span></span>
              <Badge tone={tone(e.data.state)}>{EQUIP_STATE[e.data.state]}</Badge>
            </button></li>
          ))}
        </ul>
      )}
      {edit && <EqForm eq={edit === "new" ? null : edit} canEdit={canEdit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EqForm({ eq, canEdit, onClose }: { eq: Doc<Eq> | null; canEdit: boolean; onClose: () => void }) {
  const c = useCtx();
  const d = eq?.data;
  const [f, setF] = useState({ name: d?.name ?? "", kind: d?.kind ?? ("ordinateur" as keyof typeof EQUIP_KINDS), serial: d?.serial ?? "", state: d?.state ?? ("bon" as keyof typeof EQUIP_STATE), assigned_to: d?.assigned_to ?? "", location: d?.location ?? "", purchase_date: d?.purchase_date ?? "", purchase_price: d?.purchase_price != null ? String(d.purchase_price) : "", notes: d?.notes ?? "" });
  const [note, setNote] = useState("");
  const emps: [string, string][] = (c.data.employee as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  const save = async () => {
    const r = await c.run("equipment.save", { id: eq?.id, ...f, assigned_to: f.assigned_to || null, purchase_date: f.purchase_date || null, purchase_price: f.purchase_price === "" ? null : Number(f.purchase_price) });
    if (r) onClose();
  };
  return (
    <Modal wide title={eq ? "Équipement" : "Nouvel équipement"} onClose={onClose} footer={canEdit ? (
      <>
        {eq && <DeleteButton confirmText="Supprimer cet équipement ?" onConfirm={async () => (await c.run("equipment.delete", { id: eq.id })) && onClose()} />}
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>Enregistrer</button>
      </>
    ) : <button className="btn btn-ghost" onClick={onClose}>Fermer</button>}>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" className="sm:col-span-2"><input className="input" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{Object.entries(EQUIP_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="N° de série"><input className="input" value={f.serial} maxLength={80} onChange={(e) => setF({ ...f, serial: e.target.value })} /></Field>
        <Field label="État"><select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value as typeof f.state })}>{Object.entries(EQUIP_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pick label="Attribué à" value={f.assigned_to} onChange={(v) => setF({ ...f, assigned_to: v })} options={emps} empty="Non attribué" />
        <Field label="Emplacement"><input className="input" value={f.location} maxLength={80} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Date d'achat"><input className="input" type="date" value={f.purchase_date} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} /></Field>
        <Field label="Prix d'achat"><input className="input" type="number" min="0" step="any" value={f.purchase_price} onChange={(e) => setF({ ...f, purchase_price: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </fieldset>
      {eq && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-1 text-sm font-semibold">Historique</p>
          {d!.history.length === 0 ? <p className="text-xs text-slate-500">Aucun mouvement.</p> : <ul className="space-y-1 text-xs text-slate-600">{[...d!.history].reverse().slice(0, 15).map((h, i) => <li key={i}>{timeFmt(h.at)} · {c.memberName(h.by)} — {h.text}</li>)}</ul>}
          {canEdit && <p className="mt-2 text-xs text-slate-500">Achat : {fmtDate(d!.purchase_date)}. Les changements d&apos;attribution et d&apos;état sont journalisés à l&apos;enregistrement.</p>}
        </div>
      )}
    </Modal>
  );
}
