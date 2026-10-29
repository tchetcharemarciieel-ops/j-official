import { z } from "zod";

/**
 * Questionnaire d'inscription : définitions partagées par le navigateur (affichage) et le
 * serveur (validation). Les identifiants sont stables : ils sont enregistrés en base.
 */

export const DISCOVERY = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", google: "Google", ami: "Un ami ou une connaissance", publicite: "Publicité", autre: "Autre" } as const;
export const PROFILES = { entrepreneur: "Entrepreneur", proprietaire: "Propriétaire d'une entreprise", commercant: "Commerçant", freelance: "Freelance", porteur: "Porteur de projet", autre: "Autre" } as const;
export const SECTORS = { restaurant: "Restaurant", hotel: "Hôtel", garage: "Garage automobile", pharmacie: "Pharmacie", boutique: "Boutique ou commerce", ecole: "École ou centre de formation", sante: "Santé", transport: "Transport et livraison", agriculture: "Agriculture", autre: "Autre" } as const;
export const TOOLS = { stocks: "Gestion des stocks", caisse: "Caisse et ventes", commandes: "Gestion des commandes", reservations: "Réservations", personnel: "Gestion du personnel", comptabilite: "Comptabilité et dépenses", clients: "Gestion des clients", tableau: "Tableau de bord et statistiques", plan3d: "Plan 3D des locaux de l'entreprise", autre: "Autre" } as const;
export const TEAM_SIZES = { seul: "Moi uniquement", "2-5": "2 à 5 personnes", "6-20": "6 à 20 personnes", "20+": "Plus de 20 personnes" } as const;
export const HAS_ROLES = { oui: "Oui", non: "Non", inconnu: "Je ne sais pas encore" } as const;
export const ROLES = { administrateur: "Administrateur", gerant: "Gérant", employe: "Employé", caissier: "Caissier", stock: "Responsable de stock", autre: "Autre" } as const;
export const DEVICES = { telephone: "Téléphone", ordinateur: "Ordinateur", tablette: "Tablette", plusieurs: "Plusieurs appareils" } as const;

/** Pays proposés en premier, puis liste de recherche (Afrique et autres pays fréquents). */
export const FEATURED_COUNTRIES = ["République centrafricaine", "Cameroun", "Tchad", "République démocratique du Congo", "Congo"];
export const COUNTRIES = [
  ...FEATURED_COUNTRIES,
  "Gabon", "Guinée équatoriale", "Nigeria", "Soudan", "Soudan du Sud", "Côte d'Ivoire", "Sénégal", "Mali", "Burkina Faso", "Niger", "Bénin", "Togo", "Ghana", "Guinée", "Rwanda", "Burundi", "Ouganda", "Kenya", "Tanzanie", "Angola", "Madagascar", "Maroc", "Algérie", "Tunisie", "Égypte", "Éthiopie", "Afrique du Sud", "France", "Belgique", "Suisse", "Canada", "États-Unis", "Chine",
];

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const other = z.string().trim().max(200).default("");

export const onboardingSchema = z
  .object({
    discovery: z.enum(keys(DISCOVERY)),
    profile: z.enum(keys(PROFILES)),
    sector: z.enum(keys(SECTORS)),
    sectorOther: other,
    tools: z.array(z.enum(keys(TOOLS))).min(1, "Choisissez au moins un outil.").max(2, "Deux outils au maximum."),
    toolsOther: other,
    teamSize: z.enum(keys(TEAM_SIZES)),
    hasRoles: z.enum(keys(HAS_ROLES)),
    roles: z.array(z.enum(keys(ROLES))).max(6).default([]),
    rolesOther: other,
    devices: z.array(z.enum(keys(DEVICES))).min(1, "Choisissez au moins un appareil.").max(2, "Deux appareils au maximum."),
    country: z.string().trim().min(2, "Indiquez le pays.").max(80),
  })
  .superRefine((a, ctx) => {
    if (a.sector === "autre" && !a.sectorOther) ctx.addIssue({ code: "custom", path: ["sectorOther"], message: "Précisez votre activité." });
    if (a.tools.includes("autre") && !a.toolsOther) ctx.addIssue({ code: "custom", path: ["toolsOther"], message: "Précisez votre besoin." });
    if (a.hasRoles === "oui" && a.roles.length === 0) ctx.addIssue({ code: "custom", path: ["roles"], message: "Choisissez au moins un rôle." });
  })
  .transform((a) => ({ ...a, sectorOther: a.sector === "autre" ? a.sectorOther : "", toolsOther: a.tools.includes("autre") ? a.toolsOther : "", roles: a.hasRoles === "oui" ? a.roles : [], rolesOther: a.hasRoles === "oui" && a.roles.includes("autre") ? a.rolesOther : "" }));

