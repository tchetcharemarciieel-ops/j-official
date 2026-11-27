"use client";

import { BookOpen, CalendarCheck, ClipboardList, GraduationCap, Megaphone, Receipt, Users, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/Toaster";
import { api, ApiError } from "@/lib/fetcher";
import { CURRENCIES, DEFAULT_LEVELS, SCHOOL_TYPES, SCHOOL_TYPE_IDS, SYSTEMS, type SchoolType, type SystemId } from "@/lib/ecole/model";

const FEATURES: [typeof Users, string][] = [
  [GraduationCap, "Inscriptions, élèves, parents"],
  [BookOpen, "Classes, matières, coefficients"],
  [ClipboardList, "Notes, moyennes, classements"],
  [Receipt, "Bulletins et reçus en PDF"],
  [CalendarCheck, "Présences, absences, retards"],
  [Wallet, "Frais, paiements, impayés"],
  [Users, "Espace parents sécurisé"],
  [Megaphone, "Annonces de l'école"],
];

const yearNow = () => { const d = new Date(); return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; };

/**
 * Création d'un établissement : l'école répond aux questions qui personnalisent le logiciel (type, effectifs, système
 * éducatif, organisation de l'année, niveaux, règles de notation, besoins particuliers) avant sa création.
 */
export function EcolePitch({ embedded = false, onCancel }: { embedded?: boolean; onCancel?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(embedded);
  const [f, setF] = useState({ name: "", school_type: "college" as SchoolType, system: "francophone" as SystemId, system_note: "", students_count: "", teachers_count: "", classes_count: "", terms: "3", scale: "20", pass_mark: "10", year_start: String(yearNow()), levels: DEFAULT_LEVELS.college.join(", "), needs: "", address: "", phone: "", currency: "XAF" });
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
      const r = await api<{ id: string }>("/api/projects", { body: { ecole: { ...f, students_count: Number(f.students_count) || 0, teachers_count: Number(f.teachers_count) || 0, classes_count: Number(f.classes_count) || 0, terms: Number(f.terms), scale: Number(f.scale) || 20, pass_mark: Number(f.pass_mark) || 10, year_start: Number(f.year_start), levels: f.levels.split(",").map((x) => x.trim()).filter(Boolean), logo } } });
      toast("success", "Votre établissement est créé.");
      router.push(`/projets/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push(`/connexion?next=${encodeURIComponent("/creer")}`);
      setError(e instanceof Error ? e.message : "Création impossible.");
      setBusy(false);
    }
  }
  const formEl = (
    <form className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), void create())}>
      <label className="block sm:col-span-2"><span className="label">Nom de l&apos;établissement *</span><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex. Collège Les Cèdres" autoFocus required /></label>
      <label className="block"><span className="label">Type d&apos;établissement</span>
        <select className="input" value={f.school_type} onChange={(e) => { const t = e.target.value as SchoolType; setF((x) => ({ ...x, school_type: t, levels: DEFAULT_LEVELS[t].join(", ") })); }}>{SCHOOL_TYPE_IDS.map((k) => <option key={k} value={k}>{SCHOOL_TYPES[k].icon} {SCHOOL_TYPES[k].label}</option>)}</select>
      </label>
      <label className="block"><span className="label">Système éducatif</span>
        <select className="input" value={f.system} onChange={(e) => set("system", e.target.value)}>{Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      {f.system === "autre" && <label className="block sm:col-span-2"><span className="label">Précisez votre système</span><input className="input" value={f.system_note} onChange={(e) => set("system_note", e.target.value)} maxLength={200} /></label>}
      <label className="block"><span className="label">Nombre d&apos;élèves</span><input className="input" type="number" min="0" inputMode="numeric" value={f.students_count} onChange={(e) => set("students_count", e.target.value)} /></label>
      <label className="block"><span className="label">Nombre d&apos;enseignants</span><input className="input" type="number" min="0" inputMode="numeric" value={f.teachers_count} onChange={(e) => set("teachers_count", e.target.value)} /></label>
      <label className="block"><span className="label">Nombre de classes</span><input className="input" type="number" min="0" inputMode="numeric" value={f.classes_count} onChange={(e) => set("classes_count", e.target.value)} /></label>
      <label className="block"><span className="label">Année scolaire commençant en</span><input className="input" type="number" min="2000" max="2100" value={f.year_start} onChange={(e) => set("year_start", e.target.value)} /></label>
      <label className="block"><span className="label">Organisation de l&apos;année</span>
        <select className="input" value={f.terms} onChange={(e) => set("terms", e.target.value)}><option value="3">3 trimestres</option><option value="2">2 semestres</option><option value="4">4 périodes</option><option value="1">1 seule période</option></select>
      </label>
      <label className="block"><span className="label">Notes sur (barème)</span><input className="input" type="number" min="1" value={f.scale} onChange={(e) => set("scale", e.target.value)} /></label>
      <label className="block"><span className="label">Seuil de réussite</span><input className="input" type="number" min="0" value={f.pass_mark} onChange={(e) => set("pass_mark", e.target.value)} /></label>
      <label className="block"><span className="label">Devise</span><select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}</select></label>
      <label className="block sm:col-span-2"><span className="label">Niveaux (séparés par des virgules)</span><input className="input" value={f.levels} onChange={(e) => set("levels", e.target.value)} placeholder="6ème, 5ème, 4ème, 3ème" /></label>
      <label className="block sm:col-span-2"><span className="label">Adresse</span><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} /></label>
      <label className="block"><span className="label">Téléphone</span><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} /></label>
      <span />
      <label className="block sm:col-span-2"><span className="label">Besoins particuliers de l&apos;établissement (facultatif)</span><textarea className="input" rows={2} value={f.needs} onChange={(e) => set("needs", e.target.value)} maxLength={1000} placeholder="Ex. internat, cantine, uniformes, enseignement bilingue…" /></label>
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
        <button className="btn btn-primary" disabled={busy || f.name.trim().length < 2}>{busy ? "Création…" : "Créer mon établissement"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => (embedded ? onCancel?.() : setOpen(false))}>Annuler</button>
      </div>
    </form>
  );
  if (embedded) return formEl;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm" aria-labelledby="ecole-title">
      <div className="p-5 sm:p-7">
        <span className="inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Nouveau</span>
        <h2 id="ecole-title" className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">MiniSoft École</h2>
        <p className="mt-2 text-sm text-slate-600">La gestion complète d&apos;un établissement scolaire.</p>
        <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">{FEATURES.map(([I, t]) => <li key={t} className="flex items-center gap-2"><I className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />{t}</li>)}</ul>
        {!open ? <button className="btn btn-primary mt-5" onClick={() => setOpen(true)}>Créer mon établissement</button> : formEl}
      </div>
    </section>
  );
}
