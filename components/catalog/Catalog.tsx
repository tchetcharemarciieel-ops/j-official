"use client";

import { ArrowRight, Boxes, Briefcase, Check, Hotel, LayoutGrid, Pill, ShoppingCart, Sparkles, Truck, UtensilsCrossed, Wrench, GraduationCap, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Icônes disponibles pour le catalogue (clé texte : les éléments peuvent venir d'une page serveur). */
const ICONS: Record<string, LucideIcon> = { shop: ShoppingCart, bureau: Briefcase, transport: Truck, custom: Sparkles, restaurant: UtensilsCrossed, garage: Wrench, hotel: Hotel, pharmacie: Pill, ecole: GraduationCap, stock: Boxes, default: LayoutGrid };
const TONES: Record<string, string> = { blue: "bg-blue-50 text-blue-600", indigo: "bg-indigo-50 text-indigo-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600", rose: "bg-rose-50 text-rose-600" };

export type CatalogItem = {
  id: string;
  icon: string;
  tone?: keyof typeof TONES;
  name: string;
  /** Description courte : 2 lignes au maximum dans la carte. */
  short: string;
  /** Fonctionnalités principales : 3 affichées dans la carte. */
  features: string[];
  /** Libellé du bouton de la carte (« Découvrir » par défaut). */
  cta?: string;
  /** Si renseigné, la carte est un simple lien (pas de fenêtre de présentation). */
  href?: string;
  /** Présentation détaillée (fenêtre modale). */
  detail?: { description: string; features: string[]; benefits: string[]; extra?: ReactNode };
};

export const CATALOG_GRID = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4";

const CARD = "group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition duration-200 motion-reduce:transition-none sm:p-3.5 sm:hover:-translate-y-0.5 sm:hover:border-blue-300 sm:hover:shadow-md active:scale-[0.98] active:bg-slate-50 motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]";

export function CatalogCard({ item, onOpen }: { item: CatalogItem; onOpen?: (i: CatalogItem) => void }) {
  const Icon = ICONS[item.icon] ?? ICONS.default!;
  const body = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${TONES[item.tone ?? "blue"]}`}><Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden /></span>
      <span className="mt-2 block text-[13px] font-semibold leading-tight text-slate-900 sm:text-sm">{item.name}</span>
      <span className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-600 sm:text-xs">{item.short}</span>
      <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600 sm:text-xs">
        {item.features.slice(0, 3).map((f) => (
          <li key={f} className="flex items-start gap-1"><Check className="mt-[2px] h-3 w-3 shrink-0 text-emerald-600" aria-hidden /><span className="line-clamp-1">{f}</span></li>
        ))}
      </ul>
      <span className="mt-auto pt-2.5">
        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition group-hover:bg-blue-700">{item.cta ?? "Découvrir"}<ArrowRight className="h-3 w-3 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5" aria-hidden /></span>
      </span>
    </>
  );
  if (item.href) return <Link href={item.href} id={item.id} className={`${CARD} scroll-mt-24`} aria-label={`${item.cta ?? "Découvrir"} ${item.name}`}>{body}</Link>;
  return <button type="button" id={item.id} className={`${CARD} scroll-mt-24`} onClick={() => onOpen?.(item)} aria-haspopup="dialog" aria-label={`${item.cta ?? "Découvrir"} ${item.name}`}>{body}</button>;
}

/** Fenêtre de présentation détaillée : feuille en bas sur téléphone, fenêtre centrée ailleurs. */
export function CatalogModal({ item, onClose, children, footer }: { item: CatalogItem; onClose: () => void; children?: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ICONS[item.icon] ?? ICONS.default!;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  const d = item.detail;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item.name} className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:max-w-xl sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[item.tone ?? "blue"]}`}><Icon className="h-5 w-5" aria-hidden /></span>
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">{item.name}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children ?? (d && (
            <div className="space-y-4 text-sm">
              <p className="leading-relaxed text-slate-700">{d.description}</p>
              <section><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fonctionnalités</h3><ul className="mt-1.5 grid gap-1 sm:grid-cols-2">{d.features.map((f) => <li key={f} className="flex items-start gap-1.5 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}</ul></section>
              <section><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avantages</h3><ul className="mt-1.5 space-y-1">{d.benefits.map((f) => <li key={f} className="flex items-start gap-1.5 text-slate-700"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />{f}</li>)}</ul></section>
              {d.extra}
            </div>
          ))}
        </div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">{footer}</footer>}
      </div>
    </div>
  );
}

/** Catalogue simple : cartes compactes et fenêtre de présentation ; `actions` fournit le bouton principal de chaque fiche. */
export function Catalog({ items, actions }: { items: CatalogItem[]; actions?: Record<string, ReactNode> }) {
  const [open, setOpen] = useState<CatalogItem | null>(null);
  return (
    <>
      <div className={CATALOG_GRID}>{items.map((i) => <CatalogCard key={i.id} item={i} onOpen={setOpen} />)}</div>
      {open && <CatalogModal item={open} onClose={() => setOpen(null)} footer={actions?.[open.id]} />}
    </>
  );
}
