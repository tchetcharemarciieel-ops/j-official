"use client";

import { Loader2, Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Éléments d'interface de MiniSoft Shop : sobres, lisibles sur téléphone, sans dépendance. */

export const fcfa = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("fr-FR")} FCFA`);
export const qtyFmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("fr-FR") : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));
export const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
export const timeFmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const opKey = (p: string) => `${p}-${crypto.randomUUID()}`;

export function Card({ title, subtitle, action, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "slate", onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "slate" | "green" | "amber" | "red" | "blue"; onClick?: () => void }) {
  const tones = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700" };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm ${onClick ? "transition hover:border-slate-300 hover:shadow" : ""}`}>
      {Icon && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className="mt-0.5 block truncate text-lg font-bold text-slate-900">{value}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </Tag>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const tones = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800" };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-slate-400" aria-hidden />
      <p className="mt-3 font-medium text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = "Rechercher…", autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input className="input !pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-sm">
      <button className="btn btn-ghost !px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button>
      <span className="text-slate-600">Page {page} / {pages}</span>
      <button className="btn btn-ghost !px-3 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button>
    </div>
  );
}

export function paginate<T>(rows: T[], page: number, size = 20) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
}

export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="En cours" /> : <>{children}</>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${value === k ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Graphique en barres (SVG), valeurs réelles uniquement ; aucune barre quand il n'y a pas de vente. */
export function Bars({ data, color = "#2563eb", height = 160 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  const step = Math.ceil(data.length / 8);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Graphique des ventes">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 2 - 4);
          return (
            <rect key={i} x={i * w + w * 0.15} y={height / 2 - h} width={w * 0.7} height={Math.max(h, d.value > 0 ? 0.8 : 0)} rx={0.8} fill={color} opacity={0.85}>
              <title>{`${d.label} : ${fcfa(d.value)}`}</title>
            </rect>
          );
        })}
        <line x1="0" x2="100" y1={height / 2 - 0.2} y2={height / 2 - 0.2} stroke="#e2e8f0" strokeWidth="0.4" />
      </svg>
      <div className="mt-1 flex text-[10px] text-slate-500">
        {data.map((d, i) => (
          <span key={i} style={{ width: `${w}%` }} className="truncate text-center">
            {i % step === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([type.startsWith("text/csv") ? "﻿" + text : text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c === null || c === undefined ? "" : String(c);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
}
