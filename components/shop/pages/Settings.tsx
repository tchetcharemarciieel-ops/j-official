"use client";

import { ImagePlus, Plus, X } from "lucide-react";
import { useState } from "react";
import { shrinkImage } from "@/components/runtime/venue/image";
import { SHOP_TYPES, SHOP_TYPE_IDS, type Settings } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Card, Field } from "../ui";

/** Enregistre les réglages complets (le serveur valide tout). */
export function useSaveSettings() {
  const c = useCtx();
  return async (patch: Partial<Settings>) => c.run("settings.save", { ...c.settings, ...patch });
}

export function SettingsPage() {
  const c = useCtx();
  const save = useSaveSettings();
  const [f, setF] = useState(c.settings);
  const [unit, setUnit] = useState("");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="Votre boutique">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de la boutique"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} /></Field>
          <Field label="Type de commerce">
            <select className="input" value={f.type} onChange={(e) => set("type", e.target.value as Settings["type"])}>{SHOP_TYPE_IDS.map((t) => <option key={t} value={t}>{SHOP_TYPES[t].icon} {SHOP_TYPES[t].label}</option>)}</select>
          </Field>
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} /></Field>
          <Field label="WhatsApp" hint="Numéro au format international, ex. +236 72 00 00 00"><input className="input" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} maxLength={30} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={120} /></Field>
          <Field label="Horaires" hint="Ex. Lun–Sam 8 h – 19 h"><input className="input" value={f.hours} onChange={(e) => set("hours", e.target.value)} maxLength={200} /></Field>
          <Field label="Adresse" className="sm:col-span-2"><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} /></Field>
          <Field label="Message sur les reçus" className="sm:col-span-2"><input className="input" value={f.receipt_note} onChange={(e) => set("receipt_note", e.target.value)} maxLength={200} /></Field>
        </div>
      </Card>
      <Card title="Ventes et stock">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.allow_credit} onChange={(e) => set("allow_credit", e.target.checked)} /><span><b>Autoriser les paiements partiels et différés</b><br /><span className="text-slate-500">Le client paie plus tard ; son nom et son téléphone sont alors obligatoires et le reste dû est suivi.</span></span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Seuil d'alerte par défaut (nouveaux produits)"><input className="input" inputMode="decimal" value={f.low_stock_default} onChange={(e) => set("low_stock_default", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} /></Field>
            <Field label="Réservation du stock des commandes en ligne (minutes)" hint="Délai pour confirmer une commande avant que son stock redevienne vendable."><input className="input" inputMode="numeric" value={f.reservation_minutes} onChange={(e) => set("reservation_minutes", Number(e.target.value.replace(/\D/g, "")) || 15)} /></Field>
          </div>
          <div>
            <span className="label">Unités de vente</span>
            <div className="flex flex-wrap gap-2">
              {f.units.map((u) => (
                <span key={u} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">{u}{f.units.length > 1 && <button onClick={() => set("units", f.units.filter((x) => x !== u))} aria-label={`Retirer ${u}`}><X className="h-3.5 w-3.5" /></button>}</span>
              ))}
              <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), unit.trim() && (set("units", [...new Set([...f.units, unit.trim()])]), setUnit("")))}>
                <input className="input !w-32 !py-1" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Ex. sac, boîte" maxLength={30} aria-label="Nouvelle unité" />
                <button className="btn btn-ghost !px-2 !py-1" aria-label="Ajouter l'unité"><Plus className="h-4 w-4" /></button>
              </form>
            </div>
          </div>
        </div>
      </Card>
      <div className="flex justify-end"><button className="btn btn-primary" onClick={() => void save(f)}>Enregistrer les réglages</button></div>
    </div>
  );
}

/** Choix d'une image (logo, bannière) enregistrée côté serveur. */
export function ImagePick({ label, id, kind, onChange, wide = false }: { label: string; id: string | null; kind: "logo" | "banner"; onChange: (id: string | null) => void; wide?: boolean }) {
  const c = useCtx();
  const [busy, setBusy] = useState(false);
  const src = c.img(id);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 ${wide ? "h-20 w-40" : "h-20 w-20"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
        </span>
        <label className="btn btn-ghost cursor-pointer !py-1.5 text-sm">
          {busy ? "Envoi…" : src ? "Changer" : "Choisir une image"}
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const data = await shrinkImage(file, wide ? 1600 : 512, kind === "logo" ? "image/png" : "image/jpeg", 380_000);
              const r = await c.run("photo.add", { data, kind }, { quiet: true });
              if (r?.id) onChange(r.id);
            } catch (err) {
              c.notify("error", err instanceof Error ? err.message : "Image refusée.");
            } finally {
              setBusy(false);
            }
          }} />
        </label>
        {src && <button className="text-sm text-slate-500 underline" onClick={() => onChange(null)}>Retirer</button>}
      </div>
    </div>
  );
}
