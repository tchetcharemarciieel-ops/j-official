/**
 * Module « MiniSoft Bureau / Agence » : gestion de bureau (clients, projets, personnel, agenda,
 * documents et facturation, finances, messagerie, équipements, bureau virtuel) adaptée au métier.
 * Modèle métier partagé par le serveur, le navigateur et les tests.
 *
 * Les données sont rangées dans la table `records` existante sous des identifiants réservés
 * (« bu:… »). Chaque entreprise est un projet MiniSoft : l'isolation repose sur `project_id`
 * (RLS existante, écritures côté serveur uniquement). Aucune valeur n'est inventée : tous les
 * indicateurs sont calculés sur les fiches enregistrées.
 */

export const COLLECTIONS = ["settings", "client", "interaction", "project", "task", "comment", "employee", "attendance", "appointment", "quote", "invoice", "contract", "document", "file", "transaction", "equipment", "message", "record", "counter"] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `bu:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("bu:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};

export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };
export type BureauData = { [K in Col]: Doc[] };
export const emptyData = (): BureauData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as BureauData;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

// ---------- Rôles ----------
export type BureauRole = "owner" | "admin" | "manager" | "employee" | "viewer";
/** 0 lecture seule, 1 équipe, 2 gérant (directeur, administrateur, propriétaire). */
export const LEVEL: Record<BureauRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };

// ---------- Devises ----------
export const CURRENCIES = {
  XAF: { label: "FCFA", name: "Franc CFA (XAF)", decimals: 0 },
  XOF: { label: "FCFA", name: "Franc CFA (XOF)", decimals: 0 },
  EUR: { label: "€", name: "Euro", decimals: 2 },
  USD: { label: "$", name: "Dollar américain", decimals: 2 },
  CDF: { label: "FC", name: "Franc congolais", decimals: 0 },
  GNF: { label: "GNF", name: "Franc guinéen", decimals: 0 },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const money = (n: number | null | undefined, code: CurrencyCode = "XAF") => {
  if (n === null || n === undefined) return "—";
  const c = CURRENCIES[code] ?? CURRENCIES.XAF;
  const v = c.decimals ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("fr-FR");
  return `${v.replace(/ /g, " ")} ${c.label}`;
};

// ---------- Types d'agence et modules du métier ----------

export type FieldType = "text" | "longtext" | "number" | "money" | "date" | "select" | "relation" | "phone" | "email" | "boolean";
export type FieldDef = { key: string; label: string; type: FieldType; options?: string[]; /** relation : « client », « employee » ou la clé d'un autre module métier. */ rel?: string; required?: boolean; list?: boolean };
export type ModuleDef = { key: string; label: string; singular: string; icon: string; description: string; fields: FieldDef[]; /** Champ de statut : filtre et pastille de couleur. */ status?: string };

const f = (key: string, label: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, ...extra });

export const SECTOR_MODULES: Record<string, ModuleDef> = {
  // Immobilier
  biens: { key: "biens", label: "Biens immobiliers", singular: "Bien", icon: "🏠", description: "Appartements, maisons, terrains, locaux à vendre ou à louer.", status: "statut", fields: [f("titre", "Titre", "text", { required: true, list: true }), f("type", "Type de bien", "select", { options: ["Appartement", "Maison", "Terrain", "Bureau", "Local commercial", "Autre"], list: true }), f("adresse", "Adresse", "text", { list: true }), f("surface", "Surface (m²)", "number"), f("prix", "Prix de vente ou loyer", "money", { list: true }), f("statut", "Statut", "select", { options: ["Disponible", "Loué", "Vendu", "Retiré"], list: true }), f("proprietaire", "Propriétaire", "relation", { rel: "proprietaires" }), f("description", "Description", "longtext")] },
  proprietaires: { key: "proprietaires", label: "Propriétaires", singular: "Propriétaire", icon: "👤", description: "Propriétaires des biens gérés.", fields: [f("nom", "Nom", "text", { required: true, list: true }), f("telephone", "Téléphone", "phone", { list: true }), f("email", "E-mail", "email"), f("adresse", "Adresse", "text"), f("notes", "Notes", "longtext")] },
  locataires: { key: "locataires", label: "Locataires", singular: "Locataire", icon: "🧑‍💼", description: "Locataires et leurs coordonnées.", fields: [f("nom", "Nom", "text", { required: true, list: true }), f("telephone", "Téléphone", "phone", { list: true }), f("email", "E-mail", "email"), f("piece", "Pièce d'identité (numéro)", "text"), f("notes", "Notes", "longtext")] },
  visites: { key: "visites", label: "Visites", singular: "Visite", icon: "🗝️", description: "Visites de biens par des clients.", status: "statut", fields: [f("bien", "Bien", "relation", { rel: "biens", required: true, list: true }), f("client", "Client", "relation", { rel: "client", list: true }), f("date", "Date de la visite", "date", { required: true, list: true }), f("statut", "Statut", "select", { options: ["Prévue", "Effectuée", "Annulée"], list: true }), f("retour", "Retour du client", "longtext")] },
  locations: { key: "locations", label: "Contrats de location", singular: "Contrat de location", icon: "📑", description: "Baux, loyers, cautions et durées.", status: "statut", fields: [f("bien", "Bien", "relation", { rel: "biens", required: true, list: true }), f("locataire", "Locataire", "relation", { rel: "locataires", required: true, list: true }), f("debut", "Début", "date", { required: true, list: true }), f("fin", "Fin", "date"), f("loyer", "Loyer mensuel", "money", { list: true }), f("caution", "Caution", "money"), f("statut", "Statut", "select", { options: ["En cours", "Terminé", "Résilié"], list: true })] },
  commissions_immo: { key: "commissions_immo", label: "Commissions", singular: "Commission", icon: "💰", description: "Commissions de l'agence sur les ventes et locations.", status: "statut", fields: [f("bien", "Bien", "relation", { rel: "biens", required: true, list: true }), f("nature", "Nature", "select", { options: ["Vente", "Location", "Gestion"], list: true }), f("taux", "Taux (%)", "number"), f("montant", "Montant", "money", { required: true, list: true }), f("statut", "Statut", "select", { options: ["À encaisser", "Encaissée"], list: true }), f("date", "Date", "date", { list: true })] },
  // Communication
  campagnes: { key: "campagnes", label: "Campagnes", singular: "Campagne", icon: "📣", description: "Campagnes de communication des clients.", status: "statut", fields: [f("nom", "Nom de la campagne", "text", { required: true, list: true }), f("client", "Client", "relation", { rel: "client", list: true }), f("canal", "Canal", "select", { options: ["Réseaux sociaux", "Radio", "Télévision", "Affichage", "Presse", "Événement", "Autre"], list: true }), f("debut", "Début", "date", { list: true }), f("fin", "Fin", "date"), f("statut", "Statut", "select", { options: ["Préparation", "En cours", "Terminée", "Suspendue"], list: true }), f("objectif", "Objectif", "longtext")] },
  publications: { key: "publications", label: "Calendrier de publication", singular: "Publication", icon: "🗓️", description: "Publications planifiées par campagne.", status: "statut", fields: [f("campagne", "Campagne", "relation", { rel: "campagnes", required: true, list: true }), f("date", "Date de publication", "date", { required: true, list: true }), f("plateforme", "Plateforme", "select", { options: ["Facebook", "Instagram", "TikTok", "WhatsApp", "YouTube", "Radio", "Autre"], list: true }), f("contenu", "Contenu", "longtext"), f("statut", "Statut", "select", { options: ["À créer", "En validation", "Programmée", "Publiée"], list: true })] },
  budgets_pub: { key: "budgets_pub", label: "Budgets publicitaires", singular: "Budget", icon: "💵", description: "Budgets prévus et dépensés par campagne.", fields: [f("campagne", "Campagne", "relation", { rel: "campagnes", required: true, list: true }), f("poste", "Poste de dépense", "text", { list: true }), f("prevu", "Montant prévu", "money", { list: true }), f("depense", "Montant dépensé", "money", { list: true })] },
  rapports_camp: { key: "rapports_camp", label: "Rapports de campagnes", singular: "Rapport", icon: "📊", description: "Résultats saisis ou repris des plateformes (aucun chiffre n'est inventé).", fields: [f("campagne", "Campagne", "relation", { rel: "campagnes", required: true, list: true }), f("periode", "Période", "text", { list: true }), f("portee", "Personnes touchées", "number", { list: true }), f("interactions", "Interactions", "number"), f("resultats", "Résultats obtenus", "number"), f("analyse", "Analyse", "longtext")] },
  // Cabinet administratif
  dossiers: { key: "dossiers", label: "Dossiers", singular: "Dossier", icon: "🗂️", description: "Dossiers administratifs des clients.", status: "statut", fields: [f("reference", "Référence", "text", { required: true, list: true }), f("client", "Client", "relation", { rel: "client", list: true }), f("objet", "Objet", "text", { list: true }), f("statut", "Statut", "select", { options: ["Ouvert", "En cours", "En attente de pièces", "Clôturé"], list: true }), f("echeance", "Échéance", "date", { list: true }), f("responsable", "Responsable", "relation", { rel: "employee" }), f("notes", "Notes", "longtext")] },
  demandes: { key: "demandes", label: "Suivi des demandes", singular: "Demande", icon: "📨", description: "Demandes déposées et leur avancement.", status: "statut", fields: [f("type", "Type de demande", "text", { required: true, list: true }), f("client", "Client", "relation", { rel: "client", list: true }), f("depot", "Date de dépôt", "date", { list: true }), f("statut", "Statut", "select", { options: ["Reçue", "En traitement", "Acceptée", "Refusée", "Terminée"], list: true }), f("dossier", "Dossier", "relation", { rel: "dossiers" }), f("suivi", "Suivi", "longtext")] },
  archives: { key: "archives", label: "Archivage", singular: "Archive", icon: "🗄️", description: "Localisation des dossiers archivés.", fields: [f("dossier", "Dossier", "relation", { rel: "dossiers", list: true }), f("emplacement", "Emplacement (salle, étagère, boîte)", "text", { required: true, list: true }), f("date", "Date d'archivage", "date", { list: true }), f("conservation", "Conservé jusqu'au", "date"), f("notes", "Notes", "longtext")] },
  // Agence commerciale
  prospects: { key: "prospects", label: "Prospects", singular: "Prospect", icon: "🎯", description: "Prospection et suivi des prospects.", status: "etape", fields: [f("nom", "Nom", "text", { required: true, list: true }), f("telephone", "Téléphone", "phone", { list: true }), f("email", "E-mail", "email"), f("source", "Source", "select", { options: ["Recommandation", "Réseaux sociaux", "Visite", "Appel", "Autre"], list: true }), f("etape", "Étape", "select", { options: ["Nouveau", "Contacté", "Intéressé", "Négociation", "Gagné", "Perdu"], list: true }), f("valeur", "Valeur estimée", "money", { list: true }), f("commercial", "Commercial", "relation", { rel: "employee" }), f("notes", "Notes", "longtext")] },
  ventes: { key: "ventes", label: "Suivi des ventes", singular: "Vente", icon: "🤝", description: "Ventes conclues par les commerciaux.", status: "statut", fields: [f("client", "Client", "relation", { rel: "client", list: true }), f("produit", "Produit ou service", "text", { required: true, list: true }), f("montant", "Montant", "money", { required: true, list: true }), f("date", "Date", "date", { required: true, list: true }), f("commercial", "Commercial", "relation", { rel: "employee", list: true }), f("statut", "Statut", "select", { options: ["En cours", "Conclue", "Annulée"], list: true })] },
  objectifs: { key: "objectifs", label: "Objectifs commerciaux", singular: "Objectif", icon: "🏁", description: "Objectifs par commercial et par période ; le réalisé est calculé sur les ventes conclues.", fields: [f("commercial", "Commercial", "relation", { rel: "employee", required: true, list: true }), f("debut", "Début", "date", { required: true, list: true }), f("fin", "Fin", "date", { required: true, list: true }), f("cible", "Objectif (montant)", "money", { required: true, list: true })] },
  commissions_com: { key: "commissions_com", label: "Commissions", singular: "Commission", icon: "💰", description: "Commissions des commerciaux.", status: "statut", fields: [f("commercial", "Commercial", "relation", { rel: "employee", required: true, list: true }), f("vente", "Vente", "relation", { rel: "ventes" }), f("taux", "Taux (%)", "number"), f("montant", "Montant", "money", { required: true, list: true }), f("statut", "Statut", "select", { options: ["À payer", "Payée"], list: true }), f("date", "Date", "date", { list: true })] },
  // Bureau classique
  reunions: { key: "reunions", label: "Comptes rendus de réunion", singular: "Compte rendu", icon: "📝", description: "Ordre du jour, compte rendu et décisions de chaque réunion.", fields: [f("titre", "Titre de la réunion", "text", { required: true, list: true }), f("date", "Date", "date", { required: true, list: true }), f("participants", "Participants", "text", { list: true }), f("ordre", "Ordre du jour", "longtext"), f("compte_rendu", "Compte rendu", "longtext"), f("decisions", "Décisions et actions", "longtext")] },
  courrier: { key: "courrier", label: "Courrier", singular: "Courrier", icon: "✉️", description: "Courrier entrant et sortant.", status: "statut", fields: [f("objet", "Objet", "text", { required: true, list: true }), f("sens", "Sens", "select", { options: ["Entrant", "Sortant"], list: true }), f("correspondant", "Correspondant", "text", { list: true }), f("date", "Date", "date", { list: true }), f("statut", "Statut", "select", { options: ["À traiter", "Traité", "Archivé"], list: true }), f("notes", "Notes", "longtext")] },
};

export const AGENCY_TYPES = {
  immobilier: { label: "Agence immobilière", icon: "🏠", sector: "Immobilier", modules: ["biens", "proprietaires", "locataires", "visites", "locations", "commissions_immo"] },
  communication: { label: "Agence de communication", icon: "📣", sector: "Communication et publicité", modules: ["campagnes", "publications", "budgets_pub", "rapports_camp"] },
  cabinet: { label: "Cabinet administratif", icon: "🗂️", sector: "Services administratifs", modules: ["dossiers", "demandes", "archives"] },
  commerciale: { label: "Agence commerciale", icon: "🤝", sector: "Vente et distribution", modules: ["prospects", "ventes", "objectifs", "commissions_com"] },
  classique: { label: "Bureau classique", icon: "🏢", sector: "Services", modules: ["reunions", "courrier"] },
  services: { label: "Bureau de prestations de services", icon: "🧰", sector: "Prestations de services", modules: ["reunions", "courrier"] },
  pme: { label: "Petite ou moyenne entreprise", icon: "🏭", sector: "Entreprise", modules: ["reunions", "courrier"] },
} as const;
export type AgencyType = keyof typeof AGENCY_TYPES;
export const AGENCY_TYPE_IDS = Object.keys(AGENCY_TYPES) as AgencyType[];

/** Modules communs qui peuvent aussi être désactivés (le reste est le cœur du logiciel). */
export const OPTIONAL_CORE = { presences: "Présences du personnel", equipements: "Équipements", messagerie: "Messagerie interne" } as const;

// ---------- Pages et espaces du bureau virtuel ----------
export type Page = "dashboard" | "workspace" | "clients" | "projets" | "personnel" | "presences" | "agenda" | "documents" | "finances" | "messagerie" | "equipements" | "metier" | "assistant" | "parametres";
export const PAGE_LABELS: Record<Page, string> = { dashboard: "Tableau de bord", workspace: "Bureau virtuel", clients: "Clients", projets: "Projets et tâches", personnel: "Personnel", presences: "Présences", agenda: "Agenda", documents: "Documents et facturation", finances: "Finances", messagerie: "Messagerie", equipements: "Équipements", metier: "Modules du métier", assistant: "MiniSoft AI", parametres: "Réglages" };

export type SpaceKind = "reception" | "desk" | "meeting" | "stock" | "counter" | "cashier";
export type Space = { id: string; name: string; kind: SpaceKind; links: Page[]; enabled: boolean };
export const DEFAULT_SPACES: Space[] = [
  { id: "reception", name: "Accueil / Réception", kind: "reception", links: ["clients", "agenda"], enabled: true },
  { id: "direction", name: "Bureau du directeur", kind: "desk", links: ["dashboard", "finances", "personnel", "assistant"], enabled: true },
  { id: "employes", name: "Espace employés", kind: "desk", links: ["projets", "presences"], enabled: true },
  { id: "reunion", name: "Salle de réunion", kind: "meeting", links: ["agenda", "messagerie"], enabled: true },
  { id: "archives", name: "Salle d'archives", kind: "stock", links: ["documents"], enabled: true },
  { id: "informatique", name: "Espace informatique", kind: "counter", links: ["equipements"], enabled: true },
];

export type Settings = {
  name: string;
  agency_type: AgencyType;
  sector: string;
  employees_count: number;
  offices_count: number;
  address: string;
  phone: string;
  email: string;
  logo_id: string | null;
  currency: CurrencyCode;
  primary: string;
  /** Taux de TVA appliqué par défaut aux devis et factures (0 = sans TVA). */
  tax_rate: number;
  invoice_note: string;
  /** Modules activés ou désactivés par le client (les valeurs absentes suivent le type d'agence). */
  modules: Record<string, boolean>;
  spaces: Space[];
};

export function defaultSettings(name = "Mon agence", type: AgencyType = "classique"): Settings {
  return { name, agency_type: type, sector: AGENCY_TYPES[type].sector, employees_count: 1, offices_count: 1, address: "", phone: "", email: "", logo_id: null, currency: "XAF", primary: "#2563eb", tax_rate: 0, invoice_note: "Merci de votre confiance.", modules: {}, spaces: DEFAULT_SPACES.map((s) => ({ ...s })) };
}
export function settingsOf(doc: Doc | undefined, fallbackName = "Mon agence"): Settings {
  const d = defaultSettings(fallbackName);
  const s = (doc?.data ?? {}) as Partial<Settings>;
  const spaces = s.spaces?.length ? s.spaces : d.spaces;
  return { ...d, ...s, modules: { ...(s.modules ?? {}) }, spaces };
}
/** Modules métier proposés (selon le type d'agence) et leur état d'activation. */
export function sectorModules(s: Settings): { def: ModuleDef; enabled: boolean }[] {
  return AGENCY_TYPES[s.agency_type].modules.map((k) => ({ def: SECTOR_MODULES[k]!, enabled: s.modules[k] !== false }));
}
export const moduleOn = (s: Settings, key: string) => s.modules[key] !== false;
export const enabledSectorKeys = (s: Settings) => sectorModules(s).filter((m) => m.enabled).map((m) => m.def.key);

// ---------- Fiches ----------
export const CLIENT_STATUS = { prospect: "Prospect", actif: "Actif", inactif: "Inactif", archive: "Archivé" } as const;
export type ClientStatus = keyof typeof CLIENT_STATUS;
export type Client = { name: string; kind: "particulier" | "entreprise"; contact: string; phone: string; email: string; address: string; status: ClientStatus; notes: string };
export const INTERACTION_TYPES = { appel: "Appel", email: "E-mail", reunion: "Réunion", visite: "Visite", note: "Note" } as const;
export type Interaction = { client_id: string; type: keyof typeof INTERACTION_TYPES; text: string; at: string; by: string };

export const PROJECT_STATUS = { planifie: "Planifié", en_cours: "En cours", termine: "Terminé", suspendu: "Suspendu", annule: "Annulé" } as const;
export type ProjectStatus = keyof typeof PROJECT_STATUS;
export type Project = { name: string; client_id: string | null; owner: string | null; members: string[]; start: string | null; due: string | null; status: ProjectStatus; progress: number; budget: number | null; description: string; created_by: string };
export const TASK_STATUS = { a_faire: "À faire", en_cours: "En cours", termine: "Terminée" } as const;
export type TaskStatus = keyof typeof TASK_STATUS;
export const PRIORITIES = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" } as const;
export type Task = { project_id: string | null; title: string; description: string; assignee: string | null; due: string | null; status: TaskStatus; priority: keyof typeof PRIORITIES; done_at: string | null; created_by: string };
export type Comment = { target: "project" | "task" | "client"; target_id: string; text: string; by: string; at: string };

export type Employee = { name: string; position: string; phone: string; email: string; hired: string | null; user_id: string | null; status: "actif" | "conge" | "parti"; notes: string };
export const ATTENDANCE_STATUS = { present: "Présent", retard: "En retard", absent: "Absent", conge: "Congé", mission: "Mission" } as const;
export type Attendance = { employee_id: string; date: string; status: keyof typeof ATTENDANCE_STATUS; in: string | null; out: string | null; note: string; by: string };

export const APPT_KIND = { rdv: "Rendez-vous", reunion: "Réunion", visite: "Visite", autre: "Autre" } as const;
export const APPT_STATUS = { prevu: "Prévu", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" } as const;
export type Appointment = { title: string; kind: keyof typeof APPT_KIND; start: string; end: string; client_id: string | null; location: string; participants: string[]; status: keyof typeof APPT_STATUS; reminder_min: number; notes: string; created_by: string };

export type DocLine = { desc: string; qty: number; unit_price: number };
export const QUOTE_STATUS = { brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé", expire: "Expiré" } as const;
export const INVOICE_STATUS = { brouillon: "Brouillon", envoyee: "Envoyée", annulee: "Annulée" } as const;
export type Quote = { number: string; client_id: string | null; date: string; valid_until: string | null; items: DocLine[]; tax_rate: number; discount: number; total: number; status: keyof typeof QUOTE_STATUS; note: string; invoice_id: string | null; archived: boolean; created_by: string };
export const PAY_METHODS = { especes: "Espèces", mobile_money: "Mobile Money", virement: "Virement", cheque: "Chèque", carte: "Carte", autre: "Autre" } as const;
export type PayMethod = keyof typeof PAY_METHODS;
export type InvPayment = { id: string; amount: number; method: PayMethod; date: string; ref: string; receipt: string; by: string; tx_id: string | null };
export type Invoice = { number: string; client_id: string | null; date: string; due: string | null; items: DocLine[]; tax_rate: number; discount: number; total: number; status: keyof typeof INVOICE_STATUS; payments: InvPayment[]; note: string; quote_id: string | null; archived: boolean; created_by: string; cancel_reason?: string };
export const CONTRACT_STATUS = { brouillon: "Brouillon", actif: "Actif", termine: "Terminé", resilie: "Résilié" } as const;
export type Contract = { title: string; client_id: string | null; kind: string; start: string | null; end: string | null; amount: number | null; status: keyof typeof CONTRACT_STATUS; terms: string; archived: boolean; created_by: string };
export const DOC_CATEGORIES = { administratif: "Administratif", contrat: "Contrat", devis: "Devis", facture: "Facture", recu: "Reçu", autre: "Autre" } as const;
export type Document = { name: string; category: keyof typeof DOC_CATEGORIES; client_id: string | null; project_id: string | null; file_id: string | null; mime: string; size: number; archived: boolean; at: string; by: string };
export type FileDoc = { name: string; mime: string; size: number; data: string };

export const TX_CATEGORIES = { prestation: "Prestations", vente: "Ventes", commission: "Commissions", loyer: "Loyers", salaires: "Salaires", fournitures: "Fournitures", transport: "Transport", communication: "Communication", impots: "Impôts et taxes", autre: "Autres" } as const;
export type TxCategory = keyof typeof TX_CATEGORIES;
export type Transaction = { type: "recette" | "depense"; amount: number; category: TxCategory; date: string; description: string; method: PayMethod; client_id: string | null; invoice_id: string | null; by: string };

export const EQUIP_KINDS = { ordinateur: "Ordinateur", imprimante: "Imprimante", mobilier: "Mobilier", materiel_info: "Matériel informatique", autre: "Autre" } as const;
export const EQUIP_STATE = { neuf: "Neuf", bon: "Bon état", usage: "Usagé", panne: "En panne", reforme: "Réformé" } as const;
export type Equipment = { name: string; kind: keyof typeof EQUIP_KINDS; serial: string; state: keyof typeof EQUIP_STATE; assigned_to: string | null; location: string; purchase_date: string | null; purchase_price: number | null; notes: string; history: { at: string; by: string; text: string }[] };

export type Message = { channel: string; from: string; text: string; at: string; read_by: string[] };
export const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
export type SectorRecord = { mod: string; data: Record<string, string | number | boolean | null> };

// ---------- Calculs (tous sur les fiches enregistrées) ----------
export function docTotals(items: DocLine[], tax_rate: number, discount: number) {
  const subtotal = round2(items.reduce((a, l) => a + l.qty * l.unit_price, 0));
  const net = Math.max(0, round2(subtotal - discount));
  const tax = round2((net * tax_rate) / 100);
  return { subtotal, net, tax, total: round2(net + tax) };
}
export const paidOf = (i: Pick<Invoice, "payments">) => round2(i.payments.reduce((a, p) => a + p.amount, 0));
export const balanceOf = (i: Invoice) => (i.status === "annulee" ? 0 : Math.max(0, round2(i.total - paidOf(i))));
export type InvoiceState = "brouillon" | "envoyee" | "partielle" | "payee" | "en_retard" | "annulee";
export function invoiceState(i: Invoice, now = today()): InvoiceState {
  if (i.status === "annulee") return "annulee";
  if (i.status === "brouillon") return "brouillon";
  const paid = paidOf(i);
  if (i.total > 0 && paid >= i.total) return "payee";
  if (i.due && i.due < now) return "en_retard";
  return paid > 0 ? "partielle" : "envoyee";
}
export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = { brouillon: "Brouillon", envoyee: "À payer", partielle: "Payée en partie", payee: "Payée", en_retard: "En retard", annulee: "Annulée" };

export function projectTasks(tasks: Doc<Task>[], projectId: string) {
  return tasks.filter((t) => t.data.project_id === projectId);
}
/** Avancement : part des tâches terminées s'il y en a, sinon la valeur saisie. */
export function projectProgress(p: Project, tasks: Doc<Task>[], id: string) {
  const ts = projectTasks(tasks, id);
  if (!ts.length) return p.status === "termine" ? 100 : p.progress;
  return Math.round((ts.filter((t) => t.data.status === "termine").length / ts.length) * 100);
}
export const projectLate = (p: Project, now = today()) => Boolean(p.due && p.due < now && p.status !== "termine" && p.status !== "annule");
export const taskLate = (t: Task, now = today()) => Boolean(t.due && t.due < now && t.status !== "termine");
export const taskOpen = (t: Task) => t.status !== "termine";

/** Finances d'une période : recettes, dépenses et solde ; jamais d'estimation. */
export function financeIn(txs: Doc<Transaction>[], r: { from: string; to: string }) {
  const list = txs.filter((t) => t.data.date >= r.from && t.data.date <= r.to);
  const income = round2(list.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0));
  const expense = round2(list.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0));
  return { income, expense, balance: round2(income - expense), count: list.length };
}
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
export const ymOf = (d: string) => d.slice(0, 7);
/** Série mensuelle des 6 derniers mois pour le graphique. */
export function monthlySeries(txs: Doc<Transaction>[], now = new Date(), months = 6) {
  const out: { ym: string; label: string; income: number; expense: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const f = financeIn(txs, monthRange(ym));
    out.push({ ym, label: d.toLocaleDateString("fr-FR", { month: "short" }), income: f.income, expense: f.expense });
  }
  return out;
}
export function attendanceStats(rows: Doc<Attendance>[], employeeId: string, range: { from: string; to: string }) {
  const mine = rows.filter((a) => a.data.employee_id === employeeId && a.data.date >= range.from && a.data.date <= range.to);
  const c = (s: keyof typeof ATTENDANCE_STATUS) => mine.filter((a) => a.data.status === s).length;
  return { present: c("present"), retard: c("retard"), absent: c("absent"), conge: c("conge"), mission: c("mission"), total: mine.length };
}
/** Performance : tâches terminées, part terminée dans les délais ; null quand il n'y a rien à mesurer. */
export function performance(tasks: Doc<Task>[], memberId: string) {
  const mine = tasks.filter((t) => t.data.assignee === memberId);
  const done = mine.filter((t) => t.data.status === "termine");
  const withDue = done.filter((t) => t.data.due && t.data.done_at);
  const onTime = withDue.filter((t) => (t.data.done_at as string).slice(0, 10) <= (t.data.due as string));
  return { assigned: mine.length, done: done.length, open: mine.length - done.length, late: mine.filter((t) => taskLate(t.data)).length, onTimeRate: withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null };
}
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;
export function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const apptDay = (a: Appointment) => a.start.slice(0, 10);

/** Valeur d'un champ de module métier affichée comme texte (relations résolues par `lookup`). */
export function fieldText(def: FieldDef, v: unknown, lookup: (rel: string, id: string) => string): string {
  if (v === null || v === undefined || v === "") return "";
  if (def.type === "relation") return lookup(def.rel ?? "", String(v));
  if (def.type === "boolean") return v ? "Oui" : "Non";
  return String(v);
}
