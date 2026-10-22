"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { STATION_KINDS, WORKSPACE_LAYOUTS, type AppSpec, type Station, type Workspace } from "@/lib/spec";
import { KIND_LABELS, LAYOUT_LABELS, SLOTS, effectiveWorkspace } from "@/lib/workspace";
import { Panel, type WorkspaceData } from "../Workspace";

/** Réglages de l'espace de travail 3D (propriétaire et administrateurs). */
export function WorkspaceSettings({ data, spec, onChanged }: { data: WorkspaceData; spec: AppSpec; onChanged: () => void }) {
  const toast = useToast();
  const [ws, setWs] = useState<Workspace>(() => effectiveWorkspace(spec));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Workspace>) => setWs((w) => ({ ...w, ...patch }));
  const visible = spec.entities.filter((e) => !ws.hiddenEntities.includes(e.key));
  const work = ws.stations.filter((s) => s.kind !== "stats_board");

  const updateStation = (id: string, patch: Partial<Station>) => set({ stations: ws.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const toggleEntity = (key: string, on: boolean) => {
    const hidden = on ? ws.hiddenEntities.filter((k) => k !== key) : [...ws.hiddenEntities, key];
    set({ hiddenEntities: hidden, stations: on ? ws.stations : ws.stations.filter((s) => s.target !== key) });
  };
  const addStation = () => {
    const target = visible[0]?.key;
    if (!target) return;
    let n = 1;
    while (ws.stations.some((s) => s.id === `st_poste_${n}`)) n++;
    set({ stations: [...ws.stations, { id: `st_poste_${n}`, kind: "desk", label: "Nouveau poste", target }] });
  };

  async function submit(body: Workspace | "reset") {
    setBusy(true);
    try {
      const r = await api<{ version: number }>(`/api/projects/${data.project.id}`, { method: "PATCH", body: { workspace: body } });
      toast("success", `Espace de travail enregistré (v${r.version}).${data.project.publishedVersion ? " Republiez pour le mettre en ligne." : ""}`);
      onChanged();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Espace de travail 3D" subtitle="Bureau virtuel affiché dans le logiciel : chaque poste ouvre un module. Chaque utilisateur peut aussi choisir la 3D, le plan 2D ou l'interface classique.">
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={ws.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Activer l&apos;espace de travail
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Disposition</span>
            <select className="input" value={ws.layout} onChange={(e) => set({ layout: e.target.value as Workspace["layout"] })}>
              {WORKSPACE_LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Nom affiché sur le mur</span>
            <input className="input" value={ws.title} maxLength={60} placeholder={spec.name} onChange={(e) => set({ title: e.target.value })} />
          </label>
        </div>

        <fieldset>
          <legend className="label">Modules visibles dans l&apos;espace</legend>
          <div className="flex flex-wrap gap-2">
            {spec.entities.map((e) => (
              <label key={e.key} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <input type="checkbox" className="accent-blue-600" checked={!ws.hiddenEntities.includes(e.key)} onChange={(ev) => toggleEntity(e.key, ev.target.checked)} />
                {e.labelPlural}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="label">Postes de travail ({work.length}/{SLOTS.length})</p>
          <ul className="space-y-2">
            {work.map((s) => {
              const extra = work.filter((x) => x.target === s.target).length > 1;
              return (
                <li key={s.id} className="grid gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
                  <input className="input" aria-label="Nom du poste" value={s.label} maxLength={40} onChange={(e) => updateStation(s.id, { label: e.target.value })} />
                  <select className="input" aria-label="Type de poste" value={s.kind} onChange={(e) => updateStation(s.id, { kind: e.target.value as Station["kind"] })}>
                    {STATION_KINDS.filter((k) => k !== "stats_board").map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                  </select>
                  <select className="input" aria-label="Module ouvert au clic" value={s.target} onChange={(e) => updateStation(s.id, { target: e.target.value })}>
                    {visible.map((e) => <option key={e.key} value={e.key}>{e.labelPlural}</option>)}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-0 px-3"
                    disabled={!extra}
                    title={extra ? "Retirer ce poste" : "Dernier poste de ce module : décochez le module pour le masquer"}
                    aria-label="Retirer ce poste"
                    onClick={() => set({ stations: ws.stations.filter((x) => x.id !== s.id) })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-ghost mt-2" onClick={addStation} disabled={work.length >= SLOTS.length || visible.length === 0}>
            <Plus className="h-4 w-4" aria-hidden />Ajouter un poste
          </button>
          <p className="mt-1 text-xs text-slate-500">Les membres de l&apos;équipe apparaissent aux postes ; ajoutez-en depuis l&apos;onglet Équipe.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => submit(ws)}>Enregistrer (nouvelle version)</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => submit("reset")}>Réinitialiser selon le métier</button>
        </div>
      </div>
    </Panel>
  );
}
