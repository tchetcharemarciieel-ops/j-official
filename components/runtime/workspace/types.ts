import type { Station, WorkspaceLayout } from "@/lib/spec";
import type { CrewMember, GarageZoneId, StationStats } from "@/lib/workspace";

export type SceneStation = Station & { x: number; z: number; stats: StationStats | null; crew: CrewMember[] };

export type SceneProps = {
  stations: SceneStation[];
  layout: WorkspaceLayout;
  title: string;
  kpis: { label: string; value: number; unit: string | undefined }[];
  /** Données de démonstration (aperçu ou démo publique) : signalé sur le tableau. */
  demo: boolean;
  /** Emplacements libres, garnis d'un décor non cliquable adapté au métier. */
  freeSlots: { x: number; z: number }[];
  onOpen: (target: string) => void;
  /** Garage : zones fonctionnelles cliquables et véhicules réellement enregistrés comme présents. */
  garage?: GarageSceneProps;
};

export type BadgeTone = "alert" | "active" | "idle";
export type GarageAreaView = { id: GarageZoneId; label: string; x: number; z: number; w: number; d: number; badge: { text: string; tone: BadgeTone } | null };
export type GarageSceneProps = {
  areas: GarageAreaView[];
  selected: GarageZoneId | null;
  onZone: (z: GarageZoneId) => void;
  /** Véhicules en atelier (un par pont) et en attente / prêts sur le parking. */
  bays: { id: string; plate: string; status: string }[];
  parked: { id: string; plate: string; ready: boolean }[];
  extraInWorkshop: number;
  extraParked: number;
};

export const fmtNumber = (n: number, unit?: string) => `${n.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;

/** Texte court affiché sous le nom d'un poste (uniquement des valeurs calculées). */
export function stationBadge(s: SceneStation): { text: string; tone: "alert" | "active" | "idle" } | null {
  if (!s.stats) return null;
  if (s.stats.alert > 0) return { text: `${s.stats.alert} en alerte`, tone: "alert" };
  if (s.stats.open !== null && s.stats.open > 0) return { text: `${s.stats.open} ${s.stats.openLabel}`, tone: "active" };
  if (s.stats.today > 0) return { text: `${s.stats.today} aujourd'hui`, tone: "active" };
  return { text: `${s.stats.total} fiche${s.stats.total > 1 ? "s" : ""}`, tone: "idle" };
}
