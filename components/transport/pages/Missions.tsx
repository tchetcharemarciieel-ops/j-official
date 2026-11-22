"use client";

import { Camera, CheckCircle2, MapPin, Navigation, Phone, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ORDER_STATUS, courierStats, dueOf, orderLate, type Courier, type Doc, type Order } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Field, Modal, STATUS_TONE, Tabs, fmtDT, mapsUrl, usePhoto } from "../ui";

/** Application du livreur (téléphone) : mes missions, gros boutons, preuve de livraison, historique, position partagée avec accord. */
export function Missions() {
  const c = useCtx();
  const me = c.me as Doc<Courier> | null;
  const [tab, setTab] = useState<"now" | "history">("now");
  const [deliver, setDeliver] = useState<Doc<Order> | null>(null);
  const [fail, setFail] = useState<Doc<Order> | null>(null);
  const orders = (c.data.order as Doc<Order>[]).filter((o) => o.data.courier_id === me?.id);
  const active = useMemo(() => orders.filter((o) => ["affecte", "recupere", "en_cours", "arrive"].includes(o.data.status)).sort((a, b) => (a.data.eta ?? "").localeCompare(b.data.eta ?? "")), [orders]);
  const past = useMemo(() => orders.filter((o) => !["affecte", "recupere", "en_cours", "arrive"].includes(o.data.status)).sort((a, b) => b.data.at.localeCompare(a.data.at)), [orders]);
  const stats = me ? courierStats(c.data.order as Doc<Order>[], me.id) : null;

  // Partage de position : seulement si activé par le livreur, tant que cette page est ouverte, toutes les 30 s au plus.
  const last = useRef(0);
  useEffect(() => {
    if (!me?.data.sharing || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((p) => {
      if (Date.now() - last.current < 30_000) return;
      last.current = Date.now();
      void c.op("courier.locate", { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 15_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [me?.data.sharing]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleShare = async () => {
    if (!me) return;
    if (!me.data.sharing) {
      if (!navigator.geolocation) return c.notify("error", "Ce téléphone ne permet pas la géolocalisation.");
      if (!window.confirm("Partager ma position avec mon responsable tant que cette application est ouverte ? Vous pouvez l'arrêter à tout moment.")) return;
    }
    await c.run("courier.sharing", { on: !me.data.sharing });
  };
  if (!me) return <Empty icon={TriangleAlert} title="Compte non relié à un livreur" text="Demandez à votre responsable de relier votre compte à votre profil de livreur." />;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-lg font-bold">Bonjour {me.data.name.split(" ")[0]}</p><p className="text-sm text-slate-500">{active.length} mission(s) en cours · {stats?.done ?? 0} livrée(s) au total</p></div>
          <button onClick={() => c.run("courier.availability", { available: !me.data.available })} className={`min-h-12 rounded-2xl px-4 text-sm font-semibold ${me.data.available ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`} aria-pressed={me.data.available}>{me.data.available ? "Disponible" : "Indisponible"}</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={me.data.sharing} onChange={() => void toggleShare()} /> Partager ma position (avec mon accord){me.data.sharing && me.data.pos ? <span className="text-xs text-slate-500"> · envoyée {fmtDT(me.data.pos.at)}</span> : null}</label>
      </Card>
      <Tabs value={tab} onChange={setTab} items={[["now", `Missions (${active.length})`], ["history", "Historique"]]} />
      {tab === "now" ? (active.length === 0 ? <Empty icon={CheckCircle2} title="Aucune mission en cours" text="Les nouvelles missions apparaîtront ici (et dans vos notifications)." /> : active.map((o) => <MissionCard key={o.id} o={o} onDeliver={() => setDeliver(o)} onFail={() => setFail(o)} />)) : (
        past.length === 0 ? <Empty icon={CheckCircle2} title="Aucune mission terminée" /> : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{past.map((o) => <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1"><b>{o.data.number}</b> · {o.data.recipient.name}<span className="block truncate text-xs text-slate-500">{o.data.dropoff.address} · {fmtDT(o.data.delivered_at ?? o.data.at)}</span></span><Badge tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS[o.data.status]}</Badge></li>)}</ul>
        )
      )}
      {deliver && <DeliverModal o={deliver} onClose={() => setDeliver(null)} />}
      {fail && <FailModal o={fail} onClose={() => setFail(null)} />}
    </div>
  );
}

const Big = ({ children, onClick, tone = "brand" }: { children: React.ReactNode; onClick: () => void; tone?: "brand" | "green" | "red" | "ghost" }) => (
  <button onClick={onClick} className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold active:scale-[0.99] ${tone === "brand" ? "bg-[var(--brand)] text-white" : tone === "green" ? "bg-emerald-600 text-white" : tone === "red" ? "bg-red-600 text-white" : "border border-slate-300 bg-white text-slate-800"}`}>{children}</button>
);

function MissionCard({ o, onDeliver, onFail }: { o: Doc<Order>; onDeliver: () => void; onFail: () => void }) {
  const c = useCtx();
  const d = o.data;
  const step = (status: "recupere" | "en_cours" | "arrive") => c.run("order.step", { id: o.id, status });
  const target = d.status === "affecte" || d.status === "recupere" ? d.pickup.address : d.dropoff.address;
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2"><div><p className="text-base font-bold">{d.number}</p><p className="text-xs text-slate-500">Prévue {fmtDT(d.eta)}{orderLate(d) ? " · en retard" : ""}</p></div><Badge tone={STATUS_TONE[d.status]}>{ORDER_STATUS[d.status]}</Badge></div>
      <div className="grid gap-2 text-sm">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">1 · Récupération — {d.sender.name}</p><a className="font-medium text-[var(--brand)] underline" href={mapsUrl(d.pickup.address)} target="_blank" rel="noreferrer">{d.pickup.address}</a><a className="mt-1 flex items-center gap-1 text-slate-700" href={`tel:${d.sender.phone}`}><Phone className="h-4 w-4" />{d.sender.phone}</a></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">2 · Livraison — {d.recipient.name}</p><a className="font-medium text-[var(--brand)] underline" href={mapsUrl(d.dropoff.address)} target="_blank" rel="noreferrer">{d.dropoff.address}</a><a className="mt-1 flex items-center gap-1 text-slate-700" href={`tel:${d.recipient.phone}`}><Phone className="h-4 w-4" />{d.recipient.phone}</a></div>
      </div>
      <p className="text-sm"><b>Colis :</b> {d.parcel.desc}{d.parcel.weight_kg ? ` · ${d.parcel.weight_kg} kg` : ""}{d.instructions && <><br /><b>Consigne :</b> {d.instructions}</>}</p>
      {d.parcel.photo_ids[0] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.fileUrl(d.parcel.photo_ids[0]) ?? ""} alt="Photo du colis" className="h-28 rounded-xl object-cover" />}
      {dueOf(d) > 0 && ["livraison", "especes"].includes(d.pay_mode) && <p className="rounded-xl bg-amber-50 p-2 text-sm font-medium text-amber-900">À encaisser à la livraison : {c.fmt(dueOf(d))}</p>}
      <a className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 text-sm font-semibold" href={mapsUrl(target)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Itinéraire vers {d.status === "affecte" || d.status === "recupere" ? "la récupération" : "la livraison"}</a>
      {d.status === "affecte" && (
        <div className="space-y-2">
          {!d.accepted && <Big tone="green" onClick={() => void c.run("order.accept", { id: o.id })}><CheckCircle2 className="h-5 w-5" /> Accepter la mission</Big>}
          <Big onClick={() => void step("recupere")}><MapPin className="h-5 w-5" /> J&apos;ai récupéré le colis</Big>
          <Big tone="ghost" onClick={async () => { const note = window.prompt("Quel est le problème ? (adresse introuvable, colis absent, panne…)"); if (note?.trim()) await c.run("order.problem", { id: o.id, note }); }}><TriangleAlert className="h-5 w-5" /> Signaler un problème</Big>
        </div>
      )}
      {d.status === "recupere" && <div className="space-y-2"><Big onClick={() => void step("en_cours")}><Navigation className="h-5 w-5" /> Je pars en livraison</Big><Big tone="red" onClick={onFail}><XCircle className="h-5 w-5" /> Échec de livraison</Big></div>}
      {(d.status === "en_cours" || d.status === "arrive") && (
        <div className="space-y-2">
          {d.status === "en_cours" && <Big tone="ghost" onClick={() => void step("arrive")}><MapPin className="h-5 w-5" /> Je suis arrivé</Big>}
          <Big tone="green" onClick={onDeliver}><CheckCircle2 className="h-5 w-5" /> Confirmer la livraison</Big>
          <Big tone="red" onClick={onFail}><XCircle className="h-5 w-5" /> Échec de livraison</Big>
        </div>
      )}
    </section>
  );
}

function DeliverModal({ o, onClose }: { o: Doc<Order>; onClose: () => void }) {
  const c = useCtx();
  const { add, busy } = usePhoto();
  const file = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const due = dueOf(o.data);
  const [collect, setCollect] = useState(due > 0 && ["livraison", "especes"].includes(o.data.pay_mode));
  return (
    <Modal title={`Livraison ${o.data.number}`} onClose={onClose} footer={<button className="btn btn-primary min-h-12 w-full text-base" disabled={busy || (!photo && !note.trim())} onClick={async () => (await c.run("order.deliver", { id: o.id, proof_photo_id: photo, note, collect })) && onClose()}>Confirmer la livraison</button>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Ajoutez une photo de preuve ou un commentaire (nom de la personne qui a reçu le colis…).</p>
        <button type="button" className="btn btn-ghost min-h-12 w-full" disabled={busy} onClick={() => file.current?.click()}><Camera className="h-5 w-5" /> {photo ? "Changer la photo" : busy ? "Envoi…" : "Prendre une photo"}</button>
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const id = await add(e.target.files?.[0]); if (id) setPhoto(id); e.target.value = ""; }} />
        {photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.fileUrl(photo) ?? ""} alt="Preuve" className="h-32 rounded-xl object-cover" />}
        <Field label="Commentaire"><textarea className="input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reçu par M. Paul, remis en main propre" /></Field>
        {due > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={collect} onChange={(e) => setCollect(e.target.checked)} /> J&apos;ai encaissé {c.fmt(due)} en espèces</label>}
      </div>
    </Modal>
  );
}

function FailModal({ o, onClose }: { o: Doc<Order>; onClose: () => void }) {
  const c = useCtx();
  const { add, busy } = usePhoto();
  const file = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <Modal title={`Échec — ${o.data.number}`} onClose={onClose} footer={<button className="btn min-h-12 w-full bg-red-600 text-base text-white" disabled={busy || reason.trim().length < 3} onClick={async () => (await c.run("order.fail", { id: o.id, reason, proof_photo_id: photo })) && onClose()}>Déclarer l&apos;échec</button>}>
      <div className="space-y-3">
        <Field label="Motif *"><textarea className="input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Destinataire absent, adresse introuvable, colis refusé…" autoFocus /></Field>
        <button type="button" className="btn btn-ghost min-h-12 w-full" disabled={busy} onClick={() => file.current?.click()}><Camera className="h-5 w-5" /> {photo ? "Photo ajoutée ✓" : "Ajouter une photo (facultatif)"}</button>
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const id = await add(e.target.files?.[0]); if (id) setPhoto(id); e.target.value = ""; }} />
      </div>
    </Modal>
  );
}
