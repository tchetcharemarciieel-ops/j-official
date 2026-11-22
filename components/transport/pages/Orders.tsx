"use client";

import { AlertTriangle, Camera, Copy, Download, FileText, MapPin, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ORDER_STATUS, PAY_METHODS, PAY_STATUS, TRANSITIONS, URGENCY, VEHICLE_KINDS, dueOf, orderLate, paidOf, type Courier, type Doc, type Order, type OrderStatus, type PayMethod, type PriceResult, type Urgency, type VehicleKind } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, Pager, Pick, SearchBox, STATUS_TONE, downloadText, fmtDT, mapsUrl, paginate, toCsv, uid, usePhoto, waUrl } from "../ui";

/** Commandes et colis : enregistrement, prix avant validation, affectation, suivi, paiements, historique. */
export function Orders() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [courier, setCourier] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Order> | "new" | null>(null);
  const [view, setView] = useState<string | null>(c.focus);
  const orders = c.data.order as Doc<Order>[];
  const canEdit = c.may("livraisons");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return orders
      .filter((o) => (!status || (status === "late" ? orderLate(o.data) : o.data.status === status)) && (!courier || o.data.courier_id === courier) && (!n || [o.data.number, o.data.tracking, o.data.sender.name, o.data.recipient.name, o.data.sender.phone, o.data.recipient.phone, o.data.dropoff.address, o.data.pickup.address].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => b.data.at.localeCompare(a.data.at));
  }, [orders, q, status, courier]);
  const pg = paginate(rows, page, 25);
  const sel = orders.find((o) => o.id === view);
  const couriers = c.data.courier as Doc<Courier>[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="N°, suivi, nom, téléphone, adresse…" /></div>
        <select className="input !w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Statut"><option value="">Tous les statuts</option><option value="late">⚠ En retard</option>{Object.entries(ORDER_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {couriers.length > 0 && <select className="input !w-auto" value={courier} onChange={(e) => (setCourier(e.target.value), setPage(1))} aria-label="Livreur"><option value="">Tous les livreurs</option>{couriers.map((x) => <option key={x.id} value={x.id}>{x.data.name}</option>)}</select>}
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Commande</button>}
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText("commandes.csv", toCsv([["numero", "suivi", "statut", "date", "expediteur", "destinataire", "enlevement", "livraison", "livreur", "prix", "paye"], ...rows.map((o) => [o.data.number, o.data.tracking, ORDER_STATUS[o.data.status], o.data.at.slice(0, 10), o.data.sender.name, o.data.recipient.name, o.data.pickup.address, o.data.dropoff.address, c.courierName(o.data.courier_id), String(o.data.price), String(paidOf(o.data))])]))}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? <Empty icon={FileText} title={q || status || courier ? "Aucune commande trouvée" : "Aucune commande"} text={!q && !status ? "Enregistrez votre première commande : un numéro de suivi unique est créé." : undefined} action={canEdit && !q && !status ? <button className="btn btn-primary" onClick={() => setEdit("new")}>Nouvelle commande</button> : undefined} /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {pg.rows.map((o) => (
            <li key={o.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(o.id)}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium"><span>{o.data.number}</span>{orderLate(o.data) && <AlertTriangle className="h-4 w-4 text-red-500" aria-label="En retard" />}</span>
                <span className="block truncate text-xs text-slate-500">{o.data.sender.name} → {o.data.recipient.name} · {o.data.dropoff.address}</span>
                <span className="block text-xs text-slate-400">{fmtDT(o.data.at)} · {c.courierName(o.data.courier_id)}</span>
              </span>
              <span className="flex flex-col items-end gap-1"><Badge tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS[o.data.status]}</Badge><span className="text-xs font-semibold">{c.fmt(o.data.price)}</span></span>
            </button></li>
          ))}
        </ul>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {edit && <OrderForm order={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <OrderView o={sel} canEdit={canEdit} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function OrderForm({ order, onClose }: { order: Doc<Order> | null; onClose: () => void }) {
  const c = useCtx();
  const d = order?.data;
  const t = c.settings.tariff;
  const { add, busy } = usePhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    sn: d?.sender.name ?? "", sp: d?.sender.phone ?? "", rn: d?.recipient.name ?? "", rp: d?.recipient.phone ?? "",
    pa: d?.pickup.address ?? "", pla: d?.pickup.lat != null ? String(d.pickup.lat) : "", plo: d?.pickup.lng != null ? String(d.pickup.lng) : "",
    da: d?.dropoff.address ?? "", dla: d?.dropoff.lat != null ? String(d.dropoff.lat) : "", dlo: d?.dropoff.lng != null ? String(d.dropoff.lng) : "",
    desc: d?.parcel.desc ?? "", weight: d?.parcel.weight_kg != null ? String(d.parcel.weight_kg) : "", dims: d?.parcel.dims ?? "", ptype: d?.parcel.type ?? t.parcel_types[0]?.name ?? "",
    photos: d?.parcel.photo_ids ?? ([] as string[]), zone: d?.zone ?? "", urgency: (d?.urgency ?? "normal") as Urgency, vehicle: (d?.vehicle_kind ?? "moto") as VehicleKind,
    km: d?.distance_km != null ? String(d.distance_km) : "", instructions: d?.instructions ?? "", pay: (d?.pay_mode ?? "livraison") as PayMethod, manual: false, price: d ? String(d.price) : "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const [quote, setQuote] = useState<(PriceResult & { distance_km: number | null }) | null>(null);
  const [qErr, setQErr] = useState("");
  useEffect(() => {
    const h = setTimeout(async () => {
      try {
        const r = await c.op("order.quote", { zone: f.zone, urgency: f.urgency, vehicle_kind: f.vehicle, distance_km: num(f.km), parcel: { weight_kg: num(f.weight), type: f.ptype }, pickup: { lat: num(f.pla), lng: num(f.plo) }, dropoff: { lat: num(f.dla), lng: num(f.dlo) } });
        setQuote(r.data as never); setQErr("");
      } catch (e) { setQuote(null); setQErr(e instanceof Error ? e.message : ""); }
    }, 350);
    return () => clearTimeout(h);
  }, [f.zone, f.urgency, f.vehicle, f.km, f.weight, f.ptype, f.pla, f.plo, f.dla, f.dlo]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = (k: "p" | "d") => navigator.geolocation?.getCurrentPosition((p) => (k === "p" ? setF((x) => ({ ...x, pla: String(p.coords.latitude.toFixed(5)), plo: String(p.coords.longitude.toFixed(5)) })) : setF((x) => ({ ...x, dla: String(p.coords.latitude.toFixed(5)), dlo: String(p.coords.longitude.toFixed(5)) }))), () => c.notify("error", "Position refusée ou indisponible."));
  const ok = f.sn.trim() && f.sp.trim().length >= 6 && f.rn.trim() && f.rp.trim().length >= 6 && f.pa.trim() && f.da.trim() && f.desc.trim();
  const save = async () => {
    const r = await c.run("order.save", { id: order?.id, sender: { name: f.sn, phone: f.sp }, recipient: { name: f.rn, phone: f.rp }, pickup: { address: f.pa, lat: num(f.pla), lng: num(f.plo) }, dropoff: { address: f.da, lat: num(f.dla), lng: num(f.dlo) }, parcel: { desc: f.desc, weight_kg: num(f.weight), dims: f.dims, type: f.ptype, photo_ids: f.photos }, zone: f.zone, urgency: f.urgency, vehicle_kind: f.vehicle, distance_km: num(f.km), instructions: f.instructions, pay_mode: f.pay, price: f.manual ? num(f.price) ?? "" : "" });
    if (r) onClose();
  };
  return (
    <Modal wide title={order ? `Modifier ${d!.number}` : "Nouvelle commande"} onClose={onClose} footer={<button className="btn btn-primary" disabled={!ok} onClick={save}>{order ? "Enregistrer" : "Créer la commande"}</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Expéditeur *"><input className="input" value={f.sn} maxLength={120} onChange={(e) => set("sn", e.target.value)} autoFocus /></Field>
        <Field label="Téléphone expéditeur *"><input className="input" inputMode="tel" value={f.sp} maxLength={30} onChange={(e) => set("sp", e.target.value)} /></Field>
        <Field label="Destinataire *"><input className="input" value={f.rn} maxLength={120} onChange={(e) => set("rn", e.target.value)} /></Field>
        <Field label="Téléphone destinataire *"><input className="input" inputMode="tel" value={f.rp} maxLength={30} onChange={(e) => set("rp", e.target.value)} /></Field>
        <div><Field label="Adresse de récupération *"><input className="input" value={f.pa} maxLength={240} onChange={(e) => set("pa", e.target.value)} /></Field><button type="button" className="mt-1 text-xs text-[var(--brand)] underline" onClick={() => here("p")}><MapPin className="mr-1 inline h-3 w-3" />Utiliser ma position{f.pla ? ` (${f.pla}, ${f.plo})` : ""}</button></div>
        <div><Field label="Adresse de livraison *"><input className="input" value={f.da} maxLength={240} onChange={(e) => set("da", e.target.value)} /></Field><button type="button" className="mt-1 text-xs text-[var(--brand)] underline" onClick={() => here("d")}><MapPin className="mr-1 inline h-3 w-3" />Utiliser ma position{f.dla ? ` (${f.dla}, ${f.dlo})` : ""}</button></div>
        <Field label="Description du colis *" className="sm:col-span-2"><input className="input" value={f.desc} maxLength={400} onChange={(e) => set("desc", e.target.value)} placeholder="Carton de vêtements, documents…" /></Field>
        <Field label="Poids (kg)"><input className="input" inputMode="decimal" value={f.weight} onChange={(e) => set("weight", e.target.value)} /></Field>
        <Field label="Dimensions"><input className="input" value={f.dims} maxLength={60} onChange={(e) => set("dims", e.target.value)} placeholder="40×30×20 cm" /></Field>
        <Field label="Type de colis">{t.parcel_types.length ? <select className="input" value={f.ptype} onChange={(e) => set("ptype", e.target.value)}>{t.parcel_types.map((p) => <option key={p.name}>{p.name}</option>)}</select> : <input className="input" value={f.ptype} maxLength={60} onChange={(e) => set("ptype", e.target.value)} />}</Field>
        <Field label="Zone">{t.zones.length ? <select className="input" value={f.zone} onChange={(e) => set("zone", e.target.value)}><option value="">—</option>{t.zones.map((z) => <option key={z.name}>{z.name}</option>)}</select> : <input className="input" value={f.zone} maxLength={60} onChange={(e) => set("zone", e.target.value)} />}</Field>
        <Field label="Urgence"><select className="input" value={f.urgency} onChange={(e) => set("urgency", e.target.value as Urgency)}>{Object.entries(URGENCY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Véhicule"><select className="input" value={f.vehicle} onChange={(e) => set("vehicle", e.target.value as VehicleKind)}>{Object.entries(VEHICLE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Distance (km)" hint="Calculée à vol d'oiseau si les deux positions sont renseignées."><input className="input" inputMode="decimal" value={f.km} onChange={(e) => set("km", e.target.value)} placeholder={quote?.distance_km ? String(quote.distance_km) : ""} /></Field>
        <Field label="Paiement"><select className="input" value={f.pay} onChange={(e) => set("pay", e.target.value as PayMethod)}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Instructions particulières" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={600} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Fragile, appeler avant d'arriver…" /></Field>
        <div className="sm:col-span-2">
          <span className="label">Photos du colis</span>
          <div className="flex flex-wrap items-center gap-2">
            {f.photos.map((p) => (
              <span key={p} className="relative">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.fileUrl(p) ?? ""} alt="Photo du colis" className="h-16 w-16 rounded-lg object-cover" /><button type="button" className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow" aria-label="Retirer la photo" onClick={() => set("photos", f.photos.filter((x) => x !== p))}><Trash2 className="h-3 w-3 text-red-600" /></button></span>
            ))}
            {f.photos.length < 4 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {busy ? "Envoi…" : "Ajouter une photo"}</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const id = await add(e.target.files?.[0]); if (id) set("photos", [...f.photos, id]); e.target.value = ""; }} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p className="text-sm font-semibold">Prix de la livraison</p>
          {qErr && <p className="text-sm text-red-600">{qErr}</p>}
          {quote && !f.manual && (quote.configured ? (
            <div className="mt-1 text-sm"><p className="text-xl font-bold">{c.fmt(quote.total)}</p>{quote.lines.length > 0 && <ul className="text-xs text-slate-600">{quote.lines.map((l, i) => <li key={i}>{l.label}{l.amount ? ` : ${c.fmt(l.amount)}` : ""}</li>)}</ul>}</div>
          ) : <p className="mt-1 text-sm text-amber-800">Aucun tarif n&apos;est défini (Réglages) : saisissez le prix à la main.</p>)}
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.manual} onChange={(e) => set("manual", e.target.checked)} /> Fixer le prix manuellement</label>
          {f.manual && <input className="input mt-2" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="Prix" aria-label="Prix manuel" />}
          {order && !f.manual && <p className="mt-1 text-xs text-slate-500">Prix actuel enregistré : {c.fmt(d!.price)}. L&apos;enregistrement le recalcule avec les tarifs.</p>}
        </div>
      </div>
    </Modal>
  );
}

function OrderView({ o, canEdit, onClose, onEdit }: { o: Doc<Order>; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const d = o.data;
  const couriers = (c.data.courier as Doc<Courier>[]).filter((x) => x.data.status === "actif");
  const [cid, setCid] = useState(d.courier_id ?? "");
  const [pay, setPay] = useState({ amount: String(dueOf(d) || ""), method: "especes" as PayMethod, ref: "", verified: false });
  const canPay = c.may(["finances", "livraisons"]) && d.status !== "annule";
  const trackUrl = typeof window !== "undefined" ? `${window.location.origin}/livraison/${c.s.slug}/suivi?n=${d.tracking}` : "";
  const msg = `Bonjour, votre colis ${d.number} (${ORDER_STATUS[d.status]}) : suivez-le ici ${trackUrl}`;
  const next = TRANSITIONS[d.status].filter((s) => s !== "affecte");
  const assign = async (force = false) => {
    try { const r = await c.op("order.assign", { id: o.id, courier_id: cid || null, force }); c.notify("success", r.message); }
    catch (e) { const m = e instanceof Error ? e.message : ""; if (/indisponible/.test(m) && window.confirm(`${m}`)) await assign(true); else c.notify("error", m || "Action impossible."); }
  };
  const toStatus = async (s: OrderStatus) => {
    let note = "";
    if (s === "echec" || s === "annule") { note = window.prompt(s === "echec" ? "Motif de l'échec ?" : "Motif de l'annulation ?") ?? ""; if (!note.trim()) return; }
    await c.run("order.status", { id: o.id, status: s, note });
  };
  return (
    <Modal wide title={`${d.number}`} onClose={onClose} footer={
      <>
        <a className="btn btn-ghost" href={c.docUrl("invoice", o.id)} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Facture PDF</a>
        {canEdit && !["livre", "annule", "retour"].includes(d.status) && <button className="btn btn-ghost" onClick={onEdit}>Modifier</button>}
        {c.s.can.manager && ["nouvelle", "annule"].includes(d.status) && !d.payments.some((p) => p.status === "confirme") && <DeleteButton confirmText="Supprimer cette commande ?" onConfirm={async () => (await c.run("order.delete", { id: o.id })) && onClose()} />}
      </>
    }>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[d.status]}>{ORDER_STATUS[d.status]}</Badge>{orderLate(d) && <Badge tone="red">En retard</Badge>}<span className="text-slate-500">Suivi <b className="font-mono">{d.tracking}</b></span><button className="text-slate-400 hover:text-slate-700" aria-label="Copier le lien de suivi" onClick={() => navigator.clipboard?.writeText(trackUrl).then(() => c.notify("success", "Lien de suivi copié."))}><Copy className="h-4 w-4" /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Expéditeur</p><p className="font-medium">{d.sender.name}</p><a className="inline-flex items-center gap-1 text-[var(--brand)]" href={`tel:${d.sender.phone}`}><Phone className="h-3 w-3" />{d.sender.phone}</a><p className="mt-1 text-xs text-slate-500">Récupération</p><a className="text-[var(--brand)] underline" href={mapsUrl(d.pickup.address)} target="_blank" rel="noreferrer">{d.pickup.address}</a></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Destinataire</p><p className="font-medium">{d.recipient.name}</p><a className="inline-flex items-center gap-1 text-[var(--brand)]" href={`tel:${d.recipient.phone}`}><Phone className="h-3 w-3" />{d.recipient.phone}</a><p className="mt-1 text-xs text-slate-500">Livraison</p><a className="text-[var(--brand)] underline" href={mapsUrl(d.dropoff.address)} target="_blank" rel="noreferrer">{d.dropoff.address}</a></div>
        </div>
        <p><b>Colis :</b> {d.parcel.desc}{d.parcel.weight_kg ? ` · ${d.parcel.weight_kg} kg` : ""}{d.parcel.dims ? ` · ${d.parcel.dims}` : ""}{d.parcel.type ? ` · ${d.parcel.type}` : ""}<br /><span className="text-slate-500">Zone {d.zone || "—"} · {URGENCY[d.urgency]} · {VEHICLE_KINDS[d.vehicle_kind]}{d.distance_km ? ` · ${d.distance_km} km` : ""} · prévue {fmtDT(d.eta)}</span>{d.instructions && <><br /><b>Instructions :</b> {d.instructions}</>}</p>
        {(d.parcel.photo_ids.length > 0 || d.proof?.photo_id) && <div className="flex flex-wrap gap-2">{d.parcel.photo_ids.map((p) => <a key={p} href={c.fileUrl(p) ?? "#"} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.fileUrl(p) ?? ""} alt="Photo du colis" className="h-20 w-20 rounded-lg object-cover" /></a>)}{d.proof?.photo_id && <a href={c.fileUrl(d.proof.photo_id) ?? "#"} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.fileUrl(d.proof.photo_id) ?? ""} alt="Preuve de livraison" className="h-20 w-20 rounded-lg object-cover ring-2 ring-emerald-500" /></a>}</div>}
        {d.proof?.note && <p className="rounded-lg bg-emerald-50 p-2 text-emerald-900">Preuve de livraison : {d.proof.note}</p>}
        {d.fail_reason && d.status === "echec" && <p className="rounded-lg bg-red-50 p-2 text-red-800">Échec : {d.fail_reason}</p>}
        {d.problem && d.status === "attente" && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">Problème signalé par le livreur : {d.problem.note}</p>}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-1 font-semibold">Prix : {c.fmt(d.price)}</p>
          {d.price_lines.length > 0 && <ul className="text-xs text-slate-600">{d.price_lines.map((l, i) => <li key={i}>{l.label}{l.amount ? ` : ${c.fmt(l.amount)}` : ""}</li>)}</ul>}
        </div>
        {canEdit && !["livre", "annule", "retour"].includes(d.status) && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 font-semibold">Affectation et statut</p>
            <div className="flex flex-wrap gap-2">
              <select className="input !w-auto flex-1" value={cid} onChange={(e) => setCid(e.target.value)} aria-label="Livreur"><option value="">— Aucun livreur —</option>{couriers.map((x) => <option key={x.id} value={x.id}>{x.data.name}{x.data.available ? "" : " (indisponible)"}</option>)}</select>
              <button className="btn btn-primary" disabled={(cid || "") === (d.courier_id ?? "")} onClick={() => void assign()}>{cid ? "Affecter" : "Retirer"}</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{next.map((s) => <button key={s} className="btn btn-ghost !py-1.5 text-xs" onClick={() => void toStatus(s)}>→ {ORDER_STATUS[s]}</button>)}</div>
          </div>
        )}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-1 font-semibold">Paiements — payé {c.fmt(paidOf(d))} · reste {c.fmt(dueOf(d))}</p>
          <p className="mb-2 text-xs text-slate-500">Mode prévu : {PAY_METHODS[d.pay_mode]}. Un paiement mobile ou en ligne n&apos;est confirmé qu&apos;avec un numéro de transaction vérifié chez le fournisseur (aucun fournisseur n&apos;est connecté automatiquement).</p>
          {d.payments.length === 0 ? <p className="text-slate-500">Aucun paiement enregistré.</p> : <ul className="divide-y divide-slate-100">{d.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5"><span className="flex-1">{PAY_METHODS[p.method]} · <b>{c.fmt(p.amount)}</b>{p.ref ? ` · ${p.ref}` : ""} <Badge tone={p.status === "confirme" ? "green" : p.status === "echoue" ? "red" : "amber"}>{PAY_STATUS[p.status]}</Badge></span>
              {p.status === "en_attente" && canPay && <button className="text-xs text-emerald-700 underline" onClick={async () => { let ref = p.ref, verified = false; if (p.method === "mobile_money" || p.method === "en_ligne") { ref = window.prompt("Numéro de transaction (vérifié chez le fournisseur) ?", p.ref) ?? ""; if (!ref.trim()) return; verified = true; } await c.run("order.payment_confirm", { id: o.id, pid: p.id, ref, verified }); }}>Confirmer</button>}
              {c.s.can.manager && <button className="text-xs text-red-600 underline" onClick={async () => { const reason = window.prompt("Motif de l'annulation du paiement ?"); if (reason?.trim()) await c.run("order.payment_cancel", { id: o.id, pid: p.id, reason }); }}>Annuler</button>}</li>))}</ul>}
          {canPay && dueOf(d) > 0 && (
            <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-4">
              <Field label="Montant"><input className="input" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Mode"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PayMethod })}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="N° de transaction"><input className="input" value={pay.ref} maxLength={80} onChange={(e) => setPay({ ...pay, ref: e.target.value })} /></Field>
              {(pay.method === "mobile_money" || pay.method === "en_ligne") && <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={pay.verified} onChange={(e) => setPay({ ...pay, verified: e.target.checked })} /> Vérifié chez le fournisseur</label>}
              <button className="btn btn-primary sm:col-span-4" disabled={!(Number(pay.amount) > 0)} onClick={async () => { if (await c.run("order.payment", { id: o.id, pid: uid(), amount: Number(pay.amount.replace(",", ".")), method: pay.method, ref: pay.ref, verified: pay.verified })) setPay({ ...pay, amount: "", ref: "", verified: false }); }}>Enregistrer le paiement</button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost !py-1.5 text-xs" href={waUrl(d.recipient.phone, msg)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp destinataire</a>
          <a className="btn btn-ghost !py-1.5 text-xs" href={waUrl(d.sender.phone, msg)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp expéditeur</a>
          <a className="btn btn-ghost !py-1.5 text-xs" href={`sms:${d.recipient.phone}?body=${encodeURIComponent(msg)}`}>SMS</a>
        </div>
        <p className="text-xs text-slate-500">Ces boutons ouvrent votre application WhatsApp / SMS avec le message prêt : rien n&apos;est envoyé automatiquement (aucun service d&apos;envoi n&apos;est connecté).</p>
        <div><p className="mb-1 font-semibold">Historique</p><ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs">{[...d.history].reverse().map((h, i) => <li key={i}><b>{ORDER_STATUS[h.to]}</b> · {fmtDT(h.at)} · {c.memberName(h.by)}{h.note ? ` — ${h.note}` : ""}</li>)}</ol></div>
      </div>
    </Modal>
  );
}
