"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  Car,
  Check,
  ChefHat,
  CircleHelp,
  ClipboardList,
  Facebook,
  GraduationCap,
  HeartPulse,
  Hotel,
  Instagram,
  Laptop,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MonitorSmartphone,
  Music2,
  Pill,
  Receipt,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sprout,
  Store,
  Tablet,
  User,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  Box,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { COUNTRIES, DEVICES, DISCOVERY, FEATURED_COUNTRIES, HAS_ROLES, PROFILES, ROLES, SECTORS, TEAM_SIZES, TOOLS, onboardingSchema, type OnboardingDraft } from "@/lib/onboarding";

const STORE = "msonboarding:v1";

type Choice = { id: string; label: string; icon: LucideIcon };
const opts = <T extends Record<string, string>>(o: T, icons: Record<keyof T, LucideIcon>): Choice[] => Object.entries(o).map(([id, label]) => ({ id, label, icon: icons[id as keyof T] }));

const Q = {
  discovery: opts(DISCOVERY, { tiktok: Music2, instagram: Instagram, facebook: Facebook, google: Search, ami: UsersRound, publicite: Megaphone, autre: CircleHelp }),
  profile: opts(PROFILES, { entrepreneur: Rocket, proprietaire: Building2, commercant: Store, freelance: Laptop, porteur: Lightbulb, autre: CircleHelp }),
  sector: opts(SECTORS, { restaurant: ChefHat, hotel: Hotel, garage: Car, pharmacie: Pill, boutique: ShoppingBag, ecole: GraduationCap, sante: HeartPulse, transport: Bike, agriculture: Sprout, autre: CircleHelp }),
  tools: opts(TOOLS, { stocks: Boxes, caisse: Receipt, commandes: ClipboardList, reservations: CalendarDays, personnel: Users, comptabilite: Wallet, clients: User, tableau: LayoutDashboard, plan3d: Box, autre: CircleHelp }),
  teamSize: opts(TEAM_SIZES, { seul: User, "2-5": Users, "6-20": UsersRound, "20+": Building2 }),
  hasRoles: opts(HAS_ROLES, { oui: Check, non: User, inconnu: CircleHelp }),
  roles: opts(ROLES, { administrateur: ShieldCheck, gerant: Briefcase, employe: User, caissier: Receipt, stock: Boxes, autre: UserCog }),
  devices: opts(DEVICES, { telephone: Smartphone, ordinateur: Laptop, tablette: Tablet, plusieurs: MonitorSmartphone }),
};

type StepId = "discovery" | "profile" | "sector" | "tools" | "teamSize" | "hasRoles" | "devices" | "country" | "account";
const STEPS: { id: StepId; title: string; hint?: string }[] = [
  { id: "discovery", title: "Comment as-tu découvert MiniSoft RCA ?" },
  { id: "profile", title: "Quel est ton profil ?" },
  { id: "sector", title: "Dans quel secteur travailles-tu ?" },
  { id: "tools", title: "Quels outils souhaites-tu créer ?", hint: "Deux réponses maximum" },
  { id: "teamSize", title: "Combien de personnes utiliseront le logiciel ?" },
  { id: "hasRoles", title: "Les utilisateurs auront-ils des rôles différents ?" },
  { id: "devices", title: "Sur quel appareil utiliseras-tu le logiciel ?", hint: "Deux réponses maximum" },
  { id: "country", title: "Dans quel pays se trouve ton entreprise ?" },
  { id: "account", title: "Crée ton compte" },
];

