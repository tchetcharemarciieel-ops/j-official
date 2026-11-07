"use client";

import dynamic from "next/dynamic";
import { Box, Map as MapIcon } from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import type { AppPrefs } from "@/lib/app-prefs";
import { type AppSpec, type Role, type Workspace } from "@/lib/spec";
import type { Row } from "@/lib/stats";
import { GARAGE_ZONE_IDS, SLOTS, assignCrew, boardKpis, demoCrew, placeStations, stationStats, type CrewMember, type GarageZoneId } from "@/lib/workspace";
import { useToast } from "@/components/Toaster";
import { GaragePanel } from "../garage/GaragePanel";
import { garageScene } from "../garage/scene";
import { useGarage } from "../garage/useGarage";
import { useVenue, venueSettings } from "../venue/useVenue";
import { venueScene } from "../venue/scene";
import { VenuePanel } from "../venue/VenuePanel";
import { VenueSetup } from "../venue/VenueSetup";
import { KdsModule } from "../venue/online/kds";
import { has, type Permission } from "@/lib/team";
import { zoneAllowed } from "@/lib/zone-perms";
import { LEVEL as VENUE_LEVEL, activeZones, type VenueZone } from "@/lib/venue/model";
import type { DataMode, Rec } from "../useAppData";
import { Plan2D } from "./Plan2D";
import { PlanConfirmation } from "./PlanConfirmation";
import { type SceneProps } from "./types";

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
  role: Role;
  readable: string[];
  records: Record<string, Rec[]>;
  loading: boolean;
  reload: () => Promise<void> | void;
  prefs: AppPrefs;
  savePrefs: (p: AppPrefs) => void;
  onOpen: (target: string, recordId?: string) => void;
  /** Absent : interface classique non autorisée pour ce poste. */
  onClassic?: () => void;
  /** Ordre venu de la barre du bas (téléphone) : ouvrir « Configurer le plan ». */
  command?: { kind: "configure"; n: number } | null;
  /** Permissions du poste (null = sans restriction). */
  perms?: string[] | null;
};

