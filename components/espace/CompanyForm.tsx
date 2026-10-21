"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";

type Values = { full_name: string; company_name: string; company_logo_url: string; company_sector: string; company_phone: string; company_email: string; company_address: string };

const SECTORS = ["Restauration", "Commerce / boutique", "Garage", "Pharmacie", "École", "Hôtel", "Immobilier", "Transport / livraison", "Salon / services", "PME / gestion interne", "ONG / association", "Autre"];

export function CompanyForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/account/profile", { method: "PATCH", body: v });
      toast("success", "Profil de l'entreprise enregistré.");
      router.refresh();
    } catch (err) {
      const details = err instanceof ApiError ? (err.body.details as string[] | undefined) : undefined;
      setError(details?.[0]?.split(" : ").pop() ?? (err instanceof Error ? err.message : "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  const initials = (v.company_name || v.full_name || "MS").slice(0, 2).toUpperCase();
  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="flex items-center gap-4 sm:col-span-2">
        {v.company_logo_url && logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.company_logo_url} alt="Logo de l'entreprise" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" referrerPolicy="no-referrer" onError={() => setLogoOk(false)} onLoad={() => setLogoOk(true)} />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-sky-glow text-xl font-bold text-white">{initials}</span>
        )}
        <div className="text-sm">
          <p className="font-semibold text-white">{v.company_name || "Votre entreprise"}</p>
          <p className="text-slate-400">{v.company_sector || "Secteur non renseigné"}</p>
          {v.company_logo_url && !logoOk && <p className="text-xs text-amber-300">Image introuvable à cette adresse.</p>}
        </div>
      </div>
      <label className="block"><span className="label">Nom de l&apos;entreprise</span><input className="input" value={v.company_name} onChange={set("company_name")} maxLength={100} autoComplete="organization" /></label>
      <label className="block"><span className="label">Secteur d&apos;activité</span>
        <select className="input" value={v.company_sector} onChange={set("company_sector")}>
          <option value="">Choisir…</option>
          {SECTORS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2"><span className="label">Logo (adresse https d&apos;une image)</span><input className="input" type="url" value={v.company_logo_url} onChange={(e) => { setLogoOk(true); set("company_logo_url")(e); }} placeholder="https://…/logo.png" /></label>
      <label className="block"><span className="label">Téléphone / WhatsApp</span><input className="input" type="tel" value={v.company_phone} onChange={set("company_phone")} maxLength={30} placeholder="+236 7…" autoComplete="tel" /></label>
      <label className="block"><span className="label">E-mail de contact</span><input className="input" type="email" value={v.company_email} onChange={set("company_email")} maxLength={200} autoComplete="email" /></label>
      <label className="block sm:col-span-2"><span className="label">Adresse</span><input className="input" value={v.company_address} onChange={set("company_address")} maxLength={200} placeholder="Quartier, ville" autoComplete="street-address" /></label>
      <label className="block sm:col-span-2"><span className="label">Votre nom</span><input className="input" value={v.full_name} onChange={set("full_name")} maxLength={80} autoComplete="name" /></label>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={saving}>{saving && <span className="spinner" />}Enregistrer</button>
      </div>
    </form>
  );
}
