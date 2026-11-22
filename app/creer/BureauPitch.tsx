"use client";

import { Bot, CalendarDays, FileText, FolderKanban, Building2, Users, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";
import { AGENCY_TYPES, AGENCY_TYPE_IDS, CURRENCIES, type AgencyType } from "@/lib/bureau/model";

const FEATURES: [typeof Users, string][] = [
  [Users, "Clients, historique, documents"],
  [FolderKanban, "Projets, tâches, équipe"],
  [CalendarDays, "Agenda et rendez-vous"],
  [FileText, "Devis, factures, reçus PDF"],
  [Wallet, "Recettes, dépenses, rapports"],
  [Building2, "Bureau virtuel 2D / 3D"],
  [Users, "Postes et permissions"],
  [Bot, "Assistant MiniSoft AI"],
];

/** Présentation de MiniSoft Bureau : configuration de l'agence (nom, type, secteur, effectifs, adresse, logo, devise) puis création. */
export function BureauPitch() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", agency_type: "classique" as AgencyType, sector: "", employees_count: "1", offices_count: "1", address: "", phone: "", currency: "XAF" });
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
      const r = await api<{ id: string }>("/api/projects", { body: { bureau: { ...f, employees_count: Number(f.employees_count) || 1, offices_count: Number(f.offices_count) || 1, logo } } });
      toast("success", "Votre bureau est créé.");
      router.push(`/projets/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(`/connexion?next=${encodeURIComponent("/creer")}`);
      setError(e instanceof Error ? e.message : "Création impossible.");
      setBusy(false);
    }
  }
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm" aria-labelledby="bureau-title">
      <div className="p-5 sm:p-7">
        <span className="inline-block rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Nouveau</span>
        <h2 id="bureau-title" className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">MiniSoft Bureau</h2>
        <p className="text-sm font-medium text-indigo-700">Gestion d&apos;une agence ou d&apos;un bureau</p>
        <p className="mt-2 text-sm text-slate-600">Clients, projets, personnel, agenda, facturation et finances au même endroit, adaptés à votre métier : agence immobilière, de communication, cabinet administratif, agence commerciale ou bureau classique.</p>
        <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
          {FEATURES.map(([I, t]) => <li key={t} className="flex items-center gap-2"><I className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />{t}</li>)}
        </ul>
        {!open ? (
          <button className="btn btn-primary mt-5" onClick={() => setOpen(true)}>Créer mon bureau</button>
        ) : (
          <form className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), void create())}>
            <label className="block sm:col-span-2"><span className="label">Nom de l&apos;entreprise *</span><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex. Agence Bangui Immo" autoFocus required /></label>
            <label className="block"><span className="label">Type d&apos;agence</span>
              <select className="input" value={f.agency_type} onChange={(e) => set("agency_type", e.target.value)}>{AGENCY_TYPE_IDS.map((t) => <option key={t} value={t}>{AGENCY_TYPES[t].icon} {AGENCY_TYPES[t].label}</option>)}</select>
            </label>
            <label className="block"><span className="label">Secteur d&apos;activité</span><input className="input" value={f.sector} onChange={(e) => set("sector", e.target.value)} maxLength={80} placeholder={AGENCY_TYPES[f.agency_type].sector} /></label>
            <label className="block"><span className="label">Nombre d&apos;employés</span><input className="input" type="number" min="1" inputMode="numeric" value={f.employees_count} onChange={(e) => set("employees_count", e.target.value)} /></label>
            <label className="block"><span className="label">Nombre de bureaux</span><input className="input" type="number" min="1" inputMode="numeric" value={f.offices_count} onChange={(e) => set("offices_count", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="label">Adresse</span><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} /></label>
            <label className="block"><span className="label">Téléphone</span><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} /></label>
            <label className="block"><span className="label">Devise</span>
              <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}</select>
            </label>
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
              <button className="btn btn-primary" disabled={busy || f.name.trim().length < 2}>{busy ? "Création…" : "Créer mon bureau"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
