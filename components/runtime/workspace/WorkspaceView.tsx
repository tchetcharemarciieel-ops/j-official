"use client";

import dynamic from "next/dynamic";
import { Box, LayoutDashboard, Map as MapIcon } from "lucide-react";
import { Component, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import type { AppPrefs } from "@/lib/app-prefs";
import { ROLE_LABELS, type AppSpec, type Workspace } from "@/lib/spec";
import type { Row } from "@/lib/stats";
import { LAYOUT_LABELS, SLOTS, assignCrew, boardKpis, demoCrew, placeStations, recentActivity, stationStats, type CrewMember } from "@/lib/workspace";
import type { DataMode, Rec } from "../useAppData";
import { KIND_ICONS, ROLE_COLORS } from "./kinds";
import { Plan2D } from "./Plan2D";
import { stationBadge, type SceneProps } from "./types";

const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><span className="spinner !border-slate-300 !border-t-slate-600" />Chargement de l&apos;espace 3D…</span></div>,
});

/** La 3D a planté (pilote graphique, mémoire) : on bascule sur le plan 2D au lieu d'un écran vide. */
class SceneBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Appareils modestes : le plan 2D est proposé par défaut (la 3D reste disponible). */
function lowPowerDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency ?? 4) <= 2;
}

type Props = {
  projectId: string;
  spec: AppSpec;
  ws: Workspace;
  mode: DataMode;
  readable: string[];
  records: Record<string, Rec[]>;
  loading: boolean;
  reload: () => Promise<void> | void;
  prefs: AppPrefs;
  savePrefs: (p: AppPrefs) => void;
  onOpen: (target: string, recordId?: string) => void;
  onClassic: () => void;
};

