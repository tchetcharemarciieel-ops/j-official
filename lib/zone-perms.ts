import { has, type Permission } from "./team";

/**
 * Zones du plan et fonctions visibles selon le poste. L'interface masque ce qui n'est pas
 * autorisé ; le serveur refuse de toute façon chaque opération hors du poste (lib/op-perms.ts).
 */
const P = (...p: Permission[]) => p;

export const ZONE_PERMS: Record<string, Permission[]> = {
  // Restaurant
  cuisine: P("cuisine"),
  salle: P("salle", "vision"),
  stock: P("stock", "pieces"),
  froid: P("stock", "cuisine"),
  toilettes: P("menage", "stock", "salle"),
  caisse: P("caisse", "parametres"),
  bureau: P("rapports", "finances", "personnel", "parametres", "equipe"),
  terrasse: P("salle", "vision"),
  // Hôtel
  reception: P("reception"),
  chambres: P("chambres", "menage", "reception"),
  restaurant: P("restaurant", "caisse", "salle", "vision"),
  // Garage
  accueil: P("accueil_garage"),
  atelier: P("atelier"),
  repos: P("atelier", "accueil_garage", "pieces", "personnel"),
};

/** Fonctions d'une zone qui demandent une permission plus précise que la zone elle-même. */
export const OPTION_PERMS: Record<string, Permission[]> = {
  "caisse:commande": P("caisse"),
  "caisse:paiement": P("caisse"),
  "caisse:recus": P("caisse"),
  "caisse:rapport": P("caisse", "rapports"),
  "caisse:commandes_en_ligne": P("caisse"),
  "caisse:menu_en_ligne": P("parametres"),
  "caisse:qr": P("parametres"),
  "restaurant:menu_en_ligne": P("parametres"),
  "restaurant:qr": P("parametres"),
  "restaurant:carte": P("parametres"),
  "restaurant:cuisine": P("cuisine"),
  "restaurant:caisse": P("caisse"),
  "bureau:tableau": P("rapports"),
  "bureau:personnel": P("personnel"),
  "bureau:finances": P("finances"),
  "bureau:rapports": P("rapports"),
  "bureau:agent": P("rapports"),
  "salle:budget": P("parametres"),
  "terrasse:budget": P("parametres"),
  "terrasse:amenagement": P("parametres", "salle"),
  "cuisine:budget": P("parametres"),
  "toilettes:budget": P("parametres"),
};

export const zoneAllowed = (zone: string, perms: readonly Permission[] | null | undefined) => perms == null || has(perms as Permission[], ZONE_PERMS[zone] ?? []);
export function optionAllowed(zone: string, option: string, perms: readonly Permission[] | null | undefined) {
  if (perms == null) return true;
  const need = OPTION_PERMS[`${zone}:${option}`];
  return need ? has(perms as Permission[], need) : zoneAllowed(zone, perms);
}
