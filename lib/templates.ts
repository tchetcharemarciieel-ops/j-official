import { composeSpec, SECTORS } from "./generator";
import { getModule } from "./modules";
import type { AppSpec } from "./spec";

export type Template = {
  id: string;
  category: string;
  name: string;
  description: string;
  problems: string[];
  modules: string[];
  sector: keyof typeof SECTORS;
  customization: string[];
  build: () => AppSpec;
};

function tpl(t: Omit<Template, "build">): Template {
  return {
    ...t,
    build: () =>
      composeSpec({
        source: "rules",
        businessName: t.name,
        sector: t.sector,
        sectorLabel: SECTORS[t.sector]!.label,
        mainProblem: t.description,
        causes: [],
        solutions: [],
        manualTasks: [],
        dataToKeep: [],
        users: "",
        automations: [],
        limits: [],
        questions: [],
        features: t.modules.map((id) => ({ id, title: getModule(id)!.title, description: "", selected: true })),
      }),
  };
}

const custom = ["Couleurs, logo et textes", "Ajout ou retrait de champs et de pages par l'assistant IA", "Rôles et permissions de l'équipe"];

export const TEMPLATES: Template[] = [
  tpl({ id: "boutique", category: "Commerce", sector: "boutique", name: "Gestion de boutique", description: "Stocks, ventes, clients et fournisseurs d'une boutique.", problems: ["Ruptures de stock imprévues", "Ventes notées sur un cahier", "Aucune vue du chiffre d'affaires"], modules: ["produits", "ventes", "clients", "fournisseurs"], customization: custom }),
  tpl({ id: "restaurant", category: "Restauration", sector: "restaurant", name: "Gestion de restaurant", description: "Commandes, stocks de cuisine et dépenses.", problems: ["Commandes perdues", "Stocks de cuisine mal suivis", "Dépenses non maîtrisées"], modules: ["commandes", "produits", "depenses", "clients"], customization: custom }),
  tpl({ id: "garage", category: "Garage", sector: "garage", name: "Suivi d'atelier garage", description: "Réparations, clients, factures et pièces détachées.", problems: ["Suivi des véhicules au tableau blanc", "Factures oubliées", "Pièces introuvables"], modules: ["reparations", "clients", "factures", "produits"], customization: custom }),
  tpl({ id: "pharmacie", category: "Pharmacie", sector: "pharmacie", name: "Gestion de pharmacie", description: "Médicaments, péremptions, ventes et fournisseurs.", problems: ["Médicaments périmés en rayon", "Ruptures de stock", "Commandes fournisseurs manuelles"], modules: ["medicaments", "ventes", "fournisseurs"], customization: custom }),
  tpl({ id: "ecole", category: "École", sector: "ecole", name: "Gestion scolaire", description: "Élèves, paiements des frais de scolarité et personnel.", problems: ["Frais de scolarité non suivis", "Listes de classes sur papier", "Contacts des parents dispersés"], modules: ["eleves", "paiements", "employes"], customization: custom }),
  tpl({ id: "hotel", category: "Hôtel", sector: "hotel", name: "Réservations d'hôtel", description: "Chambres, réservations, clients et dépenses.", problems: ["Doubles réservations", "Disponibilités inconnues", "Recettes difficiles à suivre"], modules: ["chambres", "reservations", "clients", "depenses"], customization: custom }),
  tpl({ id: "immobilier", category: "Immobilier", sector: "immobilier", name: "Gestion locative", description: "Biens, locataires et encaissement des loyers.", problems: ["Loyers impayés non détectés", "Biens libres non visibles", "Contrats dispersés"], modules: ["biens", "locataires", "paiements"], customization: custom }),
  tpl({ id: "transport", category: "Transport", sector: "transport", name: "Livraisons et flotte", description: "Livraisons, véhicules, chauffeurs et dépenses.", problems: ["Livraisons non suivies", "Entretien des véhicules oublié", "Coûts de carburant flous"], modules: ["livraisons", "vehicules", "employes", "depenses"], customization: custom }),
  tpl({ id: "salon", category: "Services", sector: "salon", name: "Salon et rendez-vous", description: "Rendez-vous, clients et ventes de prestations.", problems: ["Agenda papier saturé", "Clients non relancés", "Recettes non suivies"], modules: ["rendezvous", "clients", "ventes"], customization: custom }),
  tpl({ id: "interne", category: "Gestion interne", sector: "interne", name: "Suivi d'équipe et projets", description: "Personnel, tâches, échéances et dépenses internes.", problems: ["Tâches en retard", "Responsabilités floues", "Dépenses internes non suivies"], modules: ["employes", "taches", "depenses"], customization: custom }),
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
