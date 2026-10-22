"use client";

import { Download, FileText, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatValue, toCsv } from "@/lib/records";
import { can, readonlyFields } from "@/lib/permissions";
import { ApiError } from "@/lib/fetcher";
import type { AppSpec, Entity, Role } from "@/lib/spec";
import { RecordForm } from "./RecordForm";
import type { Rec, useAppData } from "./useAppData";

type Data = ReturnType<typeof useAppData>;

export function EntityView({ spec, entity, role, data, notify, openRecordId }: { spec: AppSpec; entity: Entity; role: Role; data: Data; notify: (kind: "success" | "error" | "info", msg: string) => void; openRecordId?: string }) {
  const rows = data.records[entity.key] ?? [];
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<Rec | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rec | null>(null);
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
  }, [rows, q, filters, sort, entity]);

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

  return (
    <div className="print-area">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {entity.labelPlural}
          </h2>
          <p className="text-sm text-slate-500">{visible.length} fiche(s){visible.length !== rows.length ? ` sur ${rows.length}` : ""}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {spec.features.csvExport && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" disabled={!visible.length}>
              <Download className="h-4 w-4" aria-hidden />
              CSV
            </button>
          )}
          {spec.features.pdfExport && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" aria-hidden />
              PDF
            </button>
          )}
          {canCreate && (
            <button onClick={() => setEditing("new")} className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm" style={{ background: "var(--app-primary)" }}>
              + Ajouter
            </button>
          )}
        </div>
      </div>

      <div className="no-print mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`search-${entity.key}`}>Rechercher</label>
        <input id={`search-${entity.key}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 sm:max-w-xs" />
        {filterable.map((f) => (
          <select key={f.key} aria-label={`Filtrer par ${f.label}`} value={filters[f.key] ?? ""} onChange={(e) => setFilters((s) => ({ ...s, [f.key]: e.target.value }))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700">
            <option value="">{f.label} : tous</option>
            {(f.type === "boolean" ? ["true", "false"] : (f.options ?? [])).map((o) => (
              <option key={o} value={o}>{o === "true" ? "Oui" : o === "false" ? "Non" : o}</option>
            ))}
          </select>
        ))}
      </div>

      {data.loading ? (
        <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-200/70 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-2 font-medium text-slate-700">Aucune fiche pour l&apos;instant</p>
          {canCreate && <button onClick={() => setEditing("new")} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}>Ajouter la première</button>}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">Aucun résultat pour cette recherche.</p>
      ) : (
        <>
          {/* Ordinateur : tableau */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block print:block">
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
                  {(canUpdate || canDelete) && <th className="no-print px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.id} className={`text-slate-800 ${r.pending ? "opacity-60" : ""}`}>
                    {columns.map((c) => (
                      <td key={c.key} className="max-w-56 truncate px-4 py-3">{display(c.key, r.data[c.key])}</td>
                    ))}
                    {(canUpdate || canDelete) && (
                      <td className="no-print whitespace-nowrap px-4 py-3 text-right">
                        {r.pending ? (
                          <span className="text-xs text-amber-600">En attente d&apos;envoi</span>
                        ) : (
                          <>
                            {canUpdate && <button onClick={() => setEditing(r)} className="rounded-lg px-2 py-1 font-medium hover:bg-slate-100" style={{ color: "var(--app-primary)" }}>Modifier</button>}
                            {canDelete && <button onClick={() => setConfirmDelete(r)} className="ml-1 rounded-lg px-2 py-1 font-medium text-red-600 hover:bg-red-50">Supprimer</button>}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Téléphone : cartes */}
          <ul className="no-print mt-4 space-y-3 md:hidden">
            {visible.map((r) => (
              <li key={r.id} className={`rounded-2xl border border-slate-200 bg-white p-4 ${r.pending ? "opacity-60" : ""}`}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {columns.slice(0, 6).map((c, i) => (
                    <div key={c.key} className={i === 0 ? "col-span-2" : ""}>
                      <dt className="text-xs text-slate-600">{c.label}</dt>
                      <dd className={i === 0 ? "font-semibold text-slate-900" : "text-slate-700"}>{display(c.key, r.data[c.key])}</dd>
                    </div>
                  ))}
                </dl>
                {r.pending ? (
                  <p className="mt-3 text-xs text-amber-600">En attente d&apos;envoi (hors ligne)</p>
                ) : (
                  (canUpdate || canDelete) && (
                    <div className="mt-3 flex gap-2">
                      {canUpdate && <button onClick={() => setEditing(r)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium" style={{ color: "var(--app-primary)" }}>Modifier</button>}
                      {canDelete && <button onClick={() => setConfirmDelete(r)} className="flex-1 rounded-xl border border-red-100 py-2 text-sm font-medium text-red-600">Supprimer</button>}
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && <RecordForm entity={entity} record={editing === "new" ? undefined : editing} readonly={ro} related={related} onSubmit={save} onClose={() => setEditing(null)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900">
            <h2 id="del-title" className="font-semibold">Supprimer cette fiche ?</h2>
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