/** Espace de travail : bureau virtuel du logiciel, relié à ses modules et à ses données. */
export function WorkspaceView({ projectId, spec, ws, mode, readable, records, loading, reload, prefs, savePrefs, onOpen, onClassic }: Props) {
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [teamError, setTeamError] = useState(false);
  const [gl, setGl] = useState<{ ok: boolean; low: boolean } | null>(null);
  const [crashed, setCrashed] = useState(false);

  useEffect(() => setGl({ ok: webglAvailable(), low: lowPowerDevice() }), []);

  // Équipe : membres réels du logiciel ; personnages fictifs signalés dans la démo publique.
  useEffect(() => {
    if (mode === "local") return setMembers(demoCrew(ws.layout));
    let alive = true;
    api<{ members: CrewMember[] }>(`/api/apps/${projectId}/team`)
      .then((r) => alive && setMembers(r.members))
      .catch(() => alive && setTeamError(true));
    return () => {
      alive = false;
    };
  }, [projectId, mode, ws.layout]);

  // Données réelles : actualisation régulière tant que l'espace est affiché.
  useEffect(() => {
    if (mode !== "live") return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), 30_000);
    return () => clearInterval(t);
  }, [mode, reload]);

  const rowsFor = useMemo(() => {
    const cache = new Map<string, Row[]>();
    return (key: string) => {
      if (!cache.has(key)) cache.set(key, (records[key] ?? []).map((r) => ({ id: r.id, data: r.data, created_at: r.created_at })));
      return cache.get(key)!;
    };
  }, [records]);

  const placed = useMemo(() => placeStations(ws).filter((s) => s.target === "__dashboard" || readable.includes(s.target)), [ws, readable]);
  const crew = useMemo(() => assignCrew(placed, members), [placed, members]);
  const stations = useMemo(() => placed.map((s) => ({ ...s, stats: s.target === "__dashboard" ? null : stationStats(spec, s.target, rowsFor(s.target)), crew: crew.get(s.id) ?? [] })), [placed, crew, spec, rowsFor]);
  const kpis = useMemo(() => boardKpis(spec, rowsFor), [spec, rowsFor]);
  const activity = useMemo(() => recentActivity(spec, { ...ws, hiddenEntities: [...ws.hiddenEntities, ...spec.entities.map((e) => e.key).filter((k) => !readable.includes(k))] }, rowsFor), [spec, ws, readable, rowsFor]);
  const freeSlots = SLOTS.slice(stations.filter((s) => s.kind !== "stats_board").length);
  const demo = mode !== "live";
  const title = ws.title || spec.name;

  const render: "3d" | "2d" = !gl ? "2d" : !gl.ok || crashed ? "2d" : (prefs.render ?? (gl.low ? "2d" : "3d"));
  const sceneProps: SceneProps = { stations, layout: ws.layout, title, kpis, demo, freeSlots, onOpen: (t) => onOpen(t) };

  return (
    <div className="@container space-y-4">
      <div className="flex flex-col justify-between gap-3 @2xl:flex-row @2xl:items-end">
        <div>
          <h2 className="text-xl font-bold">Espace de travail · {title}</h2>
          <p className="text-sm text-slate-500">
            {LAYOUT_LABELS[ws.layout]} · cliquez sur un poste pour ouvrir le module correspondant.
            {demo && <span className="ml-1 font-medium text-amber-700">{mode === "local" ? "Données et équipe de démonstration." : "Aperçu avec données de démonstration."}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label="Type d'affichage">
            <button
              type="button"
              onClick={() => savePrefs({ render: "3d" })}
              disabled={gl !== null && (!gl.ok || crashed)}
              aria-pressed={render === "3d"}
              title={gl && !gl.ok ? "La 3D n'est pas prise en charge par cet appareil" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 ${render === "3d" ? "text-white" : "text-slate-600"}`}
              style={render === "3d" ? { background: "var(--app-primary)" } : undefined}
            >
              <Box className="h-4 w-4" aria-hidden />3D
            </button>
            <button type="button" onClick={() => savePrefs({ render: "2d" })} aria-pressed={render === "2d"} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${render === "2d" ? "text-white" : "text-slate-600"}`} style={render === "2d" ? { background: "var(--app-primary)" } : undefined}>
              <MapIcon className="h-4 w-4" aria-hidden />Plan 2D
            </button>
          </div>
          <button type="button" onClick={onClassic} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <LayoutDashboard className="h-4 w-4" aria-hidden />Interface classique
          </button>
        </div>
      </div>

      {crashed && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">La 3D n&apos;a pas pu s&apos;afficher sur cet appareil : le plan 2D est utilisé à la place.</p>}

      <div className="grid gap-4 @5xl:grid-cols-[1fr_300px]">
        <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${render === "3d" ? "h-[52vh] min-h-[340px] @2xl:h-[62vh]" : ""}`}>
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">Chargement des données…</div>
          ) : render === "3d" ? (
            <SceneBoundary onError={() => setCrashed(true)}>
              <Scene3D {...sceneProps} />
            </SceneBoundary>
          ) : (
            <Plan2D {...sceneProps} />
          )}
        </div>

        <aside className="grid gap-4 @2xl:grid-cols-3 @5xl:grid-cols-1 @5xl:content-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="ws-postes">
            <h3 id="ws-postes" className="text-sm font-semibold">Postes</h3>
            <ul className="mt-2 space-y-1">
              {stations.map((s) => {
                const Icon = KIND_ICONS[s.kind];
                const badge = stationBadge(s);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => onOpen(s.target)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {badge && <span className={`shrink-0 text-xs ${badge.tone === "alert" ? "text-red-600" : badge.tone === "active" ? "text-blue-700" : "text-slate-500"}`}>{badge.text}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="ws-activite">
            <h3 id="ws-activite" className="text-sm font-semibold">Activité récente</h3>
            {activity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucune fiche pour l&apos;instant.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {activity.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpen(a.entity, a.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                      <span className="block truncate text-sm text-slate-900">{a.label}</span>
                      <span className="block text-xs text-slate-500">{a.entityLabel} · {new Date(a.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="ws-equipe">
            <h3 id="ws-equipe" className="text-sm font-semibold">Équipe</h3>
            {teamError ? (
              <p className="mt-2 text-sm text-slate-500">Équipe non chargée.</p>
            ) : members.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucun membre.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: ROLE_COLORS[m.role] ?? "#334155" }}>{m.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-slate-500">{m.demo ? "démo" : ROLE_LABELS[m.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
