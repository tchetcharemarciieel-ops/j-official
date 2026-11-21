import type { AppSpec } from "../spec";
import { SHOP_TYPES, type ShopType } from "./model";

/**
 * Spécification d'une boutique MiniSoft Shop. Le module (« shop ») remplace l'interface générée :
 * les données vivent dans les fiches « sh:… » ; la table « articles » ci-dessous n'existe que pour
 * satisfaire le format commun des logiciels MiniSoft (elle n'est ni affichée ni utilisée).
 */
export function shopSpec(name: string, type: ShopType, primary = "#2563eb"): AppSpec {
  return {
    name,
    sector: SHOP_TYPES[type].label,
    description: "Gestion complète de boutique : caisse, stock, boutique en ligne, commandes, clients, fournisseurs, dépenses et rapports.",
    theme: { primary, accent: "#f59e0b", logoText: name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "MS" },
    welcome: `Bienvenue dans ${name}`,
    module: "shop",
    entities: [
      {
        key: "articles",
        label: "Article",
        labelPlural: "Articles",
        icon: "📦",
        description: "Réservé : les produits de MiniSoft Shop sont gérés dans la page Produits.",
        fields: [{ key: "nom", label: "Nom", type: "text", required: true, showInTable: true }],
        permissions: {},
      },
    ],
    dashboard: [],
    automations: [],
    features: { csvExport: true, pdfExport: true, dataAssistant: false },
    workspace: { enabled: false, layout: "boutique", title: "", stations: [], hiddenEntities: [] },
  };
}
