import type { AppSpec } from "../spec";
import { TRANSPORT_TYPES, type TransportType } from "./model";

/** Spécification d'une entreprise MiniSoft Transport & Delivery (le module remplace l'interface générée). */
export function transportSpec(name: string, type: TransportType, primary = "#2563eb"): AppSpec {
  return {
    name,
    sector: TRANSPORT_TYPES[type].label,
    description: "Transport et livraison : commandes et colis, suivi public, livreurs, véhicules, tarification, paiements, finances.",
    theme: { primary, accent: "#f59e0b", logoText: name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "MS" },
    welcome: `Bienvenue dans ${name}`,
    module: "transport",
    entities: [{ key: "fiches", label: "Fiche", labelPlural: "Fiches", icon: "🗂️", description: "Réservé : les données de MiniSoft Transport sont gérées dans ses propres pages.", fields: [{ key: "nom", label: "Nom", type: "text", required: true, showInTable: true }], permissions: {} }],
    dashboard: [],
    automations: [],
    features: { csvExport: true, pdfExport: true, dataAssistant: false },
    workspace: { enabled: false, layout: "transport", title: "", stations: [], hiddenEntities: [] },
  };
}
