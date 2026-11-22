"use client";

import { Bike, Bot, Map as MapIcon, Package, Receipt, Truck, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";
import { CURRENCIES, TRANSPORT_TYPES, TRANSPORT_TYPE_IDS, type TransportType } from "@/lib/transport/model";

const FEATURES: [typeof Package, string][] = [
  [Package, "Commandes, colis, numéro de suivi unique"],
  [Truck, "Suivi public pour vos clients"],
  [Bike, "Application livreur sur téléphone"],
  [MapIcon, "Carte, véhicules, entretien"],
  [Receipt, "Tarifs automatiques et factures PDF"],
  [Wallet, "Recettes, dépenses, rapports"],
  [Package, "Page de commande pour vos clients"],
  [Bot, "Assistant MiniSoft AI"],
];

/** Présentation de MiniSoft Transport &amp; Delivery : configuration de l'agence (nom, type, secteur, effectifs, adresse, logo, devise) puis création. */
export function TransportPitch({ embedded = false, onCancel }: { embedded?: boolean; onCancel?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(embedded);
  const [f, setF] = useState({ name: "", transport_type: "livraison" as TransportType, address: "", phone: "", couriers_count: "1", vehicles_count: "1", zones: "", goods: "", currency: "XAF" });
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError("Logo : PNG, JPEG ou WebP.");
    if (file.size > 250_000) return setError("Logo trop lourd (250 Ko maximum).");
    const r = new FileReader();
    r.onload = () => (setError(""), setLogo(String(r.result)));
    r.readAsDataURL(file);
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/projects", { body: { transport: { ...f, couriers_count: Number(f.couriers_count) || 0, vehicles_count: Number(f.vehicles_count) || 0, zones: f.zones.split(",").map((x) => x.trim()).filter(Boolean), goods: f.goods.split(",").map((x) => x.trim()).filter(Boolean), logo } } });
      toast("success", "Votre espace de transport est créé.");
      router.push(`/projets/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(`/connexion?next=${encodeURIComponent("/creer")}`);
      setError(e instanceof Error ? e.message : "Création impossible.");
      setBusy(false);
    }
  }
  const formEl = (
    <form className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), void create())}>
            <label className="block sm:col-span-2"><span className="label">Nom de l&apos;entreprise *</span><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex. Express Bangui Livraison" autoFocus required /></label>
            <label className="block"><span className="label">Type de transport</span>
              <select className="input" value={f.transport_type} onChange={(e) => set("transport_type", e.target.value)}>{TRANSPORT_TYPE_IDS.map((k) => <option key={k} value={k}>{TRANSPORT_TYPES[k].icon} {TRANSPORT_TYPES[k].label}</option>)}</select>
            </label>
            <label className="block"><span className="label">Devise</span>
              <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}</select>
            </label>
            <label className="block"><span className="label">Nombre de livreurs</span><input className="input" type="number" min="0" inputMode="numeric" value={f.couriers_count} onChange={(e) => set("couriers_count", e.target.value)} /></label>
            <label className="block"><span className="label">Nombre de véhicules</span><input className="input" type="number" min="0" inputMode="numeric" value={f.vehicles_count} onChange={(e) => set("vehicles_count", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="label">Adresse</span><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} /></label>
            <label className="block"><span className="label">Téléphone</span><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} /></label>
            <span />
            <label className="block sm:col-span-2"><span className="label">Zones desservies (séparées par des virgules)</span><input className="input" value={f.zones} onChange={(e) => set("zones", e.target.value)} placeholder="Centre-ville, PK5, Bimbo…" /></label>
            <label className="block sm:col-span-2"><span className="label">Types de marchandises transportées</span><input className="input" value={f.goods} onChange={(e) => set("goods", e.target.value)} placeholder="Colis, documents, alimentaire, matériaux…" /></label>
            <div className="sm:col-span-2">
              <span className="label">Logo (facultatif)</span>
              <div className="flex items-center gap-3">
                {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="Aperçu du logo" className="h-12 w-12 rounded-xl object-cover" />}
                <button type="button" className="btn btn-ghost" onClick={() => file.current?.click()}>{logo ? "Changer le logo" : "Choisir un logo"}</button>
                {logo && <button type="button" className="text-sm text-slate-500 underline" onClick={() => setLogo(null)}>Retirer</button>}
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pickLogo(e.target.files?.[0])} />
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn btn-primary" disabled={busy || f.name.trim().length < 2}>{busy ? "Création…" : "Créer mon service"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => (embedded ? onCancel?.() : setOpen(false))}>Annuler</button>
            </div>
          </form>
  );
  if (embedded) return formEl;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm" aria-labelledby="transport-title">
      <div className="p-5 sm:p-7">
        <span className="inline-block rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Nouveau</span>
        <h2 id="transport-title" className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">MiniSoft Transport &amp; Delivery</h2>
        <p className="text-sm font-medium text-emerald-700">Transport et livraison</p>
        <p className="mt-2 text-sm text-slate-600">Commandes, livreurs, véhicules, suivi des colis, tarifs et paiements au même endroit : services de livraison, coursiers, transport de marchandises, livraison de restaurant, boutiques avec livraison, logistique.</p>
        <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
          {FEATURES.map(([I, t]) => <li key={t} className="flex items-center gap-2"><I className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{t}</li>)}
        </ul>
        {!open ? (
          <button className="btn btn-primary mt-5" onClick={() => setOpen(true)}>Créer mon service</button>
        ) : (
          formEl
        )}
      </div>
    </section>
  );
}
