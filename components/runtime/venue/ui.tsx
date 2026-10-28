"use client";

import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { createContext, useContext } from "react";
import type { OpResult } from "@/lib/venue/engine";
import { LEVEL, type Doc, type Settings, type VenueKind } from "@/lib/venue/model";
import type { DataMode } from "../useAppData";
import type { VenueApi, VenueState } from "./useVenue";
import { Field, inp } from "../garage/ui";

// Composants d'interface communs au garage (boutons, champs, fenêtres, onglets, impression).
export { Btn, Card, downloadCsv, Empty, Field, inp, Modal, PeriodPicker, Pill, PrintDoc, Row, Search, Stat, Tabs, useIdem, type Tone } from "../garage/ui";

type Ctx = {
  v: VenueState;
  api: VenueApi;
  mode: DataMode;
  projectId: string;
  appName: string;
  kind: VenueKind;
  settings: Settings;
  level: number;
  name: (memberId: string | null | undefined) => string;
  act: (op: string, input: unknown, opts?: { confirm?: string; quiet?: boolean }) => Promise<OpResult | null>;
  ask: (message: string) => Promise<boolean>;
  /** Ouvre une autre zone (et éventuellement une de ses fonctions). */
  goZone: (zone: string, option?: string, roomId?: string) => void;
};

export const VenueCtx = createContext<Ctx | null>(null);
export function useV() {
  const c = useContext(VenueCtx);
  if (!c) throw new Error("VenueCtx manquant");
  return c;
}
export const isMgr = (level: number) => level >= LEVEL.manager;

export function docs<T>(list: Doc[]): Doc<T>[] {
  return list as Doc<T>[];
}
export function byId<T>(list: Doc[], id: string | null | undefined): Doc<T> | undefined {
  return id ? (list.find((d) => d.id === id) as Doc<T> | undefined) : undefined;
}

/** Carte d'une fonction de la zone : icône, titre, description courte et résumé chiffré. */
export function OptionCard({ icon: Icon, title, description, hint, tone, onClick }: { icon: LucideIcon; title: string; description: string; hint?: string; tone?: "alert" | "active"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tab-press group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--app-primary)] hover:shadow-md">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-[var(--app-primary)] group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
        {hint && <span className={`mt-0.5 block text-xs font-medium ${tone === "alert" ? "text-red-600" : tone === "active" ? "text-blue-700" : "text-slate-600"}`}>{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

export function Back({ onClick, label = "Retour aux fonctions" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="tab-press mb-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-slate-600 hover:text-slate-900">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

export function MemberSelect({ value, onChange, label = "Responsable", disabled }: { value: string | null; onChange: (v: string | null) => void; label?: string; disabled?: boolean }) {
  const { v } = useV();
  return (
    <Field label={label} hint={v.members.length <= 1 ? "Invitez votre équipe (onglet Équipe du logiciel) pour attribuer le travail." : undefined}>
      <select className={inp} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
        <option value="">— Non attribué —</option>
        {v.members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </Field>
  );
}

/** Lecture seule : explique pourquoi les boutons d'action sont absents. */
export function ReadOnlyNote({ need = 1 }: { need?: 1 | 2 }) {
  const { level } = useV();
  if (level >= need) return null;
  return <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{need === 2 ? "Consultation seulement : les modifications sont réservées aux gérants." : "Votre rôle est en lecture seule : vous pouvez consulter sans modifier."}</p>;
}

export const numOrEmpty = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
export const parseNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
