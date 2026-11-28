"use client";

import { ChevronRight, Download, FileText, History, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatValue, toCsv } from "@/lib/records";
import { can, readonlyFields } from "@/lib/permissions";
import { api, ApiError } from "@/lib/fetcher";
import { initials, interactionsFor, moduleStats, relatedFields, statusField, statusTone, type Stat } from "@/lib/crm";
import { ago } from "@/lib/dashboard-stats";
import { kindOf } from "@/lib/module-kinds";
import type { AppSpec, Entity, Field, Role } from "@/lib/spec";
import { RecordForm } from "./RecordForm";
import type { Rec, useAppData } from "./useAppData";

type Data = ReturnType<typeof useAppData>;

export function EntityView({ spec, entity, role, data, notify, openRecordId, startNew = false, projectId, mode }: { projectId?: string; mode?: "demo" | "live" | "local"; startNew?: boolean; spec: AppSpec; entity: Entity; role: Role; data: Data; notify: (kind: "success" | "error" | "info", msg: string) => void; openRecordId?: string }) {
  const rows = data.records[entity.key] ?? [];
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<Rec | "new" | null>(startNew && can(entity, role, "create") ? "new" : null);
  const [confirmDelete, setConfirmDelete] = useState<Rec | null>(null);
  const [detail, setDetail] = useState<Rec | null>(null);
  const [limit, setLimit] = useState(50);
  const [chip, setChip] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  // Fiche demandée depuis l'espace de travail : ouverte dès que les données sont chargées.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!openRecordId || opened) return;
    const rec = rows.find((r) => r.id === openRecordId);
    if (!rec) return;
    setOpened(true);
    if (can(entity, role, "update")) setEditing(rec);
    else {
      const title = entity.fields.find((f) => f.type === "text") ?? entity.fields[0];
      if (title) setQ(String(rec.data[title.key] ?? ""));
    }
  }, [openRecordId, opened, rows, entity, role]);

  const columns = entity.fields.filter((f) => f.showInTable);
  const filterable = entity.fields.filter((f) => f.type === "select" || f.type === "boolean");
  const ro = readonlyFields(entity, role);
  const kind = useMemo(() => kindOf(entity), [entity]);
  const activeChip = kind?.chips.find((c) => c.id === chip) ?? null;
  const canCreate = can(entity, role, "create");
  const canUpdate = can(entity, role, "update");
  const canDelete = can(entity, role, "delete");

  // Libellés des fiches liées (relations)
  const related = useMemo(() => {
    const out: Record<string, { id: string; label: string }[]> = {};
    for (const f of entity.fields) {
      if (f.type !== "relation" || !f.relation) continue;
      const target = spec.entities.find((e) => e.key === f.relation);
      const title = target?.fields.find((x) => x.type === "text") ?? target?.fields[0];
      out[f.relation] = (data.records[f.relation] ?? []).map((r) => ({ id: r.id, label: String(r.data[title?.key ?? ""] ?? r.id.slice(0, 8)) }));
    }
    return out;
  }, [entity, spec, data.records]);

  const display = (key: string, value: unknown) => {
    const f = entity.fields.find((x) => x.key === key)!;
    if (f.type === "relation") return related[f.relation ?? ""]?.find((o) => o.id === value)?.label ?? (value ? "—" : "—");
    return formatValue(f, value);
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (needle && !entity.fields.some((f) => String(r.data[f.key] ?? "").toLowerCase().includes(needle))) return false;
      for (const [k, v] of Object.entries(filters)) if (v && String(r.data[k] ?? "") !== v) return false;
      if (activeChip && !activeChip.test({ id: r.id, data: r.data, created_at: r.created_at }, new Date())) return false;
      return true;
    });
    if (sort) {
      const f = entity.fields.find((x) => x.key === sort.key);
      const numeric = f && ["number", "money"].includes(f.type);
      list = [...list].sort((a, b) => {
        const av = a.data[sort.key];
        const bv = b.data[sort.key];
        const c = numeric ? Number(av ?? 0) - Number(bv ?? 0) : String(av ?? "").localeCompare(String(bv ?? ""), "fr");
        return c * sort.dir;
      });
    }
    return list;
  }, [rows, q, filters, sort, entity, activeChip]);

  async function save(values: Record<string, unknown>) {
    try {
      if (editing === "new") {
        const r = await data.create(entity.key, values);
        notify(r.queued ? "info" : "success", r.queued ? "Hors ligne : fiche gardée sur l'appareil, elle sera envoyée au retour du réseau." : `${entity.label} ajouté(e).`);
      } else if (editing) {
        await data.update(editing, values);
        notify("success", "Modifications enregistrées.");
      }
      setEditing(null);
    } catch (e) {
      if (e instanceof ApiError && e.body.fieldErrors) return e.body.fieldErrors as Record<string, string>;
      if (e instanceof ApiError && e.body.conflict) {
        notify("error", e.message + " La fiche a été rechargée.");
        await data.reload();
        setEditing(null);
        return;
      }
      notify("error", e instanceof Error ? e.message : "Erreur");
    }
  }

  async function doDelete(r: Rec) {
    try {
      await data.remove(r);
      notify("success", "Fiche supprimée.");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erreur");
    }
    setConfirmDelete(null);
  }

  function exportCsv() {
    const blob = new Blob(["﻿" + toCsv(entity, visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entity.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sf = statusField(entity);
  const titleField = entity.fields.find((f) => f.type === "text") ?? entity.fields[0];
  const titleOf = (r: Rec) => String(r.data[titleField?.key ?? ""] ?? "").trim() || entity.label;
  const moneyCol = columns.find((c) => c.type === "money");
  const subFields = columns.filter((c) => c.key !== titleField?.key && c.key !== sf?.key && c.key !== moneyCol?.key).slice(0, 2);
  const stats = useMemo(() => (kind ? kind.stats(rows.map((r) => ({ id: r.id, data: r.data, created_at: r.created_at })), new Date()) : moduleStats(spec, entity, rows, data.records)), [kind, spec, entity, rows, data.records]);
  const asRow = (r: Rec) => ({ id: r.id, data: r.data, created_at: r.created_at });
  const fcfa = (x: number) => `${x.toLocaleString("fr-FR")} FCFA`;
  const filtersOn = Boolean(q.trim()) || Object.values(filters).some(Boolean) || Boolean(chip);
  const sortable = columns.length ? columns : entity.fields.slice(0, 1);
  const TONE: Record<Stat["tone"], string> = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" };
  const BADGE = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700", slate: "bg-slate-100 text-slate-600" };
  const cell = (c: Field, r: Rec) => {
    const text = display(c.key, r.data[c.key]);
    if (c.type === "select" && r.data[c.key]) return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[statusTone(r.data[c.key])]}`}>{text}</span>;
    if (c.type === "money") return <span className="font-semibold text-slate-900">{text}</span>;
    if (kind?.id === "stock" && c.key === "quantite") {
      const q = Number(r.data.quantite) || 0, low = r.data.seuil === undefined || r.data.seuil === "" ? 5 : Number(r.data.seuil) || 0;
      const pct = Math.min(100, Math.round((q / Math.max(1, low * 3)) * 100));
      return <span className="flex items-center gap-2"><span className="w-8 font-semibold text-slate-900">{text}</span><span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 lg:block"><span className={`block h-full rounded-full ${q <= 0 ? "bg-red-500" : q <= low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(q > 0 ? 6 : 0, pct)}%` }} /></span></span>;
    }
    return text;
  };

  return (
    <div className="print-area">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-slate-200" aria-hidden>{entity.icon}</span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-slate-900">{entity.labelPlural}</h2>
            <p className="truncate text-sm text-slate-500">{entity.description || `${rows.length} fiche(s) enregistrée(s)`}</p>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {spec.features.csvExport && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!visible.length}>
              <Download className="h-4 w-4" aria-hidden />CSV
            </button>
          )}
          {spec.features.pdfExport && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" aria-hidden />PDF
            </button>
          )}
          {canCreate && (
            <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]" style={{ background: "var(--app-primary)" }}>
              <Plus className="h-4 w-4" aria-hidden />Ajouter
            </button>
          )}
        </div>
      </div>

      {!data.loading && rows.length > 0 && (
        <div className="no-print mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((st) => (
            <div key={st.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <span className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold ${TONE[st.tone]}`}>{st.label}</span>
              <p className="mt-2 truncate text-xl font-bold text-slate-900 sm:text-2xl">{st.value.toLocaleString("fr-FR")}{st.unit && <span className="ml-1 text-xs font-medium text-slate-500">{st.unit}</span>}</p>
              {st.hint && <p className="mt-0.5 text-[11px] text-slate-400">{st.hint}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="no-print mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label className="sr-only" htmlFor={`search-${entity.key}`}>Rechercher</label>
          <input id={`search-${entity.key}`} value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} placeholder={`Rechercher ${entity.labelPlural.toLowerCase()}…`} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-slate-900 placeholder:text-slate-400" />
        </div>
        <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 lg:hidden">Filtres et tri{filtersOn ? <span className="h-2 w-2 rounded-full" style={{ background: "var(--app-primary)" }} /> : null}</button>
        <div className={`${showFilters ? "flex" : "hidden"} flex-wrap gap-2 lg:flex`}>
          {filterable.map((f) => (
            <select key={f.key} aria-label={`Filtrer par ${f.label}`} value={filters[f.key] ?? ""} onChange={(e) => { setFilters((s) => ({ ...s, [f.key]: e.target.value })); setLimit(50); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
              <option value="">{f.label} : tous</option>
              {(f.type === "boolean" ? ["true", "false"] : (f.options ?? [])).map((o) => <option key={o} value={o}>{o === "true" ? "Oui" : o === "false" ? "Non" : o}</option>)}
            </select>
          ))}
          <select aria-label="Trier par" value={sort ? `${sort.key}:${sort.dir}` : ""} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort(k ? { key: k, dir: d === "-1" ? -1 : 1 } : null); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
            <option value="">Tri : plus récents</option>
            {sortable.flatMap((c) => [<option key={`${c.key}a`} value={`${c.key}:1`}>{c.label} ↑</option>, <option key={`${c.key}d`} value={`${c.key}:-1`}>{c.label} ↓</option>])}
          </select>
          {filtersOn && <button onClick={() => { setQ(""); setFilters({}); setChip(null); }} className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden />Effacer</button>}
        </div>
        <p className="text-sm text-slate-500 lg:ml-auto">{visible.length} sur {rows.length}</p>
      </div>

      {kind && kind.chips.length > 0 && rows.length > 0 && (
        <div className="no-print mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtres rapides">
          <button onClick={() => { setChip(null); setLimit(50); }} aria-pressed={!chip} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${!chip ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`} style={!chip ? { background: "var(--app-primary)" } : undefined}>Tous <span className="opacity-70">{rows.length}</span></button>
          {kind.chips.map((c) => {
            const count = rows.filter((r) => c.test(asRow(r), new Date())).length;
            const on = chip === c.id;
            return <button key={c.id} onClick={() => { setChip(on ? null : c.id); setLimit(50); }} aria-pressed={on} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`} style={on ? { background: "var(--app-primary)" } : undefined}>{c.label} <span className="opacity-70">{count}</span></button>;
          })}
        </div>
      )}

      {data.loading ? (
        <div className="mt-6 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200/70" />)}</div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="text-3xl" aria-hidden>{entity.icon}</span>
          <p className="mt-2 font-medium text-slate-800">Aucun(e) {entity.label.toLowerCase()} pour l&apos;instant</p>
          <p className="mt-1 text-sm text-slate-500">Les fiches que vous ajoutez sont enregistrées et comptées dans votre tableau de bord.</p>
          {canCreate && <button onClick={() => setEditing("new")} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}>Ajouter le premier</button>}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">Aucun résultat : modifiez la recherche ou les filtres.</p>
      ) : (
        <>
          {/* Ordinateur et tablette : tableau */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block print:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button className="font-semibold uppercase hover:text-slate-800" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>
                        {c.label} {sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : ""}
                      </button>
                    </th>
                  ))}
                  <th className="no-print w-28 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.slice(0, limit).map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)} className={`cursor-pointer text-slate-800 transition-colors hover:bg-slate-50/80 ${r.pending ? "opacity-60" : ""}`}>
                    {columns.map((c, i) => (
                      <td key={c.key} className="max-w-60 truncate px-4 py-3">
                        {i === 0 ? (
                          <span className="flex items-center gap-3">{c.key === titleField?.key ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--app-primary)" }} aria-hidden>{initials(titleOf(r))}</span> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-base" aria-hidden>{entity.icon}</span>}<span className="truncate font-medium text-slate-900">{cell(c, r)}</span>{kind?.badge?.(asRow(r), new Date()) && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[kind.badge(asRow(r), new Date())!.tone]}`}>{kind.badge(asRow(r), new Date())!.label}</span>}</span>
                        ) : cell(c, r)}
                      </td>
                    ))}
                    <td className="no-print whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {r.pending ? <span className="text-xs text-amber-600">En attente</span> : (
                        <>
                          {canUpdate && <button onClick={() => setEditing(r)} aria-label={`Modifier ${titleOf(r)}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" aria-hidden /></button>}
                          {canDelete && <button onClick={() => setConfirmDelete(r)} aria-label={`Supprimer ${titleOf(r)}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden /></button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Téléphone : liste de cartes compactes */}
          <ul className="no-print mt-4 space-y-2 md:hidden">
            {visible.slice(0, limit).map((r) => (
              <li key={r.id}>
                <button onClick={() => setDetail(r)} className={`flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] ${r.pending ? "opacity-60" : ""}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: "var(--app-primary)" }} aria-hidden>{initials(titleOf(r))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{titleOf(r)}</span>
                    <span className="block truncate text-xs text-slate-500">{subFields.map((c) => display(c.key, r.data[c.key])).filter((v) => v && v !== "—").join(" · ") || entity.label}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {moneyCol && r.data[moneyCol.key] !== undefined && r.data[moneyCol.key] !== "" && <span className="text-sm font-bold text-slate-900">{display(moneyCol.key, r.data[moneyCol.key])}</span>}
                    {kind?.badge?.(asRow(r), new Date()) ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[kind.badge(asRow(r), new Date())!.tone]}`}>{kind.badge(asRow(r), new Date())!.label}</span> : sf && r.data[sf.key] ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[statusTone(r.data[sf.key])]}`}>{String(r.data[sf.key])}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {kind?.footer && kind.footer(visible.map(asRow), fcfa) && <p className="no-print mt-3 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">{kind.footer(visible.map(asRow), fcfa)}</p>}
          {visible.length > limit && <div className="no-print mt-4 text-center"><button onClick={() => setLimit((n) => n + 50)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Afficher plus ({visible.length - limit} restants)</button></div>}
        </>
      )}

      {detail && (
        <DetailSheet
          spec={spec} entity={entity} rec={rows.find((r) => r.id === detail.id) ?? detail} records={data.records} display={display} titleOf={titleOf} projectId={projectId} mode={mode}
          canUpdate={canUpdate} canDelete={canDelete}
          onClose={() => setDetail(null)} onEdit={() => { setEditing(rows.find((r) => r.id === detail.id) ?? detail); setDetail(null); }} onDelete={() => { setConfirmDelete(detail); setDetail(null); }}
        />
      )}
      {editing && <RecordForm entity={entity} record={editing === "new" ? undefined : editing} readonly={ro} related={related} onSubmit={save} onClose={() => setEditing(null)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" style={{ animation: "pop-in 0.18s ease-out" }}>
            <h2 id="del-title" className="font-semibold">Supprimer « {titleOf(confirmDelete)} » ?</h2>
            <p className="mt-1 text-sm text-slate-500">Cette action est enregistrée dans l&apos;historique. Les sauvegardes permettent de restaurer les données.</p>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-xl border border-slate-200 py-2" onClick={() => setConfirmDelete(null)} autoFocus>Annuler</button>
              <button className="flex-1 rounded-xl bg-red-600 py-2 font-semibold text-white" onClick={() => doDelete(confirmDelete)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Hist = { action: "create" | "update" | "delete"; at: string; by: string; changes: { field: string; from: string; to: string }[] };

/** Fiche détaillée : coordonnées et informations, interactions avec les autres modules, historique des modifications. */
function DetailSheet({ spec, entity, rec, records, display, titleOf, projectId, mode, canUpdate, canDelete, onClose, onEdit, onDelete }: { spec: AppSpec; entity: Entity; rec: Rec; records: Record<string, Rec[]>; display: (key: string, value: unknown) => React.ReactNode; titleOf: (r: Rec) => string; projectId?: string; mode?: "demo" | "live" | "local"; canUpdate: boolean; canDelete: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<"infos" | "interactions" | "historique">("infos");
  const [hist, setHist] = useState<Hist[] | null>(null);
  const inter = useMemo(() => interactionsFor(spec, entity, rec.id, records), [spec, entity, rec.id, records]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (tab !== "historique" || hist || !projectId || !mode || mode === "local") return;
    api<{ history: Hist[] }>(`/api/apps/${projectId}/records/${rec.id}/history?mode=${mode}`).then((r) => setHist(r.history)).catch(() => setHist([]));
  }, [tab, hist, projectId, mode, rec.id]);
  const sf = statusField(entity);
  const tabs: ["infos" | "interactions" | "historique", string][] = [["infos", "Détails"], ...(relatedFields(spec, entity).length ? [["interactions", `Interactions${inter.length ? ` (${inter.length})` : ""}`] as ["interactions", string]] : []), ["historique", "Historique"]];
  return (
    <div className="no-print fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 md:items-stretch md:justify-end" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Fiche : ${titleOf(rec)}`} className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-h-none md:w-[28rem] md:rounded-none" style={{ animation: "sheet-in 0.22s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-bold text-white" style={{ background: "var(--app-primary)" }} aria-hidden>{initials(titleOf(rec))}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{titleOf(rec)}</h2>
            <p className="flex items-center gap-2 text-xs text-slate-500">{entity.label} · ajouté(e) {ago(rec.created_at)}{sf && rec.data[sf.key] ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${{ green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700", slate: "bg-slate-100 text-slate-600" }[statusTone(rec.data[sf.key])]}`}>{String(rec.data[sf.key])}</span> : null}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div role="tablist" className="flex gap-1 border-b border-slate-100 px-3 pt-2">
          {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-t-lg px-3 py-2 text-sm font-medium ${tab === id ? "border-b-2 text-slate-900" : "text-slate-500 hover:text-slate-800"}`} style={tab === id ? { borderColor: "var(--app-primary)" } : undefined}>{label}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "infos" && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {entity.fields.map((f) => (
                <div key={f.key} className={f.type === "longtext" ? "col-span-2" : ""}>
                  <dt className="text-xs text-slate-500">{f.label}</dt>
                  <dd className="mt-0.5 break-words font-medium text-slate-900">{f.type === "phone" && rec.data[f.key] ? <a className="underline" href={`tel:${String(rec.data[f.key])}`}>{String(rec.data[f.key])}</a> : f.type === "email" && rec.data[f.key] ? <a className="underline" href={`mailto:${String(rec.data[f.key])}`}>{String(rec.data[f.key])}</a> : display(f.key, rec.data[f.key]) || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === "interactions" && (inter.length === 0 ? <p className="text-sm text-slate-600">Aucune interaction pour l&apos;instant : les fiches des autres modules liées à celle-ci (ventes, commandes, rendez-vous…) apparaîtront ici.</p> : (
            <ul className="space-y-1">{inter.map((i) => <li key={`${i.entity}-${i.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100" aria-hidden>{i.icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{i.title}</span><span className="block truncate text-xs text-slate-500">{i.entityLabel}{i.detail ? ` · ${i.detail}` : ""}</span></span><span className="shrink-0 text-xs text-slate-400">{ago(i.at)}</span></li>)}</ul>
          ))}
          {tab === "historique" && (
            <div className="space-y-3 text-sm">
              {mode === "local" || !projectId ? (
                <p className="text-slate-600">Créé(e) {ago(rec.created_at)}{rec.updated_at !== rec.created_at ? `, modifié(e) ${ago(rec.updated_at)}` : ""}. L&apos;historique détaillé est conservé sur les logiciels en ligne.</p>
              ) : hist === null ? <div className="h-16 animate-pulse rounded-xl bg-slate-100" /> : hist.length === 0 ? <p className="text-slate-600">Aucun historique enregistré.</p> : hist.map((h, i) => (
                <div key={i} className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><History className="h-3.5 w-3.5" aria-hidden /></span>
                  <div className="min-w-0"><p className="font-medium text-slate-900">{h.action === "create" ? "Création" : h.action === "delete" ? "Suppression" : "Modification"} <span className="font-normal text-slate-500">· {h.by} · {ago(h.at)}</span></p>
                    {h.changes.map((c) => <p key={c.field} className="text-xs text-slate-600">{c.field} : <s className="text-slate-400">{c.from}</s> → <b>{c.to}</b></p>)}</div></div>
              ))}
            </div>
          )}
        </div>
        {(canUpdate || canDelete) && (
          <div className="flex gap-2 border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {canUpdate && <button onClick={onEdit} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}>Modifier</button>}
            {canDelete && <button onClick={onDelete} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">Supprimer</button>}
          </div>
        )}
      </aside>
    </div>
  );
}
