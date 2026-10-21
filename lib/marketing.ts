import { TEMPLATES, type Template } from "./templates";

/**
 * Contenu des pages par secteur (référencement et prospection).
 * Uniquement des fonctions réellement disponibles dans les logiciels générés.
 */
export type SectorPage = {
  slug: string;
  template: Template;
  seoTitle: string;
  seoDescription: string;
  headline: string;
  subtitle: string;
  audience: string;
  benefits: { title: string; text: string }[];
  example: string;
};

const CONTENT: Record<string, Omit<SectorPage, "slug" | "template">> = {
  restaurant: {
    seoTitle: "Logiciel de gestion de restaurant en FCFA",
    seoDescription: "Commandes, stocks de cuisine, dépenses et clients de votre restaurant ou maquis, dans un logiciel simple accessible depuis le téléphone.",
    headline: "Votre restaurant, sans cahier ni commandes perdues",
    subtitle: "Commandes, stocks de cuisine et dépenses suivis au même endroit, depuis le téléphone de la caisse ou de la cuisine.",
    audience: "Restaurants, maquis, snacks, traiteurs, bars",
    benefits: [
      { title: "Commandes suivies", text: "Chaque commande a un statut : en attente, en préparation, servie, payée." },
      { title: "Stock sous contrôle", text: "Les produits presque épuisés apparaissent sur le tableau de bord." },
      { title: "Dépenses claires", text: "Achats, gaz, électricité, salaires : le total par catégorie et par mois." },
      { title: "Employés encadrés", text: "Le serveur saisit les commandes sans pouvoir modifier les prix." },
    ],
    example: "Je veux gérer les commandes, les stocks et les dépenses de mon restaurant.",
  },
  boutique: {
    seoTitle: "Logiciel de gestion de stock et de ventes pour boutique",
    seoDescription: "Stocks, ventes, clients et fournisseurs de votre boutique ou quincaillerie, avec alertes de rupture et chiffre d'affaires mensuel en FCFA.",
    headline: "Sachez ce qui se vend, ce qui manque et ce que vous gagnez",
    subtitle: "Stocks, ventes et fournisseurs de votre commerce, avec les alertes de rupture et le chiffre d'affaires du mois.",
    audience: "Boutiques, quincailleries, supérettes, grossistes",
    benefits: [
      { title: "Alertes de rupture", text: "Fixez un seuil par produit : le tableau de bord vous prévient." },
      { title: "Ventes du mois", text: "Graphique des ventes mois par mois, total en FCFA." },
      { title: "Clients et crédits", text: "Fichier clients et mode de paiement de chaque vente." },
      { title: "Import de votre fichier", text: "Votre liste de produits Excel ou CSV s'importe en quelques clics." },
    ],
    example: "Je veux gérer les stocks et les ventes de ma boutique.",
  },
  garage: {
    seoTitle: "Logiciel de suivi des réparations pour garage",
    seoDescription: "Véhicules reçus, diagnostics, coûts, factures et pièces détachées de votre garage auto ou moto, dans un logiciel simple.",
    headline: "Chaque véhicule suivi, de l'entrée à la livraison",
    subtitle: "Réparations, clients, factures et pièces détachées de votre atelier, accessibles depuis le téléphone.",
    audience: "Garages auto, ateliers moto, mécaniciens",
    benefits: [
      { title: "Atelier en un coup d'œil", text: "Réparations par statut : reçu, diagnostic, en réparation, prêt, livré." },
      { title: "Factures suivies", text: "Factures à payer, payées partiellement ou soldées." },
      { title: "Pièces en stock", text: "Les pièces à recommander apparaissent automatiquement." },
      { title: "Historique client", text: "Retrouvez une voiture par sa plaque d'immatriculation." },
    ],
    example: "Je veux un logiciel pour suivre les réparations de mon garage.",
  },
  pharmacie: {
    seoTitle: "Logiciel de gestion de pharmacie : stock et péremptions",
    seoDescription: "Médicaments, lots, dates de péremption, ventes et fournisseurs de votre pharmacie ou officine, avec alertes de rupture.",
    headline: "Plus de médicament périmé ni de rupture surprise",
    subtitle: "Stock par lot, dates de péremption, ventes et fournisseurs de votre officine.",
    audience: "Pharmacies, officines, dépôts pharmaceutiques",
    benefits: [
      { title: "Péremptions visibles", text: "Chaque lot avec sa date de péremption, triable et filtrable." },
      { title: "Ruptures anticipées", text: "Les médicaments sous le seuil apparaissent sur le tableau de bord." },
      { title: "Ventes du mois", text: "Encaissements par mois en FCFA." },
      { title: "Fournisseurs", text: "Contacts et produits de chaque grossiste." },
    ],
    example: "Je veux gérer le stock et les péremptions de ma pharmacie.",
  },
  ecole: {
    seoTitle: "Logiciel de gestion scolaire : élèves et frais de scolarité",
    seoDescription: "Élèves, classes, paiements des frais de scolarité et personnel de votre école, avec le total encaissé par mois en FCFA.",
    headline: "Les frais de scolarité enfin suivis, élève par élève",
    subtitle: "Inscriptions, classes, paiements et contacts des parents de votre établissement.",
    audience: "Écoles maternelles et primaires, collèges, lycées privés, centres de formation",
    benefits: [
      { title: "Paiements suivis", text: "Chaque versement enregistré avec son motif et son mode de paiement." },
      { title: "Classes organisées", text: "Nombre d'élèves par classe sur le tableau de bord." },
      { title: "Parents joignables", text: "Téléphone du parent ou tuteur sur la fiche de l'élève." },
      { title: "Personnel", text: "Enseignants et employés avec leur poste." },
    ],
    example: "Je veux gérer les élèves et les paiements de mon école.",
  },
  hotel: {
    seoTitle: "Logiciel de réservation pour hôtel et auberge",
    seoDescription: "Chambres, réservations, clients et dépenses de votre hôtel, auberge ou résidence, avec les recettes par mois en FCFA.",
    headline: "Vos chambres et vos réservations au même endroit",
    subtitle: "Chambres, arrivées, départs et recettes de votre établissement, au même endroit.",
    audience: "Hôtels, auberges, résidences meublées, motels",
    benefits: [
      { title: "Réservations claires", text: "Arrivée, départ, chambre et statut de chaque séjour, visibles par toute l'équipe." },
      { title: "Chambres disponibles", text: "Chambres par type et disponibilité." },
      { title: "Recettes mensuelles", text: "Montant des réservations par mois." },
      { title: "Dépenses", text: "Charges de l'établissement par catégorie." },
    ],
    example: "Je veux créer un système de réservation pour mon hôtel.",
  },
  immobilier: {
    seoTitle: "Logiciel de gestion locative : biens, locataires et loyers",
    seoDescription: "Biens immobiliers, locataires et encaissement des loyers pour agences immobilières et propriétaires bailleurs.",
    headline: "Chaque loyer encaissé, chaque bien suivi",
    subtitle: "Biens, locataires et paiements des loyers de votre agence ou de votre patrimoine.",
    audience: "Agences immobilières, propriétaires bailleurs, gestionnaires",
    benefits: [
      { title: "Loyers à jour", text: "Repérez en un instant les locataires en retard." },
      { title: "Biens libres", text: "Biens par statut : libre, loué, en travaux." },
      { title: "Encaissements", text: "Total des loyers encaissés par mois." },
      { title: "Équipe", text: "Vos agents consultent sans pouvoir supprimer." },
    ],
    example: "Je veux gérer mes biens immobiliers, mes locataires et les loyers.",
  },
  transport: {
    seoTitle: "Logiciel de gestion des livraisons et de la flotte",
    seoDescription: "Livraisons, véhicules, chauffeurs et dépenses de carburant pour entreprises de transport et de livraison.",
    headline: "Chaque livraison suivie, chaque véhicule entretenu",
    subtitle: "Livraisons, chauffeurs, véhicules et dépenses de votre entreprise de transport.",
    audience: "Transporteurs, sociétés de livraison, flottes de taxis et de motos",
    benefits: [
      { title: "Livraisons par statut", text: "À livrer, en route, livrée, échec." },
      { title: "Entretien planifié", text: "Date du prochain entretien de chaque véhicule." },
      { title: "Recettes mensuelles", text: "Montant des livraisons par mois en FCFA." },
      { title: "Dépenses", text: "Carburant, réparations et salaires par catégorie." },
    ],
    example: "Je veux suivre les livraisons, les véhicules et les chauffeurs de mon entreprise.",
  },
  salon: {
    seoTitle: "Logiciel de rendez-vous pour salon de coiffure et beauté",
    seoDescription: "Agenda des rendez-vous, clients et ventes de prestations pour salons de coiffure, barbiers et instituts de beauté.",
    headline: "Votre agenda rempli, vos clientes fidélisées",
    subtitle: "Rendez-vous, clientes et recettes de votre salon, depuis votre téléphone.",
    audience: "Salons de coiffure, barbiers, instituts de beauté, spas",
    benefits: [
      { title: "Agenda clair", text: "Prochains rendez-vous sur le tableau de bord." },
      { title: "Fichier clients", text: "Téléphone et notes de chaque cliente." },
      { title: "Recettes", text: "Prestations et ventes par mois." },
      { title: "Équipe", text: "Chaque coiffeuse saisit ses rendez-vous." },
    ],
    example: "Je veux gérer les rendez-vous et les clientes de mon salon de coiffure.",
  },
  interne: {
    seoTitle: "Logiciel de suivi d'équipe et de projets pour PME",
    seoDescription: "Personnel, tâches, échéances et dépenses internes pour PME, ONG et indépendants.",
    headline: "Qui fait quoi, pour quand, et combien ça coûte",
    subtitle: "Tâches, responsables, échéances et dépenses de votre équipe.",
    audience: "PME, ONG, associations, cabinets, indépendants",
    benefits: [
      { title: "Tâches par statut", text: "À faire, en cours, terminées." },
      { title: "Retards repérés", text: "L'assistant liste les tâches dont l'échéance est passée." },
      { title: "Personnel", text: "Employés, postes et contacts." },
      { title: "Dépenses", text: "Dépenses internes par catégorie." },
    ],
    example: "Je veux suivre les tâches et les dépenses de mon équipe.",
  },
};

export const SECTOR_PAGES: SectorPage[] = TEMPLATES.filter((t) => CONTENT[t.id]).map((t) => ({ slug: t.id, template: t, ...CONTENT[t.id]! }));

export function getSectorPage(slug: string): SectorPage | undefined {
  return SECTOR_PAGES.find((p) => p.slug === slug);
}
