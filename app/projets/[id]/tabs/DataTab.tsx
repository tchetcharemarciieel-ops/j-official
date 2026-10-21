"use client";

import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { detectColumns, prepareValue, type ColumnInfo } from "@/lib/csv";
import { readTabular, type Tabular } from "@/lib/file-read";
import { fmtDateTime } from "@/lib/status";
import { normalize } from "@/lib/generator";
import type { AppSpec } from "@/lib/spec";
import { Panel, type WorkspaceData } from "../Workspace";

type DryRun = { valid: number; invalid: number; errors: { line: number; errors: Record<string, string> }[]; sensitive: boolean };

export function DataTab({ data, spec, onChanged }: { data: WorkspaceData; spec: AppSpec; onChanged: () => void }) {
  const toast = useToast();
  const live = Boolean(data.project.publishedVersion);
  const [file, setFile] = useState<(Tabular & { columns: ColumnInfo[]; name: string }) | null>(null);
  const [entity, setEntity] = useState(spec.entities[0]!.key);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [dry, setDry] = useState<DryRun | null>(null);
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = spec.entities.find((e) => e.key === entity)!;

  function autoMap(cols: ColumnInfo[], key: string) {
    const ent = spec.entities.find((e) => e.key === key)!;
    const m: Record<string, string> = {};
    for (const c of cols) {
      const n = normalize(c.name);
      const f = ent.fields.find((x) => normalize(x.label) === n || x.key === n.replace(/[^a-z0-9]+/g, "_")) ?? ent.fields.find((x) => n.includes(normalize(x.label)));
      if (f && !Object.values(m).includes(f.key)) m[c.name] = f.key;
    }
    setMapping(m);
  }

  async function onFile(f?: File) {
    if (!f) return;
    setDry(null);
    try {
      const t = await readTabular(f);
      const columns = detectColumns(t.header, t.rows);
      setFile({ ...t, columns, name: f.name });
      autoMap(columns, entity);
      if (t.truncated) toast("info", "Seules les 2000 premières lignes seront importées.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Fichier illisible.");
    }
  }

  function rows() {
    if (!file) return [];
    return file.rows.map((r) => Object.fromEntries(file.header.map((h, i) => {
      const key = mapping[file.columns[i]!.name];
      const field = target.fields.find((x) => x.key === key);
      return [file.columns[i]!.name, prepareValue(field?.type ?? "text", r[i] ?? "")];
    })));
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const body = { mode, entity, mapping, rows: rows(), dryRun, confirmSensitive };
      if (dryRun) setDry(await api<DryRun>(`/api/apps/${data.project.id}/import`, { body }));
      else {
        const r = await api<{ imported: number; skipped: number }>(`/api/apps/${data.project.id}/import`, { body });
        toast("success", `${r.imported} fiche(s) importée(s)${r.skipped ? `, ${r.skipped} ligne(s) ignorée(s)` : ""}.`);
        setFile(null);
        setDry(null);
        onChanged();
      }
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function backup() {
    setBusy(true);
    try {
      await api(`/api/projects/${data.project.id}/backups`, { body: {} });
      toast("success", "Sauvegarde créée.");
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string, label: string) {
    if (!confirm(`Restaurer « ${label} » ? Les données réelles actuelles seront remplacées. Une sauvegarde de l'état actuel est faite avant.`)) return;
    setBusy(true);
    try {
      const r = await api<{ count: number }>(`/api/projects/${data.project.id}/backups/${id}/restore`, { body: { confirm: true } });
      toast("success", `${r.count} fiche(s) restaurée(s).`);
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Importer un fichier Excel ou CSV" subtitle="Aperçu des colonnes, détection des types et des erreurs, correspondance des champs : rien n'est importé avant votre confirmation.">
        <input type="file" accept=".csv,.xlsx" aria-label="Fichier à importer" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-900" />
        {file && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Table de destination</span>
                <select className="input" value={entity} onChange={(e) => { setEntity(e.target.value); autoMap(file.columns, e.target.value); setDry(null); }}>
                  {spec.entities.map((e) => <option key={e.key} value={e.key}>{e.labelPlural}</option>)}
                </select>
              </label>
              <label><span className="label">Données</span>
                <select className="input" value={mode} onChange={(e) => { setMode(e.target.value as "demo" | "live"); setDry(null); }}>
                  <option value="demo">Données de démonstration (aperçu)</option>
                  <option value="live" disabled={!live}>Données réelles{live ? "" : " (publiez d'abord)"}</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Colonne du fichier</th><th className="pr-3">Type détecté</th><th className="pr-3">Exemples</th><th>Champ du logiciel</th></tr></thead>
                <tbody>
                  {file.columns.map((c) => (
                    <tr key={c.name} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-900">{c.name}{c.issues > 0 && <span className="ml-1 text-xs text-amber-800">({c.issues} anomalie{c.issues > 1 ? "s" : ""})</span>}</td>
                      <td className="pr-3 text-slate-700">{c.type}</td>
                      <td className="max-w-48 truncate pr-3 text-slate-600">{c.samples.join(" · ")}</td>
                      <td>
                        <select aria-label={`Champ pour ${c.name}`} className="input !min-h-0 py-1.5 text-sm" value={mapping[c.name] ?? ""} onChange={(e) => { setMapping((m) => ({ ...m, [c.name]: e.target.value })); setDry(null); }}>
                          <option value="">— Ne pas importer —</option>
                          {target.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost" disabled={busy || !Object.values(mapping).some(Boolean)} onClick={() => run(true)}>1. Vérifier les {file.rows.length} lignes</button>
              {dry && <button className="btn btn-primary" disabled={busy || !dry.valid || (dry.sensitive && !confirmSensitive)} onClick={() => run(false)}>2. Importer {dry.valid} ligne(s) valide(s)</button>}
            </div>
            {dry && (
              <div className="rounded-xl border border-slate-200 p-4 text-sm">
                <p className="text-slate-900">{dry.valid} ligne(s) valide(s), {dry.invalid} ligne(s) en erreur (ignorées).</p>
                {dry.errors.length > 0 && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-800">{dry.errors.map((e) => <li key={e.line}>Ligne {e.line} : {Object.entries(e.errors).map(([k, v]) => `${target.fields.find((f) => f.key === k)?.label ?? k} — ${v}`).join(" ; ")}</li>)}</ul>}
                {dry.sensitive && (
                  <label className="mt-3 flex items-start gap-2 text-amber-800">
                    <input type="checkbox" className="mt-1" checked={confirmSensitive} onChange={(e) => setConfirmSensitive(e.target.checked)} />
                    Ce fichier contient des coordonnées personnelles (téléphones, e-mails). Je confirme avoir le droit de les importer.
                  </label>
                )}
                {mode === "live" && <p className="mt-2 text-xs text-slate-600">Une sauvegarde de vos données réelles sera créée avant l&apos;import.</p>}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Sauvegardes des données réelles" subtitle="Créées automatiquement avant chaque changement risqué (import, modification d'un logiciel publié, restauration)." actions={<button className="btn btn-ghost" disabled={busy} onClick={backup}>Sauvegarder maintenant</button>}>
        {data.backups.length === 0 ? <p className="text-sm text-slate-600">Aucune sauvegarde.</p> : (
          <ul className="divide-y divide-slate-200">
            {data.backups.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm text-slate-900">{b.label}</p><p className="text-xs text-slate-500">{fmtDateTime(b.created_at)} · {b.record_count} fiche(s)</p></div>
                {data.role === "owner" && <button className="btn btn-ghost" disabled={busy} onClick={() => restore(b.id, b.label)}>Restaurer</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Historique des modifications de données">
        {data.history.length === 0 ? <p className="text-sm text-slate-600">Aucune modification enregistrée.</p> : (
          <ul className="space-y-1 text-sm">
            {data.history.map((h, i) => (
              <li key={i} className="flex gap-3 text-slate-700">
                <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(h.created_at)}</span>
                <span>{{ create: "Ajout", update: "Modification", delete: "Suppression", import: "Import", restore: "Restauration" }[h.action] ?? h.action} · {spec.entities.find((e) => e.key === h.entity)?.labelPlural ?? h.entity}</span>
                <span className="truncate text-slate-500">{h.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
