"use client";

import { Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { AGENCY_TYPES, AGENCY_TYPE_IDS, CURRENCIES, OPTIONAL_CORE, PAGE_LABELS, SECTOR_MODULES, sectorModules, type AgencyType, type CurrencyCode, type Page, type Space } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Card, Field, useFilePick } from "../ui";

const LINKABLE: Page[] = ["dashboard", "clients", "projets", "personnel", "presences", "agenda", "documents", "finances", "messagerie", "equipements", "metier", "assistant"];
const KINDS: Record<Space["kind"], string> = { reception: "Accueil", desk: "Bureau", meeting: "Réunion", stock: "Archives / stock", counter: "Comptoir / technique", cashier: "Caisse" };

/** Réglages : identité de l'agence, devise, TVA, modules activables et bureau virtuel personnalisable. */
export function SettingsPage() {
  const c = useCtx();
  const s = c.settings;
  const [f, setF] = useState({ name: s.name, agency_type: s.agency_type as AgencyType, sector: s.sector, employees_count: String(s.employees_count), offices_count: String(s.offices_count), address: s.address, phone: s.phone, email: s.email, currency: s.currency as CurrencyCode, primary: s.primary, tax_rate: String(s.tax_rate), invoice_note: s.invoice_note });
  const [modules, setModules] = useState<Record<string, boolean>>({ ...s.modules });
  const [spaces, setSpaces] = useState<Space[]>(s.spaces.map((x) => ({ ...x, links: [...x.links] })));
  const [logo, setLogo] = useState<{ mime: string; data: string } | null>(null);
  const { pick, busy } = useFilePick();
  const input = useRef<HTMLInputElement>(null);
  const allowed = c.s.can.settings;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const updSpace = (i: number, p: Partial<Space>) => setSpaces((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  if (!allowed) return <Card title="Réglages">Seuls le propriétaire et les administrateurs peuvent modifier la configuration.</Card>;
  const modOn = (k: string) => modules[k] !== false;
  const save = async () => {
    await c.run("settings.save", { ...f, employees_count: Number(f.employees_count) || 1, offices_count: Number(f.offices_count) || 1, tax_rate: Number(f.tax_rate) || 0, logo_id: s.logo_id, logo, modules, spaces });
    setLogo(null);
  };
  const sector = sectorModules({ ...s, agency_type: f.agency_type, modules });
  const logoSrc = logo ? `data:${logo.mime};base64,${logo.data}` : c.fileUrl(s.logo_id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="Votre agence">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de l'entreprise" className="sm:col-span-2"><input className="input" value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Type d'agence"><select className="input" value={f.agency_type} onChange={(e) => set("agency_type", e.target.value)}>{AGENCY_TYPE_IDS.map((k) => <option key={k} value={k}>{AGENCY_TYPES[k].icon} {AGENCY_TYPES[k].label}</option>)}</select></Field>
          <Field label="Secteur d'activité"><input className="input" value={f.sector} maxLength={80} onChange={(e) => set("sector", e.target.value)} /></Field>
          <Field label="Nombre d'employés"><input className="input" type="number" min="1" value={f.employees_count} onChange={(e) => set("employees_count", e.target.value)} /></Field>
          <Field label="Nombre de bureaux"><input className="input" type="number" min="1" value={f.offices_count} onChange={(e) => set("offices_count", e.target.value)} /></Field>
          <Field label="Adresse" className="sm:col-span-2"><input className="input" value={f.address} maxLength={200} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} maxLength={120} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Devise"><select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}</select></Field>
          <Field label="TVA par défaut (%)" hint="0 = sans TVA. Appliquée aux nouveaux devis et factures."><input className="input" type="number" min="0" max="100" step="any" value={f.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} /></Field>
          <Field label="Couleur principale"><input className="input !p-1 h-10" type="color" value={f.primary} onChange={(e) => set("primary", e.target.value)} /></Field>
          <div>
            <span className="label">Logo</span>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-slate-100">{logoSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoSrc} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-slate-400" />}</span>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>Changer</button>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const r = await pick(file); if (r && /^image\/(png|jpeg|webp)$/.test(r.mime)) setLogo({ mime: r.mime, data: r.data }); else if (r) c.notify("error", "Logo : PNG, JPEG ou WebP uniquement."); }} />
            </div>
          </div>
          <Field label="Note sur les devis et factures" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={300} value={f.invoice_note} onChange={(e) => set("invoice_note", e.target.value)} placeholder="Conditions de paiement, coordonnées bancaires…" /></Field>
        </div>
      </Card>

      <Card title="Modules" subtitle="Désactivez ce dont vous n'avez pas besoin : le menu se simplifie, vos données restent conservées.">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Communs</p>
        <div className="mb-3 grid gap-1 sm:grid-cols-3">{Object.entries(OPTIONAL_CORE).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modOn(k)} onChange={(e) => setModules({ ...modules, [k]: e.target.checked })} /> {l}</label>)}</div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Spécifiques au métier ({AGENCY_TYPES[f.agency_type].label})</p>
        <div className="grid gap-1 sm:grid-cols-2">{sector.map(({ def }) => <label key={def.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modOn(def.key)} onChange={(e) => setModules({ ...modules, [def.key]: e.target.checked })} /> {def.icon} {def.label}</label>)}</div>
        {f.agency_type !== s.agency_type && <p className="mt-2 text-xs text-amber-700">Le type d&apos;agence change : les fiches de l&apos;ancien métier sont conservées mais n&apos;apparaîtront plus tant que vous ne revenez pas à ce type.</p>}
      </Card>

      <Card title="Bureau virtuel" subtitle="Espaces cliquables du plan 2D / 3D. Chaque espace ouvre les pages que vous choisissez (sous réserve des droits de chacun).">
        <div className="space-y-3">
          {spaces.map((sp, i) => (
            <div key={sp.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className="input !w-auto flex-1" value={sp.name} maxLength={40} onChange={(e) => updSpace(i, { name: e.target.value })} aria-label="Nom de l'espace" />
                <select className="input !w-auto" value={sp.kind} onChange={(e) => updSpace(i, { kind: e.target.value as Space["kind"] })} aria-label="Aspect">{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={sp.enabled} onChange={(e) => updSpace(i, { enabled: e.target.checked })} /> Affiché</label>
                <button type="button" className="text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={spaces.length < 2} onClick={() => setSpaces(spaces.filter((_, k) => k !== i))} aria-label="Supprimer l'espace"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{LINKABLE.map((p) => <label key={p} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={sp.links.includes(p)} onChange={(e) => updSpace(i, { links: e.target.checked ? [...sp.links, p].slice(0, 8) : sp.links.filter((x) => x !== p) })} /> {PAGE_LABELS[p]}</label>)}</div>
            </div>
          ))}
          {spaces.length < 11 && <button type="button" className="btn btn-ghost" onClick={() => setSpaces([...spaces, { id: `espace-${Date.now().toString(36).slice(-6)}`, name: "Nouvel espace", kind: "desk", links: [], enabled: true }])}><Plus className="h-4 w-4" /> Ajouter un espace</button>}
        </div>
      </Card>
      <div className="sticky bottom-3 flex justify-end"><button className="btn btn-primary shadow-lg" disabled={!f.name.trim()} onClick={save}>Enregistrer la configuration</button></div>
    </div>
  );
}
