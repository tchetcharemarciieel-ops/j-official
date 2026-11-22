"use client";

import { ArrowLeft, ChevronRight, ListChecks, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatValue } from "@/lib/records";
import { stationStats } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import type { AppSpec, Role, Station } from "@/lib/spec";
import { EntityView } from "../EntityView";
import { WidgetCard } from "../Widgets";
import type { Rec, useAppData } from "../useAppData";
import { KIND_ICONS } from "./kinds";

type Data = ReturnType<typeof useAppData>;

/** Phrase d'accueil de chaque type de poste (comme les écrans de zone du restaurant et de l'hôtel). */
const KIND_HINT: Record<string, string> = {
  salon_chair: "Rendez-vous, clientèle et prestations",
  cashier: "Ventes, paiements et encaissements",
  stock: "Produits, quantités et alertes de rupture",
  desk: "Équipe, dépenses, factures et documents",
  counter: "Comptoir : ventes et suivi au quotidien",
  reception: "Accueil, clients et réservations",
  classroom: "Élèves, classes et paiements",
  repair_bay: "Véhicules, interventions et avancement",
  vehicle: "Véhicules, entretien et disponibilité",
  kitchen: "Commandes, stock et préparation",
  dining: "Tables, commandes et service",
  bed: "Chambres, séjours et disponibilité",
  meeting: "Réunions et suivi d'équipe",
};

/**
 * Écran détaillé d'une zone du plan (salon, boutique, école, transport…) : indicateurs, actions rapides,
 * dernières fiches et alertes, puis le tableau complet. Remplace l'ouverture directe d'un simple tableau.
 */
export function StationPanel({ spec, stations, target, role, data, notify, onClose, onSelect }: {
  spec: AppSpec;
  stations: Station[];
  target: string;
  role: Role;
  data: Data;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  onClose: () => void;
  onSelect: (target: string) => void;
}) {
  const entity = spec.entities.find((e) => e.key === target);
  const station = stations.find((s) => s.target === target);
  const [view, setView] = useState<"home" | "list">("home");
  const [startNew, setStartNew] = useState(false);
  const [openRecord, setOpenRecord] = useState<string | undefined>();
  useEffect(() => { setView("home"); setStartNew(false); setOpenRecord(undefined); }, [target]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (view === "list" ? setView("home") : onClose());
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [view, onClose]);
  const rows = useMemo(() => (entity ? (data.records[entity.key] ?? []) : []), [data.records, entity]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)), [rows]);
  if (!entity) return null;
  const stats = stationStats(spec, entity.key, rows.map((r) => ({ id: r.id, data: r.data, created_at: r.created_at })));
  const Icon = station ? KIND_ICONS[station.kind] : ListChecks;
  const titleField = entity.fields.find((f) => f.type === "text") ?? entity.fields[0]!;
  const extra = entity.fields.filter((f) => f.key !== titleField.key && f.showInTable).slice(0, 2);
  const widgets = spec.dashboard.filter((w) => w.entity === entity.key && w.type !== "recent").slice(0, 3);
  const canCreate = can(entity, role, "create");
  const hint = (station && KIND_HINT[station.kind]) || entity.description || `${entity.labelPlural} de votre entreprise`;
  const readable = stations.filter((s) => s.target !== "__dashboard" && spec.entities.some((e) => e.key === s.target));
  const row = (title: string, text: string, I: typeof Plus, onClick: () => void, tone = "bg-slate-100 text-slate-600") => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition active:scale-[0.99] sm:hover:border-slate-300">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><I className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-slate-900">{title}</span><span className="block text-xs leading-snug text-slate-500">{text}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={entity.labelPlural} className="flex h-full w-full flex-col bg-slate-50 shadow-2xl sm:max-w-xl">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          {view === "list" ? (
            <button onClick={() => setView("home")} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Retour à la zone"><ArrowLeft className="h-5 w-5" /></button>
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: "var(--app-primary)" }}><Icon className="h-5 w-5" aria-hidden /></span>
          )}
          <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold text-slate-900">{view === "list" ? entity.labelPlural : (station?.label ?? entity.labelPlural)}</h2><p className="truncate text-xs text-slate-500">{view === "list" ? `${rows.length} fiche(s)` : hint}</p></div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>
        {view === "home" && readable.length > 1 && (
          <nav aria-label="Zones" className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
            {readable.map((s) => {
              const SI = KIND_ICONS[s.kind];
              const on = s.target === target;
              return (
                <button key={s.id} onClick={() => onSelect(s.target)} aria-current={on ? "true" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? "border-[var(--app-primary)] font-semibold text-slate-900 ring-1 ring-[var(--app-primary)]" : "border-slate-200 text-slate-600"}`}><SI className="h-4 w-4" aria-hidden />{s.label}</button>
              );
            })}
          </nav>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {view === "list" ? (
            <EntityView key={`${entity.key}:${startNew}:${openRecord ?? ""}`} spec={spec} entity={entity} role={role} data={data} notify={notify} openRecordId={openRecord} startNew={startNew} />
          ) : (
            <div className="space-y-3">
              {stats && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{entity.labelPlural}</p><p className="mt-0.5 text-2xl font-bold">{stats.total}</p></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Aujourd&apos;hui</p><p className="mt-0.5 text-2xl font-bold">{stats.today}</p></div>
                  {stats.open !== null && <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">En cours</p><p className="mt-0.5 text-2xl font-bold">{stats.open}</p></div>}
                  {stats.amountToday !== null && stats.amountToday > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Montant du jour</p><p className="mt-0.5 text-xl font-bold">{stats.amountToday.toLocaleString("fr-FR")} FCFA</p></div>}
                </div>
              )}
              {canCreate && row(`Ajouter : ${entity.label}`, "Nouvelle fiche, en quelques secondes", Plus, () => { setStartNew(true); setView("list"); }, "bg-pink-50 text-pink-600")}
              {row(`Voir : ${entity.labelPlural}`, `${rows.length} fiche(s) · recherche, filtres, export`, ListChecks, () => { setStartNew(false); setOpenRecord(undefined); setView("list"); })}
              {stats && stats.alert > 0 && row("Alertes de stock", `${stats.alert} article(s) presque épuisé(s)`, TriangleAlert, () => { setStartNew(false); setView("list"); }, "bg-amber-50 text-amber-600")}
              {widgets.length > 0 && <div className="grid gap-2.5 sm:grid-cols-2">{widgets.map((w, i) => <WidgetCard key={`${w.label}-${i}`} spec={spec} widget={w} rows={rows.map((r) => ({ id: r.id, data: r.data, created_at: r.created_at }))} />)}</div>}
              <section aria-label="Dernières fiches">
                <h3 className="mb-1.5 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dernières fiches</h3>
                {sorted.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">Aucune fiche pour l&apos;instant.</p> : (
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {sorted.slice(0, 6).map((r: Rec) => (
                      <li key={r.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => { setStartNew(false); setOpenRecord(r.id); setView("list"); }}>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{formatValue(titleField, r.data[titleField.key]) || "—"}</span>{extra.length > 0 && <span className="block truncate text-xs text-slate-500">{extra.map((f) => formatValue(f, r.data[f.key])).filter(Boolean).join(" · ")}</span>}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      </button></li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
