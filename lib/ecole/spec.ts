import type { AppSpec } from "../spec";
import { SCHOOL_TYPES, type SchoolType } from "./model";

/** Spécification d'un établissement MiniSoft École (le module remplace l'interface générée). */
export function ecoleSpec(name: string, type: SchoolType, primary = "#1d4ed8"): AppSpec {
  return {
    name,
    sector: SCHOOL_TYPES[type].label,
    description: "Gestion scolaire : inscriptions, classes, notes et bulletins, présences, finances, espace parents.",
    theme: { primary, accent: "#f59e0b", logoText: name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "MS" },
    welcome: `Bienvenue à ${name}`,
    module: "ecole",
    entities: [{ key: "fiches", label: "Fiche", labelPlural: "Fiches", icon: "🗂️", description: "Réservé : les données de MiniSoft École sont gérées dans ses propres pages.", fields: [{ key: "nom", label: "Nom", type: "text", required: true, showInTable: true }], permissions: {} }],
    dashboard: [],
    automations: [],
    features: { csvExport: true, pdfExport: true, dataAssistant: false },
    workspace: { enabled: false, layout: "ecole", title: "", stations: [], hiddenEntities: [] },
  };
}
