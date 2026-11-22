"use client";

import { Bike, MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ORDER_STATUS, courierStats, type Courier, type Doc, type Order, type Vehicle } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, MultiPick, Pick, SearchBox, STATUS_TONE, Stat, fmtDT } from "../ui";

/** Livreurs : profils, disponibilités, zones, comptes reliés, missions et performances individuelles. */
export function Couriers() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Courier> | "new" | null>(null);
  const [view, setView] = useState<string | null>(c.focus);
  const orders = c.data.order as Doc<Order>[];
  const canEdit = c.may("livreurs");
  const rows = useMemo(() => (c.data.courier as Doc<Courier>[]).filter((x) => !q.trim() || [x.data.name, x.data.phone, ...x.data.zones].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => a.data.name.localeCompare(b.data.name, "fr")), [c.data.courier, q]);
  const sel = rows.find((x) => x.id === view);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Nom, téléphone, zone…" /></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Livreur</button>}
      </div>
      {rows.length === 0 ? <Empty icon={Bike} title="Aucun livreur" text="Ajoutez vos livreurs, puis reliez chacun à son compte pour qu'il voie ses missions sur son téléphone." action={canEdit ? <button className="btn btn-primary" onClick={() => setEdit("new")}>Ajouter un livreur</button> : undefined} /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((x) => {
            const st = courierStats(orders, x.id);
            return (
              <li key={x.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(x.id)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold">{x.data.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.data.name}</span><span className="block truncate text-xs text-slate-500">{x.data.phone || "Sans téléphone"} · {st.active} mission(s) en cours · {st.done} livrée(s){x.data.zones.length ? ` · ${x.data.zones.join(", ")}` : ""}</span></span>
                <span className="flex flex-col items-end gap-1">{x.data.status === "inactif" ? <Badge>Inactif</Badge> : <Badge tone={x.data.available ? "green" : "amber"}>{x.data.available ? "Disponible" : "Indisponible"}</Badge>}{x.data.sharing && <Badge tone="blue">Position partagée</Badge>}</span>
              </button></li>
            );
          })}
        </ul>
      )}
      {edit && <CourierForm courier={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <CourierView x={sel} canEdit={canEdit} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function CourierForm({ courier, onClose }: { courier: Doc<Courier> | null; onClose: () => void }) {
  const c = useCtx();
  const d = courier?.data;
  const [f, setF] = useState({ name: d?.name ?? "", phone: d?.phone ?? "", email: d?.email ?? "", user_id: d?.user_id ?? "", zones: d?.zones ?? ([] as string[]), vehicle_id: d?.vehicle_id ?? "", available: d?.available ?? true, status: d?.status ?? ("actif" as "actif" | "inactif"), commission: d?.commission_rate != null ? String(d.commission_rate) : "", notes: d?.notes ?? "" });
  const members: [string, string][] = c.s.members.filter((m) => m.active).map((m) => [m.id, `${m.name}${m.position ? ` (${m.position})` : ""}`]);
  const vehicles: [string, string][] = (c.data.vehicle as Doc<Vehicle>[]).map((v) => [v.id, `${v.data.brand} ${v.data.model} · ${v.data.plate}`]);
  const zones: [string, string][] = c.settings.tariff.zones.map((z) => [z.name, z.name]);
  return (
    <Modal wide title={courier ? "Profil du livreur" : "Nouveau livreur"} onClose={onClose} footer={<button className="btn btn-primary" disabled={!f.name.trim()} onClick={async () => (await c.run("courier.save", { id: courier?.id, ...f, user_id: f.user_id || null, vehicle_id: f.vehicle_id || null, commission_rate: f.commission === "" ? null : Number(f.commission) })) && onClose()}>Enregistrer</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} maxLength={120} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Pick label="Compte de connexion" value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={members} empty="Aucun (pas d'application livreur)" />
        <Pick label="Véhicule attribué" value={f.vehicle_id} onChange={(v) => setF({ ...f, vehicle_id: v })} options={vehicles} empty="Aucun" />
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "actif" | "inactif" })}><option value="actif">Actif</option><option value="inactif">Inactif</option></select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Disponible</label>
        <Field label="Commission propre (%)" hint="Vide : taux de l'entreprise."><input className="input" inputMode="decimal" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} /></Field>
        <div className="sm:col-span-2">{zones.length ? <MultiPick label="Zones de livraison" value={f.zones} onChange={(v) => setF({ ...f, zones: v })} options={zones} /> : <Field label="Zones (séparées par des virgules)"><input className="input" value={f.zones.join(", ")} onChange={(e) => setF({ ...f, zones: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>}</div>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">Pour donner accès à l&apos;application livreur : invitez la personne (Comptes et accès) avec le poste « Livreur », puis choisissez son compte ci-dessus.</p>
    </Modal>
  );
}

function CourierView({ x, canEdit, onClose, onEdit }: { x: Doc<Courier>; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const orders = c.data.order as Doc<Order>[];
  const st = courierStats(orders, x.id);
  const mine = orders.filter((o) => o.data.courier_id === x.id).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const rate = x.data.commission_rate ?? c.settings.commission_rate;
  return (
    <Modal wide title={x.data.name} onClose={onClose} footer={canEdit ? <><DeleteButton confirmText="Supprimer ce livreur ?" onConfirm={async () => (await c.run("courier.delete", { id: x.id })) && onClose()} /><button className="btn btn-primary" onClick={onEdit}>Modifier</button></> : undefined}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">{x.data.status === "inactif" ? <Badge>Inactif</Badge> : <Badge tone={x.data.available ? "green" : "amber"}>{x.data.available ? "Disponible" : "Indisponible"}</Badge>}{x.data.phone && <a className="text-[var(--brand)]" href={`tel:${x.data.phone}`}>{x.data.phone}</a>}{x.data.zones.length > 0 && <span className="text-slate-500">Zones : {x.data.zones.join(", ")}</span>}</div>
        {x.data.sharing && x.data.pos && <p className="flex items-center gap-1 text-slate-600"><MapPin className="h-4 w-4" /> Dernière position partagée : {fmtDT(x.data.pos.at)} ({x.data.pos.lat.toFixed(4)}, {x.data.pos.lng.toFixed(4)})</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Missions" value={st.assigned} />
          <Stat label="Livrées" value={st.done} tone="green" />
          <Stat label="Échecs" value={st.failed} tone={st.failed ? "red" : "slate"} />
          <Stat label="Réussite" value={st.successRate !== null ? `${st.successRate} %` : "—"} />
          <Stat label="À l'heure" value={st.onTimeRate !== null ? `${st.onTimeRate} %` : "—"} />
          <Stat label="Durée moyenne" value={st.avgMinutes !== null ? `${st.avgMinutes} min` : "—"} hint="Récupération → livraison" />
          <Stat label="Valeur livrée" value={c.fmt(st.revenue)} />
          <Stat label={`Commission ${rate} %`} value={c.fmt((st.revenue * rate) / 100)} hint="Estimation sur les livraisons" />
        </div>
        <Card title="Missions">
          {mine.length === 0 ? <p className="text-slate-500">Aucune mission.</p> : <ul className="divide-y divide-slate-100">{mine.slice(0, 15).map((o) => <li key={o.id} className="flex items-center gap-2 py-1.5"><span className="flex-1 truncate"><b>{o.data.number}</b> · {o.data.dropoff.address}</span><Badge tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS[o.data.status]}</Badge></li>)}</ul>}
        </Card>
      </div>
    </Modal>
  );
}
