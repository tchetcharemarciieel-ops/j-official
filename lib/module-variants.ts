import { getModule, type Module } from "./modules";
import type { Field, FieldType, Widget } from "./spec";

/**
 * Adaptation des modules à chaque métier : mêmes tables (les identifiants ne changent jamais), mais
 * des libellés, listes de choix et champs propres à l'activité. Ex. « Rendez-vous » devient
 * « Réservations de tables » au restaurant et « Rendez-vous atelier » au garage.
 */
type Patch = {
  title?: string;
  description?: string;
  label?: string;
  labelPlural?: string;
  icon?: string;
  /** Modifie un champ existant (libellé, type, choix, affichage). */
  fields?: Record<string, Partial<Field>>;
  /** Champs ajoutés à la fin. */
  add?: Field[];
  remove?: string[];
  widgets?: Widget[];
};

const F = (key: string, label: string, type: FieldType = "text", extra: Partial<Field> = {}): Field => ({ key, label, type, required: false, showInTable: true, ...extra });
const H = { showInTable: false };
const cats = (...o: string[]) => ({ options: [...o, "Autre"] });
const PAY = ["Espèces", "Mobile Money", "Carte", "Crédit"];

export const VARIANTS: Record<string, Record<string, Patch>> = {
  restaurant: {
    clients: { title: "Clients et habitués", description: "Clients réguliers, coordonnées et préférences.", add: [F("preferences", "Préférences (plats, allergies)", "longtext", H)] },
    commandes: { description: "Commandes sur place, à emporter ou livrées, avec suivi du statut.", fields: { reference: { label: "N° de commande" }, details: { label: "Plats et boissons" } }, add: [F("type", "Type", "select", { options: ["Sur place", "À emporter", "Livraison"], showInTable: false }), F("table", "Table", "text", H), F("serveur", "Serveur", "text", H)] },
    produits: { title: "Stock de cuisine et boissons", description: "Ingrédients, boissons, quantités et alertes de rupture.", labelPlural: "Ingrédients et boissons", label: "Ingrédient / boisson", fields: { nom: { label: "Article" }, categorie: { label: "Catégorie", type: "select", options: ["Viande / poisson", "Légumes", "Féculents", "Boissons", "Épicerie", "Autre"] }, prix_vente: { label: "Prix de vente (si revendu)" } } },
    ventes: { title: "Ventes du jour", description: "Recettes par plat ou boisson, avec statistiques mensuelles.", fields: { article: { label: "Plat / boisson" }, paiement: { options: PAY } } },
    depenses: { fields: { categorie: cats("Ingrédients", "Boissons", "Gaz / charbon", "Salaires", "Loyer", "Électricité / eau", "Transport") } },
    rendezvous: { title: "Réservations de tables", description: "Réservations avec nombre de couverts, table et statut.", label: "Réservation", labelPlural: "Réservations", icon: "🍽️", fields: { nom_client: { label: "Nom du client" }, prestation: { label: "Occasion", type: "select", options: ["Repas", "Anniversaire", "Réunion", "Événement"] }, prix: { label: "Acompte / menu" }, statut: { options: ["Prévue", "Confirmée", "Arrivée", "Annulée", "Absent"] } }, add: [F("couverts", "Nombre de couverts", "number"), F("table", "Table", "text", H)], remove: ["duree", "employe", "acompte"] },
    employes: { fields: { poste: { label: "Poste", type: "select", options: ["Gérant", "Cuisinier", "Aide-cuisinier", "Serveur", "Caissier", "Livreur", "Plongeur"] } } },
  },
  garage: {
    clients: { title: "Clients et véhicules", add: [F("vehicule_habituel", "Véhicule(s)", "text", H)] },
    reparations: { description: "Véhicules reçus, diagnostic, pièces, coût et avancement des travaux.", add: [F("kilometrage", "Kilométrage", "number", H), F("mecanicien", "Mécanicien", "text", H), F("date_sortie", "Date de sortie", "date", H)] },
    produits: { title: "Pièces détachées", description: "Pièces, quantités, prix d'achat et de vente, alertes de rupture.", label: "Pièce", labelPlural: "Pièces", icon: "⚙️", fields: { nom: { label: "Pièce" }, categorie: { label: "Famille", type: "select", options: ["Moteur", "Freinage", "Pneus", "Huiles / filtres", "Électricité", "Carrosserie", "Autre"] } } },
    factures: { description: "Factures de réparation et suivi des paiements.", add: [F("immatriculation", "Immatriculation", "text", H)] },
    ventes: { fields: { article: { label: "Pièce / prestation" } } },
    depenses: { fields: { categorie: cats("Pièces", "Outillage", "Salaires", "Loyer", "Électricité / eau", "Transport") } },
    rendezvous: { title: "Rendez-vous atelier", description: "Prises de rendez-vous pour entretien et réparation.", label: "Rendez-vous atelier", labelPlural: "Rendez-vous atelier", icon: "🔧", fields: { nom_client: { label: "Nom du client" }, prestation: { label: "Intervention", type: "select", options: ["Vidange", "Freins", "Diagnostic", "Pneus", "Révision", "Climatisation", "Carrosserie"] }, employe: { label: "Mécanicien" } }, add: [F("immatriculation", "Immatriculation", "text")] },
    employes: { fields: { poste: { type: "select", options: ["Chef d'atelier", "Mécanicien", "Électricien auto", "Carrossier", "Magasinier", "Accueil"] } } },
  },
  pharmacie: {
    medicaments: { description: "Médicaments, lots, péremption, stock et prix.", add: [F("forme", "Forme", "select", { options: ["Comprimé", "Sirop", "Injectable", "Pommade", "Autre"], showInTable: false }), F("fournisseur", "Fournisseur", "text", H)] },
    ventes: { fields: { article: { label: "Médicament / produit" }, paiement: { options: ["Espèces", "Mobile Money", "Carte", "Mutuelle / assurance", "Crédit"] } } },
    fournisseurs: { description: "Grossistes, contacts et produits fournis." },
    depenses: { fields: { categorie: cats("Achat de médicaments", "Salaires", "Loyer", "Électricité / eau", "Transport", "Entretien") } },
    employes: { fields: { poste: { type: "select", options: ["Pharmacien", "Préparateur", "Vendeur", "Caissier", "Livreur"] } } },
  },
  boutique: {
    clients: { title: "Clients et crédits", description: "Clients, coordonnées et soldes à recouvrer.", add: [F("solde_du", "Solde dû", "money")] },
    produits: { fields: { categorie: { type: "select", options: ["Vêtements", "Chaussures", "Alimentaire", "Téléphones", "Cosmétiques", "Quincaillerie", "Autre"] } } },
    ventes: { description: "Ventes par article, remises et modes de paiement (crédit compris)." },
    depenses: { fields: { categorie: cats("Achat de marchandises", "Transport", "Salaires", "Loyer", "Électricité / eau", "Emballages") } },
    fournisseurs: { description: "Fournisseurs, grossistes et produits fournis." },
  },
  salon: {
    clients: { title: "Clientèle", description: "Fiches clientes, préférences et historique.", add: [F("preferences", "Préférences / allergies", "longtext", H)] },
    rendezvous: { title: "Rendez-vous du salon", description: "Agenda des prestations avec durée, coiffeur et acompte.", fields: { prestation: { type: "select", options: ["Coupe", "Coiffure", "Tresses", "Défrisage", "Coloration", "Soins", "Manucure", "Pédicure", "Barbe", "Massage"] }, employe: { label: "Coiffeur / esthéticienne" }, duree: { showInTable: true } } },
    ventes: { title: "Prestations et produits vendus", fields: { article: { label: "Prestation / produit" } } },
    depenses: { fields: { categorie: cats("Produits", "Matériel", "Salaires", "Loyer", "Électricité / eau", "Publicité") } },
    employes: { fields: { poste: { type: "select", options: ["Coiffeur", "Coiffeuse", "Esthéticienne", "Barbier", "Accueil", "Apprenti"] } } },
  },
  ecole: {
    eleves: { description: "Inscriptions, classes, contacts des parents et situation.", add: [F("matricule", "Matricule", "text", H), F("statut", "Statut", "select", { options: ["Inscrit", "Réinscrit", "Abandon", "Transféré"], showInTable: false })] },
    paiements: { title: "Frais de scolarité", description: "Paiements reçus par élève : inscription, scolarité, cantine.", add: [F("eleve", "Élève", "text"), F("periode", "Période", "select", { options: ["Inscription", "1er trimestre", "2e trimestre", "3e trimestre", "Cantine", "Autre"], showInTable: false })], fields: { payeur: { label: "Payé par (parent)" }, motif: { label: "Motif" } } },
    employes: { title: "Enseignants et personnel", fields: { poste: { type: "select", options: ["Directeur", "Enseignant", "Surveillant", "Secrétaire", "Comptable", "Agent d'entretien"] } }, add: [F("matiere", "Matière / classe", "text", H)] },
    depenses: { fields: { categorie: cats("Salaires enseignants", "Fournitures", "Entretien", "Électricité / eau", "Loyer") } },
  },
  hotel: {
    clients: { title: "Clients et hôtes", description: "Hôtes, coordonnées et préférences de séjour." },
    reservations: { fields: { client: { label: "Nom du client" }, montant: { label: "Montant du séjour" } }, add: [F("adultes", "Nombre de personnes", "number", H), F("avance", "Avance versée", "money", H)] },
    chambres: { add: [F("etage", "Étage", "text", H), F("equipements", "Équipements", "text", H)] },
    depenses: { fields: { categorie: cats("Entretien", "Blanchisserie", "Approvisionnement", "Salaires", "Électricité / eau", "Internet") } },
  },
  immobilier: {
    clients: { title: "Propriétaires et clients", description: "Propriétaires, locataires potentiels et acquéreurs.", fields: { type: { options: ["Propriétaire", "Locataire", "Acquéreur"] } } },
    biens: { add: [F("proprietaire", "Propriétaire", "text", H), F("surface", "Surface (m²)", "number", H), F("commission", "Commission de l'agence", "money", H)] },
    locataires: { add: [F("caution", "Caution versée", "money", H), F("echeance", "Jour d'échéance du loyer", "number", H)] },
    paiements: { title: "Loyers et paiements", description: "Loyers, cautions et frais encaissés.", fields: { payeur: { label: "Payé par (locataire)" }, motif: { label: "Bien / période" } } },
    factures: { title: "Quittances et factures", description: "Quittances de loyer et factures d'honoraires." },
  },
  transport: {
    livraisons: { description: "Courses et livraisons avec chauffeur, véhicule et statut.", add: [F("vehicule", "Véhicule", "text", H), F("poids", "Poids (kg)", "number", H), F("paiement", "Paiement", "select", { options: ["Espèces", "Mobile Money", "À la livraison", "Déjà payé"], showInTable: false })] },
    vehicules: { add: [F("assurance_fin", "Fin d'assurance", "date", H), F("kilometrage", "Kilométrage", "number", H)] },
    depenses: { fields: { categorie: cats("Carburant", "Entretien véhicules", "Assurance", "Salaires chauffeurs", "Péage / stationnement", "Loyer") } },
    employes: { fields: { poste: { type: "select", options: ["Chauffeur", "Livreur", "Mécanicien", "Dispatcheur", "Comptable"] } }, add: [F("permis", "Permis (catégorie)", "text", H)] },
  },
  interne: {
    employes: { add: [F("service", "Service", "text", H)] },
    taches: { add: [F("projet", "Projet", "text", H), F("avancement", "Avancement (%)", "number", H)] },
  },
};

/** Module adapté au métier (copie : le module de base n'est jamais modifié). */
export function adaptModule(base: Module, sector: string | null | undefined): Module {
  const m = structuredClone(base);
  const p = sector ? VARIANTS[sector]?.[m.id] : undefined;
  if (!p) return m;
  if (p.title) m.title = p.title;
  if (p.description) m.description = p.description;
  if (p.label) m.entity.label = p.label;
  if (p.labelPlural) m.entity.labelPlural = p.labelPlural;
  if (p.icon) m.entity.icon = p.icon;
  m.entity.fields = m.entity.fields.filter((f) => !p.remove?.includes(f.key)).map((f) => (p.fields?.[f.key] ? { ...f, ...p.fields[f.key]! } : f));
  for (const a of p.add ?? []) if (!m.entity.fields.some((f) => f.key === a.key)) m.entity.fields.push(a);
  m.widgets = [...m.widgets, ...(p.widgets ?? [])];
  return m;
}

/** Module `id` adapté au secteur (undefined si le module n'existe pas). */
export function getModuleFor(id: string, sector: string | null | undefined): Module | undefined {
  const m = getModule(id);
  return m ? adaptModule(m, sector) : undefined;
}
