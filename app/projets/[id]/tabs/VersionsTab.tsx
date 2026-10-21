"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { diffSpecs } from "@/lib/diff";
import { fmtDateTime } from "@/lib/status";
import { Panel, type WorkspaceData } from "../Workspace";

const SOURCE: Record<string, string> = { generation: "Génération", ai: "IA", rules: "Assistant (règles)", manual: "Manuelle", restore: "Restauration", template: "Modèle" };

export function VersionsTab({ data, onChanged }: { data: WorkspaceData; onChanged: () => void }) {
  const toast = useToast();
  const [a, setA] = useState(data.versions[1]?.version ?? data.versions[0]?.version ?? 0);
  const [b, setB] = useState(data.versions[0]?.version ?? 0);
  const [busy, setBusy] = useState(false);
  const diff = useMemo(() => {
    const va = data.versions.find((v) => v.version === a);
    const vb = data.versions.find((v) => v.version === b);
    return va && vb ? diffSpecs(va.spec, vb.spec) : [];
  }, [a, b, data.versions]);

  async function restore(version: number) {
    if (!confirm(`Restaurer la structure de la version v${version} ? Une nouvelle version sera créée ; vos données métier ne sont pas effacées.`)) return;
    setBusy(true);
    try {
      const r = await api<{ version: number }>(`/api/projects/${data.project.id}/versions/${version}/restore`, { body: {} });
      toast("success", `Version v${version} restaurée dans le brouillon (v${r.version}).`);
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Historique des versions" subtitle="Restaurer une version modifie la structure du logiciel, jamais les données métier.">
        <ul className="space-y-3">
          {data.versions.map((v) => (
            <li key={v.version} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="font-medium text-white">
                    v{v.version} — {v.summary}
                    {v.version === data.project.draftVersion && <span className="ml-2 rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200">Brouillon actuel</span>}
                    {v.version === data.project.publishedVersion && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">En ligne</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fmtDateTime(v.created_at)} · {v.author} · {SOURCE[v.source] ?? v.source}
                    {v.test_report && ` · tests ${v.test_report.summary.passed}/${v.test_report.summary.total}${v.test_report.summary.failed ? ` (${v.test_report.summary.failed} échec)` : ""}`}
                    {v.published && " · a été publiée"}
                  </p>
                </div>
                {v.version !== data.project.draftVersion && <button className="btn btn-ghost" disabled={busy} onClick={() => restore(v.version)}>Restaurer</button>}
              </div>
              {v.changes?.length > 0 && (
                <details className="mt-2 text-xs text-slate-300">
                  <summary className="cursor-pointer text-slate-400">{v.changes.length} changement(s)</summary>
                  <ul className="mt-2 space-y-1">{v.changes.map((c, i) => <li key={i}>{c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"} {c.target} — {c.detail}</li>)}</ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {data.versions.length > 1 && (
        <Panel title="Comparer deux versions">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1"><span className="label">Version de départ</span>
              <select className="input" value={a} onChange={(e) => setA(Number(e.target.value))}>{data.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</select>
            </label>
            <label className="flex-1"><span className="label">Version d&apos;arrivée</span>
              <select className="input" value={b} onChange={(e) => setB(Number(e.target.value))}>{data.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</select>
            </label>
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {diff.length === 0 ? <li className="text-slate-400">Aucune différence.</li> : diff.map((c, i) => (
              <li key={i} className={c.kind === "added" ? "text-emerald-300" : c.kind === "removed" ? "text-red-300" : "text-amber-200"}>
                {c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"} {c.target} — <span className="text-slate-300">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
