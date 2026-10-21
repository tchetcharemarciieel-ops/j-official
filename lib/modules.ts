import type { Entity, Field, FieldType, Widget } from "./spec";

/**
 * Bibliothèque de modules métier validés. Chaque module apporte une table,
 * ses champs et les indicateurs de tableau de bord associés.
 * Le générateur combine les modules utiles au besoin du client.
 */
export type Module = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  entity: Entity;
  widgets: Widget[];
};

function f(key: string, label: string, type: FieldType = "text", extra: Partial<Field> = {}): Field {
  return { key, label, type, required: false, showInTable: true, ...extra };
}
const req = { required: true };
const hidden = { showInTable: false };

function ent(
  key: string,
  label: string,
  labelPlural: string,
  icon: string,
  fields: Field[],
  description = "",
): Entity {
  return { key, label, labelPlural, icon, description, fields, permissions: {} };
}

export const MODULES: Module[] = [
  {
    id: "clients",
    title: "Gestion des clients",
    description: "Fichier clients avec coordonnées et notes.",
    keywords: ["client", "clientele", "fidel", "contact"],
    entity: ent("clients", "Client", "Clients", "👥", [
      f("nom", "Nom", "text", req),
      f("telephone", "Téléphone", "phone"),
      f("email", "E-mail", "email"),
      f("adresse", "Adresse", "text", hidden),
      f("notes", "Notes", "longtext", hidden),
    ]),
    widgets: [{ type: "count", label: "Clients", entity: "clients" }],
  },
  {
    id: "commandes",
    title: "Gestion des commandes",
    description: "Prise de commandes, suivi du statut et du montant.",
    keywords: ["commande", "order", "plat", "menu", "table"],
    entity: ent("commandes", "Commande", "Commandes", "🧾", [
      f("reference", "Référence", "text", req),
      f("client", "Client", "relation", { relation: "clients" }),
      f("date", "Date", "date", req),
      f("details", "Détails", "longtext", hidden),
      f("montant", "Montant", "money", req),
      f("statut", "Statut", "select", { options: ["En attente", "En préparation", "Servie / livrée", "Payée", "Annulée"], required: true }),
    ]),
    widgets: [
      { type: "sum", label: "Chiffre d'affaires des commandes", entity: "commandes", field: "montant" },
      { type: "monthly", label: "Commandes par mois (FCFA)", entity: "commandes", field: "montant", dateField: "date" },
      { type: "breakdown", label: "Commandes par statut", entity: "commandes", field: "statut" },
    ],
  },
  {
    id: "produits",
    title: "Gestion des stocks",
    description: "Articles, quantités, prix et alertes de stock bas.",
    keywords: ["stock", "produit", "article", "inventaire", "marchandise", "boutique", "magasin"],
    entity: ent("produits", "Produit", "Produits", "📦", [
      f("nom", "Nom", "text", req),
      f("categorie", "Catégorie", "text"),
      f("quantite", "Quantité en stock", "number", req),
      f("seuil", "Seuil d'alerte", "number"),
      f("prix_achat", "Prix d'achat", "money", hidden),
      f("prix_vente", "Prix de vente", "money"),
    ]),
    widgets: [
      { type: "low_stock", label: "Produits presque épuisés", entity: "produits", field: "quantite", threshold: 5 },
      { type: "count", label: "Produits référencés", entity: "produits" },
    ],
  },
  {
    id: "ventes",
    title: "Suivi des ventes",
    description: "Enregistrement des ventes et statistiques mensuelles.",
    keywords: ["vente", "caisse", "vendu", "chiffre"],
    entity: ent("ventes", "Vente", "Ventes", "💰", [
      f("date", "Date", "date", req),
      f("article", "Article", "text", req),
      f("quantite", "Quantité", "number"),
      f("montant", "Montant", "money", req),
      f("paiement", "Mode de paiement", "select", { options: ["Espèces", "Mobile Money", "Carte", "Crédit"] }),
    ]),
    widgets: [
      { type: "sum", label: "Total des ventes", entity: "ventes", field: "montant" },
      { type: "monthly", label: "Ventes par mois (FCFA)", entity: "ventes", field: "montant", dateField: "date" },
    ],
  },
  {
    id: "depenses",
    title: "Suivi des dépenses",
    description: "Dépenses par catégorie et par mois.",
    keywords: ["depense", "frais", "charge", "achat", "cout"],
    entity: ent("depenses", "Dépense", "Dépenses", "💸", [
      f("date", "Date", "date", req),
      f("libelle", "Libellé", "text", req),
      f("categorie", "Catégorie", "select", { options: ["Achats", "Salaires", "Loyer", "Électricité / eau", "Transport", "Autre"] }),
      f("montant", "Montant", "money", req),
    ]),
    widgets: [
      { type: "sum", label: "Total des dépenses", entity: "depenses", field: "montant" },
      { type: "breakdown", label: "Dépenses par catégorie", entity: "depenses", field: "categorie" },
    ],
  },
  {
    id: "factures",
    title: "Facturation",
    description: "Factures émises et suivi des paiements.",
    keywords: ["facture", "devis", "impaye", "payer", "paiement"],
    entity: ent("factures", "Facture", "Factures", "📄", [
      f("numero", "Numéro", "text", req),
      f("client", "Client", "relation", { relation: "clients" }),
      f("date", "Date", "date", req),
      f("montant", "Montant", "money", req),
      f("statut", "Statut", "select", { options: ["À payer", "Payée partiellement", "Payée"], required: true }),
    ]),
    widgets: [
      { type: "breakdown", label: "Factures par statut", entity: "factures", field: "statut" },
      { type: "sum", label: "Montant facturé", entity: "factures", field: "montant" },
    ],
  },
  {
    id: "rendezvous",
    title: "Gestion des rendez-vous",
    description: "Agenda des rendez-vous avec prestation et statut.",
    keywords: ["rendez", "rdv", "agenda", "coiffure", "salon", "consultation", "planning"],
    entity: ent("rendezvous", "Rendez-vous", "Rendez-vous", "📅", [
      f("client", "Client", "relation", { relation: "clients" }),
      f("nom_client", "Nom du client", "text", req),
      f("date", "Date", "date", req),
      f("heure", "Heure", "text"),
      f("prestation", "Prestation", "text"),
      f("prix", "Prix", "money"),
      f("statut", "Statut", "select", { options: ["Prévu", "Confirmé", "Terminé", "Annulé"] }),
    ]),
    widgets: [
      { type: "recent", label: "Prochains rendez-vous", entity: "rendezvous" },
      { type: "monthly", label: "Rendez-vous par mois (FCFA)", entity: "rendezvous", field: "prix", dateField: "date" },
    ],
  },
  {
    id: "reparations",
    title: "Suivi des réparations",
    description: "Véhicules reçus, diagnostic, coût et avancement.",
    keywords: ["garage", "reparation", "vehicule", "voiture", "mecanique", "panne", "moto"],
    entity: ent("reparations", "Réparation", "Réparations", "🔧", [
      f("immatriculation", "Immatriculation", "text", req),
      f("vehicule", "Véhicule", "text"),
      f("client", "Client", "relation", { relation: "clients" }),
      f("date_entree", "Date d'entrée", "date", req),
      f("diagnostic", "Diagnostic", "longtext", hidden),
      f("cout", "Coût", "money"),
      f("statut", "Statut", "select", { options: ["Reçu", "Diagnostic", "En réparation", "Prêt", "Livré"], required: true }),
    ]),
    widgets: [
      { type: "breakdown", label: "Réparations par statut", entity: "reparations", field: "statut" },
      { type: "sum", label: "Montant des réparations", entity: "reparations", field: "cout" },
    ],
  },
  {
    id: "medicaments",
    title: "Stock de médicaments",
    description: "Médicaments, lots, péremption et stock.",
    keywords: ["pharmacie", "medicament", "ordonnance", "peremption"],
    entity: ent("medicaments", "Médicament", "Médicaments", "💊", [
      f("nom", "Nom", "text", req),
      f("lot", "N° de lot", "text"),
      f("peremption", "Date de péremption", "date"),
      f("quantite", "Quantité", "number", req),
      f("prix", "Prix", "money"),
      f("ordonnance", "Sur ordonnance", "boolean"),
    ]),
    widgets: [{ type: "low_stock", label: "Médicaments en rupture proche", entity: "medicaments", field: "quantite", threshold: 10 }],
  },
  {
    id: "eleves",
    title: "Gestion des élèves",
    description: "Inscriptions, classes et contacts des parents.",
    keywords: ["ecole", "eleve", "etudiant", "classe", "scolarite", "inscription"],
    entity: ent("eleves", "Élève", "Élèves", "🎓", [
      f("nom", "Nom complet", "text", req),
      f("classe", "Classe", "text", req),
      f("date_naissance", "Date de naissance", "date", hidden),
      f("parent", "Parent / tuteur", "text"),
      f("telephone_parent", "Téléphone du parent", "phone"),
    ]),
    widgets: [
      { type: "count", label: "Élèves inscrits", entity: "eleves" },
      { type: "breakdown", label: "Élèves par classe", entity: "eleves", field: "classe" },
    ],
  },
  {
    id: "paiements",
    title: "Paiements et frais",
    description: "Paiements reçus (scolarité, loyers, cotisations…).",
    keywords: ["paiement", "frais", "scolarite", "cotisation", "versement", "reste a payer"],
    entity: ent("paiements", "Paiement", "Paiements", "🧮", [
      f("payeur", "Payé par", "text", req),
      f("date", "Date", "date", req),
      f("motif", "Motif", "text"),
      f("montant", "Montant", "money", req),
      f("mode", "Mode", "select", { options: ["Espèces", "Mobile Money", "Virement", "Chèque"] }),
    ]),
    widgets: [
      { type: "sum", label: "Total encaissé", entity: "paiements", field: "montant" },
      { type: "monthly", label: "Encaissements par mois (FCFA)", entity: "paiements", field: "montant", dateField: "date" },
    ],
  },
  {
    id: "chambres",
    title: "Chambres et logements",
    description: "Chambres, catégories, tarifs et disponibilité.",
    keywords: ["hotel", "chambre", "auberge", "residence", "lit"],
    entity: ent("chambres", "Chambre", "Chambres", "🛏️", [
      f("numero", "Numéro", "text", req),
      f("type", "Type", "select", { options: ["Simple", "Double", "Suite", "Familiale"] }),
      f("tarif", "Tarif par nuit", "money", req),
      f("disponible", "Disponible", "boolean"),
    ]),
    widgets: [{ type: "breakdown", label: "Chambres par type", entity: "chambres", field: "type" }],
  },
  {
    id: "reservations",
    title: "Gestion des réservations",
    description: "Réservations avec dates d'arrivée et de départ.",
    keywords: ["reservation", "reserver", "sejour", "booking", "hotel", "location"],
    entity: ent("reservations", "Réservation", "Réservations", "🗓️", [
      f("client", "Client", "text", req),
      f("telephone", "Téléphone", "phone"),
      f("chambre", "Chambre", "relation", { relation: "chambres" }),
      f("arrivee", "Arrivée", "date", req),
      f("depart", "Départ", "date", req),
      f("montant", "Montant", "money"),
      f("statut", "Statut", "select", { options: ["Confirmée", "En attente", "Arrivé", "Parti", "Annulée"] }),
    ]),
    widgets: [
      { type: "recent", label: "Dernières réservations", entity: "reservations" },
      { type: "monthly", label: "Réservations par mois (FCFA)", entity: "reservations", field: "montant", dateField: "arrivee" },
    ],
  },
  {
    id: "biens",
    title: "Biens immobiliers",
    description: "Biens gérés, adresse, loyer et statut.",
    keywords: ["immobilier", "appartement", "maison", "bien", "agence", "bail"],
    entity: ent("biens", "Bien", "Biens", "🏠", [
      f("designation", "Désignation", "text", req),
      f("adresse", "Adresse", "text"),
      f("type", "Type", "select", { options: ["Studio", "Appartement", "Maison", "Bureau", "Terrain"] }),
      f("loyer", "Loyer mensuel", "money"),
      f("statut", "Statut", "select", { options: ["Libre", "Loué", "En travaux"] }),
    ]),
    widgets: [{ type: "breakdown", label: "Biens par statut", entity: "biens", field: "statut" }],
  },
  {
    id: "locataires",
    title: "Locataires et loyers",
    description: "Locataires, bien occupé et suivi des loyers.",
    keywords: ["locataire", "loyer", "bail", "location"],
    entity: ent("locataires", "Locataire", "Locataires", "🔑", [
      f("nom", "Nom", "text", req),
      f("telephone", "Téléphone", "phone"),
      f("bien", "Bien loué", "relation", { relation: "biens" }),
      f("debut_bail", "Début du bail", "date"),
      f("loyer", "Loyer", "money"),
      f("a_jour", "Loyer à jour", "boolean"),
    ]),
    widgets: [{ type: "breakdown", label: "Locataires à jour du loyer", entity: "locataires", field: "a_jour" }],
  },
  {
    id: "livraisons",
    title: "Gestion des livraisons",
    description: "Courses et livraisons avec chauffeur et statut.",
    keywords: ["livraison", "transport", "colis", "course", "chauffeur", "logistique"],
    entity: ent("livraisons", "Livraison", "Livraisons", "🚚", [
      f("reference", "Référence", "text", req),
      f("destinataire", "Destinataire", "text", req),
      f("adresse", "Adresse", "text"),
      f("chauffeur", "Chauffeur", "text"),
      f("date", "Date", "date", req),
      f("prix", "Prix", "money"),
      f("statut", "Statut", "select", { options: ["À livrer", "En route", "Livrée", "Échec"], required: true }),
    ]),
    widgets: [
      { type: "breakdown", label: "Livraisons par statut", entity: "livraisons", field: "statut" },
      { type: "monthly", label: "Livraisons par mois (FCFA)", entity: "livraisons", field: "prix", dateField: "date" },
    ],
  },
  {
    id: "vehicules",
    title: "Parc de véhicules",
    description: "Véhicules, entretien et disponibilité.",
    keywords: ["vehicule", "flotte", "camion", "taxi", "parc"],
    entity: ent("vehicules", "Véhicule", "Véhicules", "🚗", [
      f("immatriculation", "Immatriculation", "text", req),
      f("modele", "Modèle", "text"),
      f("prochain_entretien", "Prochain entretien", "date"),
      f("disponible", "Disponible", "boolean"),
    ]),
    widgets: [{ type: "count", label: "Véhicules", entity: "vehicules" }],
  },
  {
    id: "employes",
    title: "Gestion du personnel",
    description: "Employés, postes, salaires et contacts.",
    keywords: ["employe", "personnel", "salarie", "equipe", "staff", "rh", "salaire"],
    entity: ent("employes", "Employé", "Employés", "🧑‍💼", [
      f("nom", "Nom", "text", req),
      f("poste", "Poste", "text"),
      f("telephone", "Téléphone", "phone"),
      f("date_embauche", "Date d'embauche", "date", hidden),
      f("salaire", "Salaire", "money", hidden),
    ]),
    widgets: [{ type: "count", label: "Employés", entity: "employes" }],
  },
  {
    id: "taches",
    title: "Suivi des tâches et projets",
    description: "Tâches, responsables, échéances et avancement.",
    keywords: ["tache", "projet", "suivi", "echeance", "retard", "chantier"],
    entity: ent("taches", "Tâche", "Tâches", "✅", [
      f("titre", "Titre", "text", req),
      f("responsable", "Responsable", "text"),
      f("echeance", "Échéance", "date"),
      f("priorite", "Priorité", "select", { options: ["Basse", "Normale", "Haute"] }),
      f("statut", "Statut", "select", { options: ["À faire", "En cours", "Terminée"], required: true }),
    ]),
    widgets: [{ type: "breakdown", label: "Tâches par statut", entity: "taches", field: "statut" }],
  },
  {
    id: "fournisseurs",
    title: "Fournisseurs",
    description: "Fournisseurs et coordonnées.",
    keywords: ["fournisseur", "approvisionnement", "grossiste"],
    entity: ent("fournisseurs", "Fournisseur", "Fournisseurs", "🏭", [
      f("nom", "Nom", "text", req),
      f("contact", "Contact", "text"),
      f("telephone", "Téléphone", "phone"),
      f("produits", "Produits fournis", "longtext", hidden),
    ]),
    widgets: [],
  },
];

export function getModule(id: string): Module | undefined {
  return MODULES.find((m) => m.id === id);
}