export type OnboardingAnswers = z.output<typeof onboardingSchema>;
export type OnboardingDraft = Partial<z.input<typeof onboardingSchema>>;

export const sectorLabel = (a: Pick<OnboardingAnswers, "sector" | "sectorOther">) => (a.sector === "autre" ? a.sectorOther || "Autre" : SECTORS[a.sector]);

/** Description de départ pour « Créer un logiciel », construite uniquement à partir des réponses. */
export function starterProblem(a: OnboardingAnswers): string {
  const tools = a.tools.map((t) => (t === "autre" ? a.toolsOther : TOOLS[t])).filter(Boolean).join(" et ");
  const team = TEAM_SIZES[a.teamSize].toLowerCase();
  const roles = a.roles.length ? ` Rôles : ${a.roles.map((r) => (r === "autre" ? a.rolesOther || "autre" : ROLES[r])).join(", ")}.` : "";
  return `Mon activité : ${sectorLabel(a)} (${a.country}). J'ai besoin d'un outil pour : ${tools}. Utilisateurs : ${team}.${roles} Appareils : ${a.devices.map((d) => DEVICES[d]).join(", ")}.`;
}

/** Suggestions affichées après l'inscription, selon le secteur et les outils choisis. */
export function suggestions(a: OnboardingAnswers): { title: string; text: string; href: string }[] {
  const out: { title: string; text: string; href: string }[] = [];
  const problem = (extra: string) => `/creer?probleme=${encodeURIComponent(`${starterProblem(a)} ${extra}`.trim())}`;
  if (a.sector === "restaurant")
    out.push(
      { title: "Logiciel de restaurant avec plan 3D", text: "Cuisine, salle, stock, chambre froide, caisse et bureau, chacun cliquable sur le plan de votre restaurant.", href: problem("Je gère un restaurant.") },
      { title: "Caisse et commandes", text: "Prise de commande, encaissement avec monnaie rendue, reçus et rapport de caisse du jour.", href: problem("Je veux une caisse pour mon restaurant.") },
    );
  else if (a.sector === "hotel")
    out.push(
      { title: "Logiciel d'hôtel avec plan 3D", text: "Réception, réservations sans double réservation, état des chambres, restaurant et bureau.", href: problem("Je gère un hôtel.") },
      { title: "Réservations et paiements", text: "Arrivées et départs, factures des séjours et montants restant dus.", href: problem("Je veux gérer les réservations de mon hôtel.") },
    );
  else if (a.sector === "garage")
    out.push(
      { title: "Logiciel de garage avec plan 3D", text: "Accueil, atelier, stock des pièces, devis, factures et suivi de chaque véhicule.", href: problem("Je gère un garage automobile.") },
      { title: "Stock des pièces détachées", text: "Entrées, sorties liées aux réparations, alertes de stock faible et fournisseurs.", href: problem("Je veux gérer le stock de pièces de mon garage.") },
    );
  const byTool: Partial<Record<OnboardingAnswers["tools"][number], { title: string; text: string }>> = {
    stocks: { title: "Gestion des stocks", text: "Quantités, seuils d'alerte et valeur du stock calculée sur vos prix." },
    caisse: { title: "Caisse et ventes", text: "Ventes du jour, modes de paiement et reçus." },
    commandes: { title: "Suivi des commandes", text: "Commandes, statuts et livraison jusqu'au client." },
    reservations: { title: "Réservations", text: "Planning des réservations sans doublon." },
    personnel: { title: "Gestion du personnel", text: "Employés, rôles et horaires." },
    comptabilite: { title: "Dépenses et recettes", text: "Dépenses par catégorie et bénéfice estimé à partir de vos saisies." },
    clients: { title: "Fichier clients", text: "Coordonnées, historique et relances." },
    tableau: { title: "Tableau de bord", text: "Les chiffres clés de votre activité, calculés sur vos données." },
    plan3d: { title: "Plan 3D de vos locaux", text: "Chaque zone de votre entreprise cliquable, reliée à sa gestion." },
  };
  for (const t of a.tools) {
    const s = byTool[t];
    if (s && out.length < 3) out.push({ ...s, href: problem("") });
  }
  if (out.length === 0) out.push({ title: "Un mini-logiciel sur mesure", text: "Décrivez votre problème : MiniSoft RCA propose les pages et fonctionnalités adaptées.", href: problem("") });
  return out.slice(0, 3);
}
