"use client";

import { Fuel, Plus, Truck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { VEHICLE_KINDS, VEHICLE_STATE, today, type Courier, type Doc, type Vehicle } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, SearchBox, fmtD, uid } from "../ui";

/** Véhicules : motos, voitures, camionnettes, camions ; état, conducteur, entretien et carburant (dépenses enregistrées en finances). */
export function Vehicles() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Vehicle> | "new" | null>(null);
  const [view, setView] = useState<string | null>(null);
  const canEdit = c.may("vehicules");
  const rows = useMemo(() => (c.data.vehicle as Doc<Vehicle>[]).filter((v) => !q.trim() || [v.data.brand, v.data.model, v.data.plate].some((s) => s.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => a.data.plate.localeCompare(b.data.plate)), [c.data.vehicle, q]);
  const sel = rows.find((v) => v.id === view);
  const due = (v: Vehicle) => Boolean(v.next_maintenance && v.next_maintenance <= today());
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Marque, modèle, immatriculation…" /></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Véhicule</button>}
      </div>
      {rows.length === 0 ? <Empty icon={Truck} title="Aucun véhicule" action={canEdit ? <button className="btn btn-primary" onClick={() => setEdit("new")}>Ajouter un véhicule</button> : undefined} /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((v) => (
            <li key={v.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(v.id)}>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{v.data.brand} {v.data.model} · {v.data.plate}</span><span className="block truncate text-xs text-slate-500">{VEHICLE_KINDS[v.data.kind]} · conducteur : {c.courierName(v.data.driver_id)}{v.data.next_maintenance ? ` · entretien ${fmtD(v.data.next_maintenance)}` : ""}</span></span>
              <span className="flex flex-col items-end gap-1"><Badge tone={v.data.state === "bon" ? "green" : v.data.state === "entretien" ? "amber" : "red"}>{VEHICLE_STATE[v.data.state]}</Badge>{due(v.data) && <Badge tone="amber">Entretien dû</Badge>}<Badge tone={v.data.available ? "green" : "slate"}>{v.data.available ? "Disponible" : "Indisponible"}</Badge></span>
            </button></li>
          ))}
        </ul>
      )}
      {edit && <VehicleForm v={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <VehicleView v={sel} canEdit={canEdit} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function VehicleForm({ v, onClose }: { v: Doc<Vehicle> | null; onClose: () => void }) {
  const c = useCtx();
  const d = v?.data;
  const [f, setF] = useState({ brand: d?.brand ?? "", model: d?.model ?? "", plate: d?.plate ?? "", kind: d?.kind ?? ("moto" as keyof typeof VEHICLE_KINDS), driver_id: d?.driver_id ?? "", state: d?.state ?? ("bon" as keyof typeof VEHICLE_STATE), available: d?.available ?? true, next_maintenance: d?.next_maintenance ?? "", notes: d?.notes ?? "" });
  const drivers: [string, string][] = (c.data.courier as Doc<Courier>[]).map((x) => [x.id, x.data.name]);
  return (
    <Modal wide title={v ? "Modifier le véhicule" : "Nouveau véhicule"} onClose={onClose} footer={
      <>{v && <DeleteButton confirmText="Supprimer ce véhicule ?" onConfirm={async () => (await c.run("vehicle.delete", { id: v.id })) && onClose()} />}<button className="btn btn-primary" disabled={!f.brand.trim() || !f.plate.trim()} onClick={async () => (await c.run("vehicle.save", { id: v?.id, ...f, driver_id: f.driver_id || null, next_maintenance: f.next_maintenance || null })) && onClose()}>Enregistrer</button></>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Marque *"><input className="input" value={f.brand} maxLength={60} onChange={(e) => setF({ ...f, brand: e.target.value })} autoFocus /></Field>
        <Field label="Modèle"><input className="input" value={f.model} maxLength={60} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
        <Field label="Immatriculation *"><input className="input" value={f.plate} maxLength={30} onChange={(e) => setF({ ...f, plate: e.target.value })} /></Field>
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{Object.entries(VEHICLE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pick label="Conducteur attribué" value={f.driver_id} onChange={(x) => setF({ ...f, driver_id: x })} options={drivers} empty="Aucun" />
        <Field label="État"><select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value as typeof f.state })}>{Object.entries(VEHICLE_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Prochain entretien"><input className="input" type="date" value={f.next_maintenance} onChange={(e) => setF({ ...f, next_maintenance: e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Disponible</label>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function VehicleView({ v, canEdit, onClose, onEdit }: { v: Doc<Vehicle>; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const d = v.data;
  const [m, setM] = useState({ date: today(), kind: "", cost: "", next: "" });
  const [fu, setFu] = useState({ date: today(), liters: "", cost: "" });
  const money = c.may("finances") || c.may("vehicules");
  return (
    <Modal wide title={`${d.brand} ${d.model} · ${d.plate}`} onClose={onClose} footer={canEdit ? <button className="btn btn-primary" onClick={onEdit}>Modifier</button> : undefined}>
      <div className="space-y-4 text-sm">
        <p>{VEHICLE_KINDS[d.kind]} · {VEHICLE_STATE[d.state]} · conducteur : {c.courierName(d.driver_id)} · prochain entretien : {fmtD(d.next_maintenance)}</p>
        <Card title={<span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Entretien</span>}>
          {d.maintenance.length === 0 ? <p className="text-slate-500">Aucun entretien enregistré.</p> : <ul className="divide-y divide-slate-100">{[...d.maintenance].sort((a, b) => b.date.localeCompare(a.date)).map((e) => <li key={e.id} className="flex items-center gap-2 py-1.5"><span className="flex-1">{fmtD(e.date)} · {e.kind}{e.note ? ` — ${e.note}` : ""} · <b>{c.fmt(e.cost)}</b></span>{canEdit && <button className="text-xs text-red-600 underline" onClick={() => c.run("vehicle.entry_delete", { id: v.id, kind: "maintenance", eid: e.id })}>Retirer</button>}</li>)}</ul>}
          {canEdit && <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-5"><Field label="Date"><input className="input" type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field><Field label="Nature"><input className="input" value={m.kind} maxLength={80} onChange={(e) => setM({ ...m, kind: e.target.value })} placeholder="Vidange" /></Field><Field label="Coût"><input className="input" inputMode="decimal" value={m.cost} onChange={(e) => setM({ ...m, cost: e.target.value })} /></Field><Field label="Prochain"><input className="input" type="date" value={m.next} onChange={(e) => setM({ ...m, next: e.target.value })} /></Field><button className="btn btn-primary self-end" disabled={!m.kind.trim() || m.cost === ""} onClick={async () => { if (await c.run("vehicle.maintenance", { id: v.id, eid: uid(), date: m.date, kind: m.kind, cost: Number(m.cost) || 0, next: m.next || null })) setM({ date: today(), kind: "", cost: "", next: "" }); }}>Ajouter</button></div>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Fuel className="h-4 w-4" /> Carburant</span>} subtitle={money ? `Total : ${c.fmt(d.fuel.reduce((a, e) => a + e.cost, 0))}` : undefined}>
          {d.fuel.length === 0 ? <p className="text-slate-500">Aucun plein enregistré.</p> : <ul className="divide-y divide-slate-100">{[...d.fuel].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((e) => <li key={e.id} className="flex items-center gap-2 py-1.5"><span className="flex-1">{fmtD(e.date)}{e.liters ? ` · ${e.liters} L` : ""} · <b>{c.fmt(e.cost)}</b></span>{canEdit && <button className="text-xs text-red-600 underline" onClick={() => c.run("vehicle.entry_delete", { id: v.id, kind: "fuel", eid: e.id })}>Retirer</button>}</li>)}</ul>}
          {canEdit && <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-4"><Field label="Date"><input className="input" type="date" value={fu.date} onChange={(e) => setFu({ ...fu, date: e.target.value })} /></Field><Field label="Litres"><input className="input" inputMode="decimal" value={fu.liters} onChange={(e) => setFu({ ...fu, liters: e.target.value })} /></Field><Field label="Coût"><input className="input" inputMode="decimal" value={fu.cost} onChange={(e) => setFu({ ...fu, cost: e.target.value })} /></Field><button className="btn btn-primary self-end" disabled={!(Number(fu.cost) > 0)} onClick={async () => { if (await c.run("vehicle.fuel", { id: v.id, eid: uid(), date: fu.date, liters: fu.liters === "" ? null : Number(fu.liters), cost: Number(fu.cost) })) setFu({ date: today(), liters: "", cost: "" }); }}>Ajouter</button></div>}
        </Card>
        <p className="text-xs text-slate-500">Les coûts d&apos;entretien et de carburant sont aussi inscrits en dépenses (Finances).</p>
      </div>
    </Modal>
  );
}
