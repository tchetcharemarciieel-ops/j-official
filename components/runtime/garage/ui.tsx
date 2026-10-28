"use client";

import { Inbox, Printer, X } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import type { OpResult } from "@/lib/garage/engine";
import { LEVEL, periodPreset, type Doc, type Period } from "@/lib/garage/model";
import type { GarageZoneId } from "@/lib/workspace";
import type { DataMode } from "../useAppData";
import type { GarageApi, GarageState } from "./useGarage";

export type ZoneId = GarageZoneId;

type Ctx = {
  g: GarageState;
  api: GarageApi;
  mode: DataMode;
  projectId: string;
  appName: string;
  level: number;
  name: (memberId: string | null | undefined) => string;
  /** Exécute une opération : confirmation éventuelle, message de réussite ou d'erreur. */
  act: (op: string, input: unknown, opts?: { confirm?: string; quiet?: boolean }) => Promise<OpResult | null>;
  ask: (message: string) => Promise<boolean>;
  /** Ouvre un dossier d'intervention (depuis n'importe quelle zone). */
  openJob: (jobId: string) => void;
  goZone: (zone: ZoneId) => void;
};

export const GarageCtx = createContext<Ctx | null>(null);
export function useG() {
  const c = useContext(GarageCtx);
  if (!c) throw new Error("GarageCtx manquant");
  return c;
}
export const isMgr = (level: number) => level >= LEVEL.manager;

export const inp = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[var(--app-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]/20 disabled:bg-slate-50";

export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Btn({ children, onClick, kind = "primary", busy, disabled, type = "button", small, title, className = "" }: { children: React.ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "soft"; busy?: boolean; disabled?: boolean; type?: "button" | "submit"; small?: boolean; title?: string; className?: string }) {
  const base = `tab-press inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${small ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm"}`;
  const tone = kind === "primary" ? "text-white shadow-sm hover:brightness-110" : kind === "danger" ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : kind === "soft" ? "bg-slate-100 text-slate-800 hover:bg-slate-200" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title} className={`${base} ${tone} ${className}`} style={kind === "primary" ? { background: "var(--app-primary)" } : undefined}>
      {busy && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

export function Empty({ text, icon: Icon = Inbox, children }: { text: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
      <Icon className="h-6 w-6 text-slate-400" aria-hidden />
      <p>{text}</p>
      {children}
    </div>
  );
}

const TONES = { slate: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-800", green: "bg-green-50 text-green-700", red: "bg-red-50 text-red-700", violet: "bg-violet-50 text-violet-700" };
export type Tone = keyof typeof TONES;
export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Card({ title, children, actions, className = "" }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-3.5 ${className}`}>
      {(title || actions) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title && <h4 className="text-sm font-semibold text-slate-900">{title}</h4>}
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "slate", onClick }: { label: string; value: React.ReactNode; tone?: Tone; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`rounded-xl p-2.5 text-left ${TONES[tone]} ${onClick ? "tab-press hover:brightness-95" : ""}`}>
      <span className="block text-[11px] opacity-80">{label}</span>
      <span className="block text-lg font-bold leading-tight">{value}</span>
    </Tag>
  );
}

/** Onglets horizontaux défilants (une section de zone ou d'un dossier). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; icon?: LucideIcon; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`tab-press inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-colors ${on ? "font-semibold text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            style={on ? { background: "var(--app-primary)" } : undefined}
          >
            {t.icon && <t.icon className={`h-4 w-4 ${on ? "tab-pop" : ""}`} aria-hidden />}
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-white/25" : "bg-white text-slate-700"}`}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [theme, setTheme] = useState<React.CSSProperties>({});
  // La fenêtre est rendue hors du logiciel : elle reprend ses couleurs (variables CSS du thème).
  useLayoutEffect(() => {
    if (!anchor.current) return;
    const cs = getComputedStyle(anchor.current);
    setTheme({ "--app-primary": cs.getPropertyValue("--app-primary") || "#2563eb", "--app-accent": cs.getPropertyValue("--app-accent") } as React.CSSProperties);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // Rendu au niveau de la page : la fenêtre couvre tout l'écran, même ouverte depuis le panneau latéral.
  return (
    <>
    <span ref={anchor} hidden />
    {createPortal(
    <div style={theme} className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal aria-label={title} className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`} style={{ animation: "pop-in .2s ease both" }}>
        <div className="no-print flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
    )}
    </>
  );
}

/** Document imprimable (facture, reçu, devis) : seul ce contenu est imprimé. */
export function PrintDoc({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("printing-doc");
    return () => document.body.classList.remove("printing-doc");
  }, []);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="print-area print-doc text-sm text-slate-900">{children}</div>
      <div className="no-print mt-4 flex justify-end gap-2">
        <Btn kind="ghost" onClick={onClose}>Fermer</Btn>
        <Btn onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Imprimer / PDF</Btn>
      </div>
    </Modal>
  );
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const presets: { id: "today" | "week" | "month" | "year"; label: string }[] = [
    { id: "today", label: "Aujourd'hui" },
    { id: "week", label: "Semaine" },
    { id: "month", label: "Mois" },
    { id: "year", label: "Année" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const pp = periodPreset(p.id);
          const on = pp.from === value.from && pp.to === value.to;
          return (
            <button key={p.id} type="button" onClick={() => onChange(pp)} className={`tab-press rounded-lg px-2.5 py-1 text-xs ${on ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={on ? { background: "var(--app-primary)" } : undefined}>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 text-xs">
        <label className="sr-only" htmlFor="pfrom">Du</label>
        <input id="pfrom" type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" />
        <span>→</span>
        <label className="sr-only" htmlFor="pto">Au</label>
        <input id="pto" type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" />
      </div>
    </div>
  );
}

export function MemberSelect({ value, onChange, label = "Mécanicien", allowEmpty = true, disabled }: { value: string | null; onChange: (v: string | null) => void; label?: string; allowEmpty?: boolean; disabled?: boolean }) {
  const { g } = useG();
  return (
    <Field label={label} hint={g.members.length <= 1 ? "Invitez votre équipe (onglet Équipe du logiciel) pour attribuer le travail." : undefined}>
      <select className={inp} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
        {allowEmpty && <option value="">— Non attribué —</option>}
        {g.members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </Field>
  );
}

/** Clé d'idempotence d'un formulaire : un double clic ou un renvoi n'enregistre qu'une fois. */
export function useIdem() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())] as const;
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <>
      <label className="sr-only" htmlFor={`s-${placeholder}`}>{placeholder}</label>
      <input id={`s-${placeholder}`} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inp} />
    </>
  );
}

export function Row({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return onClick ? (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${active ? "border-[var(--app-primary)] bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
      {children}
    </button>
  ) : (
    <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">{children}</div>
  );
}

export function byId<T>(docs: Doc[], id: string | null | undefined): Doc<T> | undefined {
  return id ? (docs.find((d) => d.id === id) as Doc<T> | undefined) : undefined;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
