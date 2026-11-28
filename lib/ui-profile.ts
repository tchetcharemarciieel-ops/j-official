import { layoutForSector } from "./workspace";
import type { AppSpec, Entity, WorkspaceLayout } from "./spec";

/**
 * Identité d'interface propre à chaque métier : ordre des modules (les plus importants d'abord), regroupement du menu
 * et libellés. Un logiciel scolaire, un garage et un restaurant n'ont donc ni le même ordre ni les mêmes rubriques.
 */
type Profile = { priority: RegExp[]; main: string; people: string; money: string; tagline: string };
const PROFILES: Record<WorkspaceLayout, Profile> = {
  restaurant: { priority: [/commande/, /vente|caisse/, /ingredient|boisson|stock|produit/, /client/], main: "Service", people: "Clients", money: "Finances", tagline: "Le service du jour en un coup d'œil" },
  garage: { priority: [/reparation|intervention/, /vehicule/, /client/, /piece/], main: "Atelier", people: "Clients et véhicules", money: "Facturation", tagline: "L'atelier et les réparations en cours" },
  pharmacie: { priority: [/medicament|produit|stock/, /vente|ordonnance/, /client|patient/], main: "Officine", people: "Patients et clients", money: "Finances", tagline: "Stock, péremptions et ventes" },
  boutique: { priority: [/vente/, /produit|article|stock/, /client/, /fournisseur/], main: "Vente et stock", people: "Clients", money: "Finances", tagline: "Ventes, stock et crédits clients" },
  ecole: { priority: [/eleve|etudiant/, /classe/, /note|bulletin/, /paiement|scolarite/], main: "Scolarité", people: "Élèves et personnel", money: "Finances", tagline: "Élèves, classes et paiements" },
  hotel: { priority: [/reservation/, /chambre/, /client/], main: "Hébergement", people: "Clients", money: "Finances", tagline: "Réservations et occupation" },
  transport: { priority: [/livraison|course|colis/, /vehicule/, /chauffeur|livreur|employe/, /client/], main: "Exploitation", people: "Équipe et clients", money: "Finances", tagline: "Livraisons, véhicules et chauffeurs" },
  services: { priority: [/rendez|reservation/, /client/, /prestation|service/, /vente|caisse/], main: "Activité", people: "Clients", money: "Finances", tagline: "Rendez-vous, clients et caisse" },
  bureau: { priority: [/client/, /projet|dossier/, /tache/, /facture/], main: "Activité", people: "Relations", money: "Finances", tagline: "Votre activité au même endroit" },
};

export const profileFor = (spec: Pick<AppSpec, "sector">): Profile => PROFILES[layoutForSector(spec.sector)] ?? PROFILES.bureau;

const text = (e: Entity) => `${e.key} ${e.labelPlural}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Modules triés par importance pour le métier (les autres suivent dans leur ordre d'origine). */
export function orderEntities(spec: Pick<AppSpec, "sector" | "entities">): Entity[] {
  const p = profileFor(spec);
  const rank = (e: Entity) => { const i = p.priority.findIndex((r) => r.test(text(e))); return i < 0 ? p.priority.length : i; };
  return spec.entities.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
}

export type NavGroup = { title: string; entities: Entity[] };
const PEOPLE = /client|eleve|etudiant|patient|locataire|employe|personnel|enseignant|chauffeur|livreur|fournisseur|membre|contact/;
const MONEY = /vente|paiement|depense|facture|encaiss|recette|salaire|caisse|budget|scolarite|cotisation/;

/** Menu regroupé par rubriques propres au métier (une seule rubrique : pas d'en-tête inutile). */
export function groupEntities(spec: Pick<AppSpec, "sector" | "entities">, readable: Entity[] = spec.entities): NavGroup[] {
  const p = profileFor(spec);
  const ordered = orderEntities({ sector: spec.sector, entities: readable });
  const main: Entity[] = [], people: Entity[] = [], money: Entity[] = [];
  for (const e of ordered) (MONEY.test(text(e)) || e.fields.some((f) => f.type === "money") && !PEOPLE.test(text(e)) && /paiement|depense|facture|vente/.test(text(e)) ? money : PEOPLE.test(text(e)) ? people : main).push(e);
  const groups = [{ title: p.main, entities: main }, { title: p.people, entities: people }, { title: p.money, entities: money }].filter((g) => g.entities.length);
  return groups.length > 1 ? groups : [{ title: "", entities: ordered }];
}
