"use client";

import { Copy, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { CURRENCIES, TRANSPORT_TYPES, TRANSPORT_TYPE_IDS, URGENCY, VEHICLE_KINDS, type CurrencyCode, type Tariff, type TransportType } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Card, Field, readLogo } from "../ui";

/** Réglages : identité, devise, tarifs (distance, zone, colis, poids, véhicule, urgence), délais, page publique, paiements proposés. */
export function SettingsPage() {
  const c = useCtx();
  const s = c.settings;
  const [f, setF] = useState({ name: s.name, transport_type: s.transport_type as TransportType, address: s.address, phone: s.phone, email: s.email, couriers_count: String(s.couriers_count), vehicles_count: String(s.vehicles_count), currency: s.currency as CurrencyCode, primary: s.primary, commission_rate: String(s.commission_rate), invoice_note: s.invoice_note, goods: s.goods.join(", ") });
  const [t, setT] = useState<Tariff>(() => structuredClone(s.tariff));
  const [hours, setHours] = useState({ ...s.hours });
  const [tracking, setTracking] = useState({ ...s.tracking });
  const [online, setOnline] = useState({ ...s.online });
  const [logo, setLogo] = useState<{ mime: string; data: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (!c.s.can.settings) return <Card title="Réglages">Seuls le propriétaire et les administrateurs peuvent modifier la configuration.</Card>;
  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  const save = async () => {
    await c.run("settings.save", { ...f, couriers_count: n(f.couriers_count), vehicles_count: n(f.vehicles_count), commission_rate: n(f.commission_rate), goods: f.goods.split(",").map((x) => x.trim()).filter(Boolean), logo_id: s.logo_id, logo, tariff: t, hours, tracking, online });
    setLogo(null);
  };
  const logoSrc = logo ? `data:${logo.mime};base64,${logo.data}` : c.fileUrl(s.logo_id);
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/livraison/${c.s.slug}` : "";
  const num = (label: string, v: number, on: (x: number) => void, hint?: string) => <Field label={label} hint={hint}><input className="input" inputMode="decimal" value={String(v)} onChange={(e) => on(n(e.target.value))} /></Field>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="Votre entreprise">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'entreprise" className="sm:col-span-2"><input className="input" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type de transport"><select className="input" value={f.transport_type} onChange={(e) => setF({ ...f, transport_type: e.target.value as TransportType })}>{TRANSPORT_TYPE_IDS.map((k) => <option key={k} value={k}>{TRANSPORT_TYPES[k].icon} {TRANSPORT_TYPES[k].label}</option>)}</select></Field>
          <Field label="Devise"><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as CurrencyCode })}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}</select></Field>
          <Field label="Adresse" className="sm:col-span-2"><input className="input" value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} maxLength={120} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Nombre de livreurs"><input className="input" inputMode="numeric" value={f.couriers_count} onChange={(e) => setF({ ...f, couriers_count: e.target.value })} /></Field>
          <Field label="Nombre de véhicules"><input className="input" inputMode="numeric" value={f.vehicles_count} onChange={(e) => setF({ ...f, vehicles_count: e.target.value })} /></Field>
          <Field label="Marchandises transportées (séparées par des virgules)" className="sm:col-span-2"><input className="input" value={f.goods} onChange={(e) => setF({ ...f, goods: e.target.value })} placeholder="Colis, documents, alimentaire…" /></Field>
          <Field label="Couleur principale"><input className="input !p-1 h-10" type="color" value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} /></Field>
          <div><span className="label">Logo</span><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-slate-100">{logoSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoSrc} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-slate-400" />}</span><button type="button" className="btn btn-ghost" onClick={() => input.current?.click()}>Changer</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const r = await readLogo(file); if (r) setLogo(r); else c.notify("error", "Logo : PNG, JPEG ou WebP, 280 Ko maximum."); }} /></div></div>
          <Field label="Note sur les factures" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={300} value={f.invoice_note} onChange={(e) => setF({ ...f, invoice_note: e.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Tarifs" subtitle="Le prix est calculé avec ces valeurs, à l'enregistrement et sur la page publique. Tant qu'aucun tarif n'est défini, aucun prix automatique n'est proposé.">
        <div className="grid gap-3 sm:grid-cols-3">
          {num(`Prix de base (${s.currency})`, t.base, (x) => setT({ ...t, base: x }))}
          {num("Par kilomètre", t.per_km, (x) => setT({ ...t, per_km: x }))}
          {num("Par kg au-delà de…", t.per_kg, (x) => setT({ ...t, per_kg: x }))}
          {num("Poids inclus (kg)", t.free_kg, (x) => setT({ ...t, free_kg: x }))}
          {num("Prix minimum", t.min_price, (x) => setT({ ...t, min_price: x }))}
          {num("Commission livreur (%)", n(f.commission_rate), (x) => setF({ ...f, commission_rate: String(x) }), "Part du prix reversée au livreur (estimation).")}
        </div>
        <p className="mb-1 mt-4 text-sm font-semibold">Zones desservies</p>
        <div className="space-y-2">
          {t.zones.map((z, i) => (
            <div key={i} className="flex gap-2"><input className="input flex-1" value={z.name} maxLength={60} onChange={(e) => setT({ ...t, zones: t.zones.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} aria-label="Nom de la zone" /><input className="input !w-32" inputMode="decimal" value={String(z.fee)} onChange={(e) => setT({ ...t, zones: t.zones.map((x, k) => (k === i ? { ...x, fee: n(e.target.value) } : x)) })} aria-label="Supplément de zone" /><button className="text-slate-400 hover:text-red-600" aria-label="Retirer la zone" onClick={() => setT({ ...t, zones: t.zones.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button></div>
          ))}
          <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => setT({ ...t, zones: [...t.zones, { name: "", fee: 0 }] })}><Plus className="h-4 w-4" /> Ajouter une zone</button>
        </div>
        <p className="mb-1 mt-4 text-sm font-semibold">Types de colis (multiplicateur)</p>
        <div className="space-y-2">
          {t.parcel_types.map((z, i) => (
            <div key={i} className="flex gap-2"><input className="input flex-1" value={z.name} maxLength={60} onChange={(e) => setT({ ...t, parcel_types: t.parcel_types.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} aria-label="Type de colis" /><input className="input !w-24" inputMode="decimal" value={String(z.mult)} onChange={(e) => setT({ ...t, parcel_types: t.parcel_types.map((x, k) => (k === i ? { ...x, mult: n(e.target.value) } : x)) })} aria-label="Multiplicateur" /><button className="text-slate-400 hover:text-red-600" aria-label="Retirer le type" onClick={() => setT({ ...t, parcel_types: t.parcel_types.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button></div>
          ))}
          <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => setT({ ...t, parcel_types: [...t.parcel_types, { name: "", mult: 1 }] })}><Plus className="h-4 w-4" /> Ajouter un type</button>
        </div>
        <p className="mb-1 mt-4 text-sm font-semibold">Multiplicateur selon le véhicule</p>
        <div className="grid gap-3 sm:grid-cols-4">{(Object.keys(VEHICLE_KINDS) as (keyof typeof VEHICLE_KINDS)[]).map((k) => <div key={k}>{num(VEHICLE_KINDS[k], t.vehicle_mult[k], (x) => setT({ ...t, vehicle_mult: { ...t.vehicle_mult, [k]: x } }))}</div>)}</div>
        <p className="mb-1 mt-4 text-sm font-semibold">Urgence : multiplicateur et délai annoncé (heures)</p>
        <div className="grid gap-3 sm:grid-cols-3">{(Object.keys(URGENCY) as (keyof typeof URGENCY)[]).map((k) => <div key={k} className="grid grid-cols-2 gap-2">{num(`${URGENCY[k]} ×`, t.urgency_mult[k], (x) => setT({ ...t, urgency_mult: { ...t.urgency_mult, [k]: x } }))}{num("Délai (h)", hours[k], (x) => setHours({ ...hours, [k]: x }))}</div>)}</div>
      </Card>

      <Card title="Page publique de commande et de suivi" subtitle="Vos clients demandent une livraison, voient le prix avant d'envoyer et suivent leur colis.">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={online.open} onChange={(e) => setOnline({ ...online, open: e.target.checked })} /> Accepter les demandes de livraison en ligne</label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><code className="rounded bg-slate-100 px-2 py-1">{publicUrl}</code><button className="btn btn-ghost !py-1 text-xs" onClick={() => navigator.clipboard?.writeText(publicUrl).then(() => c.notify("success", "Lien copié."))}><Copy className="h-3.5 w-3.5" /> Copier</button></div>
        <p className="mt-1 text-xs text-slate-500">La page n&apos;est visible du public qu&apos;une fois votre logiciel publié (menu du projet). Aperçu avec les données de test : ajoutez <code>?test=1</code> en étant connecté.</p>
        <p className="mb-1 mt-3 text-sm font-semibold">Paiements proposés aux clients</p>
        <div className="grid gap-1 sm:grid-cols-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={online.pay_delivery} onChange={(e) => setOnline({ ...online, pay_delivery: e.target.checked })} /> À la livraison</label><label className="flex items-center gap-2"><input type="checkbox" checked={online.pay_cash} onChange={(e) => setOnline({ ...online, pay_cash: e.target.checked })} /> Espèces à l&apos;enlèvement</label><label className="flex items-center gap-2"><input type="checkbox" checked={online.pay_mobile} onChange={(e) => setOnline({ ...online, pay_mobile: e.target.checked })} /> Paiement mobile</label></div>
        {online.pay_mobile && <Field label="Instructions de paiement mobile (numéro, nom…)"><input className="input" value={online.mobile_money_info} maxLength={300} onChange={(e) => setOnline({ ...online, mobile_money_info: e.target.value })} /></Field>}
        <p className="mt-2 text-xs text-slate-500">Paiement en ligne automatique (ZingoPay, etc.) : non branché sur ce module dans cette version. Le paiement mobile est noté « en attente » et confirmé par vous avec le numéro de transaction.</p>
        <p className="mb-1 mt-3 text-sm font-semibold">Ce que le client voit au suivi</p>
        <div className="grid gap-1 text-sm sm:grid-cols-2"><label className="flex items-center gap-2"><input type="checkbox" checked={tracking.show_courier} onChange={(e) => setTracking({ ...tracking, show_courier: e.target.checked })} /> Prénom du livreur</label><label className="flex items-center gap-2"><input type="checkbox" checked={tracking.show_eta} onChange={(e) => setTracking({ ...tracking, show_eta: e.target.checked })} /> Date estimée de livraison</label></div>
      </Card>
      <Card title="Notifications externes (WhatsApp, SMS, e-mail)"><p className="text-sm text-slate-600">Les notifications internes fonctionnent (nouvelle commande, mission affectée, livraison, échec…). L&apos;envoi automatique par WhatsApp, SMS ou e-mail <b>n&apos;est pas connecté</b> : il demande un compte fournisseur (ex. WhatsApp Business API, passerelle SMS) et ses identifiants. En attendant, les boutons « WhatsApp / SMS » d&apos;une commande ouvrent votre application avec le message prêt à envoyer.</p></Card>
      <div className="sticky bottom-3 flex justify-end"><button className="btn btn-primary shadow-lg" disabled={!f.name.trim()} onClick={save}>Enregistrer la configuration</button></div>
    </div>
  );
}