function ChoiceGrid({ choices, selected, onToggle, multi, max }: { choices: Choice[]; selected: string[]; onToggle: (id: string) => void; multi?: boolean; max?: number }) {
  const full = multi && max !== undefined && selected.length >= max;
  return (
    <div role={multi ? "group" : "radiogroup"} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {choices.map((c) => {
        const on = selected.includes(c.id);
        const disabled = !on && full;
        return (
          <button
            key={c.id}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            disabled={disabled}
            onClick={() => onToggle(c.id)}
            className={`tab-press relative flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-2xl border-2 p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-blue-600 bg-blue-50 text-slate-900 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
          >
            <c.icon className={`h-5 w-5 ${on ? "text-blue-600" : "text-slate-500"}`} aria-hidden />
            <span className="font-medium leading-tight">{c.label}</span>
            {on && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3" aria-hidden /></span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inscription en plusieurs étapes : une question par écran, puis création du compte.
 * Les réponses sont gardées dans ce navigateur jusqu'à l'inscription (jamais le mot de passe).
 */
export function SignupWizard() {
  const [a, setA] = useState<OnboardingDraft>({});
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [countryQuery, setCountryQuery] = useState("");
  const loaded = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as { a: OnboardingDraft; step: number };
        setA(saved.a ?? {});
        setStep(Math.min(Math.max(0, saved.step ?? 0), STEPS.length - 1));
      }
    } catch {
      /* stockage indisponible : le questionnaire fonctionne sans sauvegarde */
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ a, step }));
    } catch {
      /* stockage plein */
    }
  }, [a, step]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const set = (patch: OnboardingDraft) => setA((x) => ({ ...x, ...patch }));
  const single = (k: "discovery" | "profile" | "sector" | "teamSize" | "hasRoles") => (id: string) => set({ [k]: id } as OnboardingDraft);
  const multi = (k: "tools" | "devices" | "roles", max?: number) => (id: string) =>
    setA((x) => {
      const cur = (x[k] as string[] | undefined) ?? [];
      const next = cur.includes(id) ? cur.filter((v) => v !== id) : max && cur.length >= max ? cur : [...cur, id];
      return { ...x, [k]: next } as OnboardingDraft;
    });

  const s = STEPS[step]!;
  const valid = useMemo(() => {
    switch (s.id) {
      case "discovery":
        return Boolean(a.discovery);
      case "profile":
        return Boolean(a.profile);
      case "sector":
        return Boolean(a.sector) && (a.sector !== "autre" || Boolean(a.sectorOther?.trim()));
      case "tools":
        return (a.tools?.length ?? 0) > 0 && (!a.tools?.includes("autre") || Boolean(a.toolsOther?.trim()));
      case "teamSize":
        return Boolean(a.teamSize);
      case "hasRoles":
        return Boolean(a.hasRoles) && (a.hasRoles !== "oui" || (a.roles?.length ?? 0) > 0);
      case "devices":
        return (a.devices?.length ?? 0) > 0;
      case "country":
        return (a.country?.trim().length ?? 0) >= 2;
      default:
        return true;
    }
  }, [s.id, a]);
  const needHint = !valid && s.id !== "account" ? (s.id === "sector" && a.sector === "autre" ? "Précise ton activité pour continuer." : s.id === "tools" && a.tools?.includes("autre") ? "Précise ton besoin pour continuer." : s.id === "hasRoles" && a.hasRoles === "oui" ? "Choisis au moins un rôle." : "Choisis une réponse pour continuer.") : "";
  const parsed = onboardingSchema.safeParse(a);

  const go = (d: 1 | -1) => {
    setDir(d);
    setStep((i) => Math.min(STEPS.length - 1, Math.max(0, i + d)));
  };
  const progress = Math.round(((step + (s.id === "account" ? 1 : 0)) / STEPS.length) * 100);
  const countries = COUNTRIES.filter((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(countryQuery.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")));

  return (
    <div>
      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>{s.id === "account" ? "Dernière étape" : `Question ${step + 1} sur ${STEPS.length - 1}`}</span>
          <span>{progress} %</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progression de l'inscription">
          <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div key={step} className={dir === 1 ? "wizard-in-next" : "wizard-in-prev"}>
        <h2 ref={heading} tabIndex={-1} className="font-display text-xl font-bold text-slate-900 outline-none">{s.title}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">{s.hint ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{s.hint}</span> : s.id === "account" ? "Tes réponses seront enregistrées avec ton compte." : "Une seule réponse."}</p>

        {s.id === "discovery" && <ChoiceGrid choices={Q.discovery} selected={a.discovery ? [a.discovery] : []} onToggle={single("discovery")} />}
        {s.id === "profile" && <ChoiceGrid choices={Q.profile} selected={a.profile ? [a.profile] : []} onToggle={single("profile")} />}
        {s.id === "sector" && (
          <div className="space-y-3">
            <ChoiceGrid choices={Q.sector} selected={a.sector ? [a.sector] : []} onToggle={single("sector")} />
            {a.sector === "autre" && (
              <div className="wizard-in-next">
                <label className="label" htmlFor="sector-other">Précise ton activité</label>
                <input id="sector-other" className="input" maxLength={200} value={a.sectorOther ?? ""} onChange={(e) => set({ sectorOther: e.target.value })} placeholder="Ex. : salon de coiffure, quincaillerie…" autoFocus />
              </div>
            )}
          </div>
        )}
        {s.id === "tools" && (
          <div className="space-y-3">
            <ChoiceGrid choices={Q.tools} selected={a.tools ?? []} onToggle={multi("tools", 2)} multi max={2} />
            {a.tools?.includes("autre") && (
              <div className="wizard-in-next">
                <label className="label" htmlFor="tools-other">Précise ton besoin</label>
                <input id="tools-other" className="input" maxLength={200} value={a.toolsOther ?? ""} onChange={(e) => set({ toolsOther: e.target.value })} placeholder="Ex. : suivi des rendez-vous" autoFocus />
              </div>
            )}
          </div>
        )}
        {s.id === "teamSize" && <ChoiceGrid choices={Q.teamSize} selected={a.teamSize ? [a.teamSize] : []} onToggle={single("teamSize")} />}
        {s.id === "hasRoles" && (
          <div className="space-y-4">
            <ChoiceGrid choices={Q.hasRoles} selected={a.hasRoles ? [a.hasRoles] : []} onToggle={single("hasRoles")} />
            {a.hasRoles === "oui" && (
              <div className="wizard-in-next space-y-2">
                <p className="text-sm font-medium text-slate-800">Quels rôles ? <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Plusieurs réponses possibles</span></p>
                <ChoiceGrid choices={Q.roles} selected={a.roles ?? []} onToggle={multi("roles")} multi />
                {a.roles?.includes("autre") && <input className="input" aria-label="Autre rôle" maxLength={200} value={a.rolesOther ?? ""} onChange={(e) => set({ rolesOther: e.target.value })} placeholder="Précise le rôle (facultatif)" />}
              </div>
            )}
          </div>
        )}
        {s.id === "devices" && <ChoiceGrid choices={Q.devices} selected={a.devices ?? []} onToggle={multi("devices", 2)} multi max={2} />}
        {s.id === "country" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {FEATURED_COUNTRIES.map((c) => (
                <button key={c} type="button" onClick={() => (set({ country: c }), setCountryQuery(""))} aria-pressed={a.country === c} className={`tab-press rounded-full border-2 px-3 py-1.5 text-sm ${a.country === c ? "border-blue-600 bg-blue-50 font-medium" : "border-slate-200 bg-white text-slate-700"}`}>{c}</button>
              ))}
            </div>
            <div>
              <label className="label" htmlFor="country-search">Rechercher un autre pays</label>
              <input id="country-search" className="input" value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} placeholder="Tape le nom du pays…" autoComplete="country-name" />
              {countryQuery.trim() && (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {countries.slice(0, 8).map((c) => (
                    <li key={c}><button type="button" onClick={() => (set({ country: c }), setCountryQuery(""))} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{c}</button></li>
                  ))}
                  <li><button type="button" onClick={() => (set({ country: countryQuery.trim() }), setCountryQuery(""))} className="w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-slate-50">Autre pays : « {countryQuery.trim()} »</button></li>
                </ul>
              )}
            </div>
            {a.country && <p className="text-sm text-slate-700">Pays choisi : <strong>{a.country}</strong></p>}
          </div>
        )}
        {s.id === "account" && (
          parsed.success ? (
            <AuthForm mode="signup" onboarding={parsed.data} onSignedUp={() => { try { localStorage.removeItem(STORE); } catch { /* rien */ } }} />
          ) : (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Une réponse manque : {parsed.error.issues[0]?.message}. Reviens en arrière pour la compléter.</p>
          )
        )}
      </div>

      {needHint && <p className="mt-3 text-xs text-slate-500" aria-live="polite">{needHint}</p>}
      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" onClick={() => go(-1)} disabled={step === 0} className="btn btn-ghost disabled:invisible"><ArrowLeft className="h-4 w-4" aria-hidden />Retour</button>
        {s.id !== "account" && <button type="button" onClick={() => go(1)} disabled={!valid} className="btn btn-primary">Continuer<ArrowRight className="h-4 w-4" aria-hidden /></button>}
      </div>
    </div>
  );
}