/** Espace de travail : bureau virtuel du logiciel, relié à ses modules et à ses données. */
export function WorkspaceView({ projectId, spec, ws, mode, role, readable, records, loading, reload, prefs, savePrefs, onOpen, onClassic, perms = null, command = null }: Props) {
  const myPerms = perms as Permission[] | null;
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [gl, setGl] = useState<{ ok: boolean; low: boolean } | null>(null);
  const [crashed, setCrashed] = useState(false);

  useEffect(() => setGl({ ok: webglAvailable(), low: lowPowerDevice() }), []);

  // Garage : zones fonctionnelles (accueil, atelier, stock, bureau, salle de repos) ouvertes dans un panneau latéral.
  const garageMode = ws.layout === "garage";
  const garage = useGarage(projectId, mode, role, garageMode);
  const notify = useToast();
  const [zone, setZone] = useState<GarageZoneId | null>(null);
  const [jobRequest, setJobRequest] = useState<{ id: string; n: number } | null>(null);
  const garageView = useMemo(() => (garageMode ? garageScene(garage.state, zone, setZone) : undefined), [garageMode, garage.state, zone]);
  // Restaurant et hôtel : questionnaire avant le plan, zones déclarées, panneau latéral.
  const venueKind = ws.layout === "restaurant" || ws.layout === "hotel" ? ws.layout : null;
  const venue = useVenue(projectId, mode, role, venueKind);
  const vSettings = useMemo(() => venueSettings(venue.state, venueKind ?? "restaurant"), [venue.state, venueKind]);
  // Zones du plan limitées au poste de l'employé.
  const vZones = useMemo(() => (venueKind ? activeZones(vSettings).filter((z) => zoneAllowed(z, myPerms)) : []), [venueKind, vSettings, myPerms]);
  const [vZone, setVZone] = useState<VenueZone | null>(null);
  const [vRoom, setVRoom] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const needsSetup = Boolean(venueKind && venue.state && (!vSettings.answered || (venueKind === "hotel" && vSettings.photos_step === null)));
  // « Configurer » touché dans la barre du bas : ouvre le réglage du plan (si le rôle le permet).
  const handled = useRef(0);
  const ready = Boolean(venue.state);
  useEffect(() => {
    if (command?.kind !== "configure" || !venueKind || !venue.state || handled.current === command.n) return;
    handled.current = command.n;
    if (VENUE_LEVEL[venue.state.role] >= 2 && has(myPerms, "parametres")) {
      setSetupOpen(true);
      setVZone(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.n, ready]);
  // Écran cuisine : ouvert depuis la zone Cuisine, ou directement avec l'adresse « ?cuisine=1 » (tablette de la cuisine).
  const [kdsOpen, setKdsOpen] = useState(false);
  useEffect(() => {
    if (venueKind && new URLSearchParams(window.location.search).get("cuisine") === "1") setKdsOpen(true);
  }, [venueKind]);
  // Restaurant : la zone Cuisine ouvre directement l'écran cuisine.
  const kdsAllowed = has(myPerms, ["cuisine", "caisse"]);
  const openZone = useCallback(
    (z: VenueZone | null) => {
      if (z === "cuisine" && venueKind === "restaurant" && kdsAllowed) {
        setKdsOpen(true);
        setVZone(null);
      } else setVZone(z);
      setVRoom(null);
    },
    [venueKind, kdsAllowed],
  );
  const venueView = useMemo(
    () => (venueKind ? venueScene(venueKind, venue.state, vSettings, vZone, openZone, vRoom, (id) => (setVZone("chambres"), setVRoom(id))) : undefined),
    [venueKind, venue.state, vSettings, vZone, vRoom, openZone],
  );
  useEffect(() => {
    // Zone retirée du plan (réponse modifiée) : on ferme son panneau.
    if (vZone && !vZones.includes(vZone)) setVZone(null);
  }, [vZone, vZones]);

  // Équipe : membres réels du logiciel ; personnages fictifs signalés dans la démo publique.
  useEffect(() => {
    if (mode === "local") return setMembers(demoCrew(ws.layout));
    let alive = true;
    api<{ members: CrewMember[] }>(`/api/apps/${projectId}/team`)
      .then((r) => alive && setMembers(r.members))
      .catch(() => undefined);
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
  const freeSlots = SLOTS.slice(stations.filter((s) => s.kind !== "stats_board").length);
  const demo = mode !== "live";
  const title = ws.title || spec.name;

  const render: "3d" | "2d" = !gl ? "2d" : !gl.ok || crashed ? "2d" : (prefs.render ?? (gl.low ? "2d" : "3d"));
  const sceneProps: SceneProps = { stations, layout: ws.layout, title, kpis, demo, freeSlots, onOpen: (t) => onOpen(t), garage: garageView, venue: venueView };

  // Plan affiché (zones, dimensions) : conservé lors de la confirmation pour savoir s'il a changé depuis.
  const planSnapshot = useMemo(
    () =>
      venueKind
        ? { layout: ws.layout, zones: activeZones(vSettings), dims: { length: vSettings.dims.length, width: vSettings.dims.width } }
        : garageMode
          ? { layout: ws.layout, zones: [...GARAGE_ZONE_IDS] }
          : { layout: ws.layout, postes: placed.map((x) => ({ kind: x.kind, label: x.label })) },
    [venueKind, garageMode, ws.layout, vSettings, placed],
  );
  const manager = (role === "owner" || role === "admin" || role === "manager") && has(myPerms, "parametres");
  const planReady = !(venueKind && (needsSetup || setupOpen || !venue.state));

  return (
    <div className="@container mx-auto max-w-6xl space-y-4">
      <header>
        <h2 className="text-xl font-bold">Espace de travail</h2>
        <p className="text-sm text-slate-500">
          {title} · {garageMode || venueKind ? "touchez une zone du plan pour ouvrir sa gestion." : "touchez un poste du plan pour ouvrir son module."}
          {demo && <span className="ml-1 font-medium text-amber-700">{mode === "local" ? "Données de démonstration." : "Aperçu avec données de démonstration."}</span>}
        </p>
      </header>

      {/* 1 et 2 : Plan 3D et Plan 2D, côte à côte. */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 sm:inline-grid sm:min-w-[22rem]" role="group" aria-label="Affichage du plan">
        <button
          type="button"
          onClick={() => savePrefs({ render: "3d" })}
          disabled={gl !== null && (!gl.ok || crashed)}
          aria-pressed={render === "3d"}
          title={gl && !gl.ok ? "La 3D n'est pas prise en charge par cet appareil" : undefined}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${render === "3d" ? "text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
          style={render === "3d" ? { background: "var(--app-primary)" } : undefined}
        >
          <Box className="h-4 w-4" aria-hidden />Plan 3D
        </button>
        <button
          type="button"
          onClick={() => savePrefs({ render: "2d" })}
          aria-pressed={render === "2d"}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${render === "2d" ? "text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
          style={render === "2d" ? { background: "var(--app-primary)" } : undefined}
        >
          <MapIcon className="h-4 w-4" aria-hidden />Plan 2D
        </button>
      </div>

      {crashed && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">La 3D n&apos;a pas pu s&apos;afficher sur cet appareil : le plan 2D est utilisé à la place.</p>}

      {venueKind && (needsSetup || setupOpen) ? (
        <VenueSetup kind={venueKind} api={venue} settings={vSettings} notify={notify} onDone={() => setSetupOpen(false)} onCancel={needsSetup ? undefined : () => setSetupOpen(false)} />
      ) : venueKind && !venue.state ? (
        <div className="grid h-60 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">{venue.error ? <span>{venue.error} <button type="button" className="underline" onClick={() => venue.reload()}>Réessayer</button></span> : "Chargement du plan…"}</div>
      ) : (
        <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${render === "3d" ? "h-[56vh] min-h-[340px] @2xl:h-[64vh]" : ""}`}>
          {loading ? (
            <div className="grid h-full min-h-60 place-items-center text-sm text-slate-500">Chargement du plan…</div>
          ) : render === "3d" ? (
            <SceneBoundary onError={() => setCrashed(true)}>
              <Scene3D {...sceneProps} />
            </SceneBoundary>
          ) : (
            <Plan2D {...sceneProps} />
          )}
        </div>
      )}

      {/* 3 : Confirmation du plan. */}
      {planReady && !loading && (
        <PlanConfirmation
          projectId={projectId}
          mode={mode}
          snapshot={planSnapshot}
          canConfirm={manager}
          onEdit={venueKind && venue.state && VENUE_LEVEL[venue.state.role] >= 2 && has(myPerms, "parametres") ? () => (setSetupOpen(true), setVZone(null)) : undefined}
        />
      )}
      {venueKind && vZone && !setupOpen && !needsSetup && <VenuePanel kind={venueKind} zones={vZones} zone={vZone} onZone={openZone} onClose={() => (setVZone(null), setVRoom(null))} api={venue} projectId={projectId} mode={mode} appName={title} notify={notify} roomId={vRoom} onRoom={setVRoom} request={null} onKds={kdsAllowed ? () => (setKdsOpen(true), setVZone(null)) : undefined} perms={myPerms} />}
      {venueKind && kdsOpen && venue.state && <KdsModule api={venue} kind={venueKind} mode={mode} projectId={projectId} appName={title} notify={notify} onClose={() => setKdsOpen(false)} />}
      {garageMode && zone && zoneAllowed(zone, myPerms) && <GaragePanel perms={myPerms} zone={zone} onZone={setZone} onClose={() => setZone(null)} api={garage} projectId={projectId} mode={mode} appName={title} notify={notify} jobRequest={jobRequest} />}
    </div>
  );
}
