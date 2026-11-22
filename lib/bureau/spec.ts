import type { AppSpec } from "../spec";
import { AGENCY_TYPES, type AgencyType } from "./model";

/**
 * Spécification d'une entreprise MiniSoft Bureau. Le module (« bureau ») remplace l'interface
 * générée ; la table « fiches » ne sert qu'à satisfaire le format commun des logiciels MiniSoft.
 */
export function bureauSpec(name: string, type: AgencyType, primary = "#2563eb", sector?: string): AppSpec {
  return {
    name,
    sector: sector || AGENCY_TYPES[type].sector,
    description: "Gestion de bureau et d'agence : clients, projets, personnel, agenda, documents et facturation, finances, messagerie, équipements, bureau virtuel.",
    theme: { primary, accent: "#f59e0b", logoText: name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "MS" },
    welcome: `Bienvenue dans ${name}`,
    module: "bureau",
    entities: [{ key: "fiches", label: "Fiche", labelPlural: "Fiches", icon: "🗂️", description: "Réservé : les données de MiniSoft Bureau sont gérées dans ses propres pages.", fields: [{ key: "nom", label: "Nom", type: "text", required: true, showInTable: true }], permissions: {} }],
    dashboard: [],
    automations: [],
    features: { csvExport: true, pdfExport: true, dataAssistant: false },
    workspace: { enabled: false, layout: "bureau", title: "", stations: [], hiddenEntities: [] },
  };
}
