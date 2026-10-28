import { IN_WORKSHOP, PRESENT, balance, isLate, stockAlerts, type Doc, type Equip, type Invoice, type Job, type Supply, type Task, type Vehicle } from "@/lib/garage/model";
import { GARAGE_AREAS, GARAGE_BAYS, GARAGE_SPOTS, type GarageZoneId } from "@/lib/workspace";
import type { GarageAreaView, GarageSceneProps } from "../workspace/types";
import type { GarageState } from "./useGarage";

/**
 * Données du plan 3D du garage : badges des zones et véhicules affichés, calculés uniquement
 * sur les dossiers enregistrés (un véhicule n'apparaît que s'il est enregistré comme présent).
 */
export function garageScene(state: GarageState | null, selected: GarageZoneId | null, onZone: (z: GarageZoneId) => void): GarageSceneProps {
  const d = state?.data;
  const jobs = (d?.job ?? []) as Doc<Job>[];
  const plate = (j: Doc<Job>) => ((d?.vehicle ?? []) as Doc<Vehicle>[]).find((v) => v.id === j.data.vehicle_id)?.data.plate ?? j.data.ref;
  const workshop = jobs.filter((j) => IN_WORKSHOP.includes(j.data.status)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const parkedJobs = jobs.filter((j) => j.data.status === "attente" || j.data.status === "pret").sort((a, b) => Number(b.data.status === "pret") - Number(a.data.status === "pret") || a.created_at.localeCompare(b.created_at));
  const present = jobs.filter((j) => PRESENT.includes(j.data.status)).length;
  const ready = jobs.filter((j) => j.data.status === "pret").length;
  const late = workshop.filter((j) => isLate(j.data)).length + jobs.filter((j) => j.data.status === "attente" && isLate(j.data)).length;
  const alerts = d ? stockAlerts(d.part) : { out: [], low: [] };
  const unpaid = ((d?.invoice ?? []) as Doc<Invoice>[]).filter((i) => !i.data.cancelled && balance(i.data) > 0).length;
  const missing = jobs.filter((j) => PRESENT.includes(j.data.status)).reduce((a, j) => a + j.data.missing.filter((m) => m.status !== "recue").length, 0);
  const openTasks = ((d?.task ?? []) as Doc<Task>[]).filter((t) => t.data.zone === "salle_repos" && (t.data.status === "a_faire" || t.data.status === "en_cours")).length;
  const broken = ((d?.equip ?? []) as Doc<Equip>[]).filter((e) => e.data.condition === "panne" || e.data.condition === "endommage").length;
  const lowSupply = ((d?.supply ?? []) as Doc<Supply>[]).filter((s) => s.data.qty <= s.data.min_qty).length;
  const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

  const badge = (id: GarageZoneId): GarageAreaView["badge"] => {
    if (!d) return null;
    switch (id) {
      case "accueil":
        return ready ? { text: `${plural(ready, "prêt")} à remettre`, tone: "active" } : present ? { text: plural(present, "véhicule"), tone: "idle" } : { text: "Aucun véhicule", tone: "idle" };
      case "atelier":
        return late ? { text: `${late} en retard`, tone: "alert" } : workshop.length ? { text: `${workshop.length} en cours`, tone: "active" } : { text: "Libre", tone: "idle" };
      case "stock": {
        const n = alerts.out.length + alerts.low.length;
        return n ? { text: `${n} en alerte`, tone: "alert" } : { text: plural((d.part as Doc[]).length, "pièce"), tone: "idle" };
      }
      case "bureau":
        return missing ? { text: `${plural(missing, "pièce manquante", "pièces manquantes")}`, tone: "alert" } : unpaid ? { text: `${plural(unpaid, "facture")} à encaisser`, tone: "active" } : null;
      case "repos":
        return broken || lowSupply ? { text: `${broken + lowSupply} à traiter`, tone: "alert" } : openTasks ? { text: plural(openTasks, "tâche"), tone: "active" } : null;
    }
  };

  return {
    areas: GARAGE_AREAS.map((a) => ({ ...a, badge: badge(a.id) })),
    selected,
    onZone,
    bays: workshop.slice(0, GARAGE_BAYS.length).map((j) => ({ id: j.id, plate: plate(j), status: j.data.status })),
    parked: parkedJobs.slice(0, GARAGE_SPOTS.length).map((j) => ({ id: j.id, plate: plate(j), ready: j.data.status === "pret" })),
    extraInWorkshop: Math.max(0, workshop.length - GARAGE_BAYS.length),
    extraParked: Math.max(0, parkedJobs.length - GARAGE_SPOTS.length),
  };
}
