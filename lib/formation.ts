import type { AppSpec } from "./spec";

/** Formation MiniSoft RCA : réservée aux formules avec publication (Pro et plus). Contenu = fonctions réelles de la plateforme. */
export type Lesson = { title: string; minutes: number; steps: string[]; tip?: string };
export type FormationModule = { id: string; title: string; goal: string; lessons: Lesson[] };

export const FORMATION: FormationModule[] = [
  {
    id: "demarrer",
    title: "1. Bien démarrer",
    goal: "Passer de votre problème à un logiciel prêt à tester.",
    lessons: [
      { title: "Décrire son besoin", minutes: 4, steps: ["Ouvrez « Créer un logiciel ».", "Choisissez votre activité ou écrivez votre problème en une ou deux phrases (ce qui vous fait perdre du temps ou de l'argent).", "Vous pouvez dicter à la voix ou joindre une photo de votre cahier.", "Lancez l'analyse : vous pouvez quitter la page, le résultat vous attendra à votre retour."], tip: "Plus vous parlez de vos chiffres réels (ventes, stock, dettes), plus le plan est juste." },
      { title: "Valider le plan", minutes: 5, steps: ["Répondez aux questions de précision.", "Cochez ou décochez les fonctions proposées, et ajoutez des modules si besoin.", "Donnez le nom de votre entreprise puis générez le logiciel.", "Le logiciel est testé automatiquement avant d'être ouvert."] },
    ],
  },
  {
    id: "quotidien",
    title: "2. Utiliser son logiciel chaque jour",
    goal: "Remplacer le cahier par des habitudes simples.",
    lessons: [
      { title: "Saisir au fil de la journée", minutes: 5, steps: ["Notez chaque vente, dépense ou prestation au moment où elle a lieu, pas le soir.", "Utilisez la recherche et les filtres pour retrouver un client, un produit ou une date.", "Vérifiez le tableau de bord en début et en fin de journée."] },
      { title: "Corriger une erreur sans tout casser", minutes: 3, steps: ["Ouvrez la fiche concernée et modifiez-la : l'historique garde la trace de qui a changé quoi.", "Pour revenir à une version précédente du logiciel : onglet Versions, puis Restaurer. Vos données ne sont pas effacées."] },
    ],
  },
  {
    id: "equipe",
    title: "3. Travailler en équipe",
    goal: "Donner à chacun l'accès qu'il lui faut, rien de plus.",
    lessons: [
      { title: "Inviter un collaborateur", minutes: 4, steps: ["Allez dans « Mon équipe ».", "Saisissez son adresse e-mail et choisissez son poste.", "La personne reçoit un lien : elle crée son compte et accède au logiciel avec les droits de son poste.", "Le lien de publication seul ne donne jamais accès aux données."], tip: "La formule Découverte permet 1 utilisateur ; Pro permet d'inviter votre équipe." },
      { title: "Choisir les bons droits", minutes: 4, steps: ["Chaque poste (caissier, gérant, comptable…) voit seulement ses pages.", "Retirez l'accès d'une personne qui part : il est coupé immédiatement."] },
    ],
  },
  {
    id: "donnees",
    title: "4. Reprendre vos données",
    goal: "Importer ce que vous avez déjà dans Excel.",
    lessons: [
      { title: "Importer un fichier Excel ou CSV", minutes: 5, steps: ["Ouvrez « Mes données » puis Importer.", "Choisissez la correspondance entre vos colonnes et les champs du logiciel.", "Lisez les erreurs signalées, corrigez le fichier si besoin, puis confirmez.", "Gardez toujours une copie de votre fichier d'origine."] },
    ],
  },
  {
    id: "assistant",
    title: "5. Faire évoluer avec l'assistant",
    goal: "Modifier le logiciel en le demandant simplement.",
    lessons: [
      { title: "Demander une modification", minutes: 4, steps: ["Dans votre logiciel, ouvrez Modifier et écrivez la demande (par exemple « Ajoute un champ téléphone aux clients »).", "Vous voyez l'avant et l'après : appliquez seulement si cela vous convient.", "Une modification consomme des crédits ; si elle échoue, ils sont remboursés."], tip: "Une demande = un changement. Plusieurs petites demandes marchent mieux qu'une grosse." },
    ],
  },
  {
    id: "publier",
    title: "6. Publier et suivre vos résultats",
    goal: "Mettre le logiciel en service et mesurer.",
    lessons: [
      { title: "Publier votre logiciel", minutes: 3, steps: ["Testez d'abord toutes les pages importantes avec des données d'essai.", "Cliquez sur Publier : vous obtenez un lien permanent.", "Invitez ensuite vos collaborateurs depuis « Mon équipe »."] },
      { title: "Lire les statistiques", minutes: 4, steps: ["Ouvrez « Statistiques » pour voir l'activité de vos logiciels.", "Comparez d'une semaine à l'autre avant de décider (commande de stock, prix, horaires).", "Sauvegardez régulièrement depuis l'onglet des sauvegardes de votre logiciel."] },
    ],
  },
];

export const totalMinutes = FORMATION.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.minutes, 0), 0);

export const CONCLUSION_VIDEO = { src: "/formation/conclusion.mp4", poster: "/formation/conclusion.jpg" };

/** Leçons propres à chaque logiciel prêt à l'emploi (fonctions réellement présentes). */
const SPECIFIC: Record<string, FormationModule> = {
  shop: {
    id: "shop", title: "MiniSoft Shop : la boutique au quotidien", goal: "Caisse, stock et boutique en ligne.",
    lessons: [
      { title: "Encaisser avec la caisse", minutes: 4, steps: ["Ouvrez la caisse, choisissez les produits, puis validez le paiement.", "Un reçu est généré pour le client.", "Les ventes mettent le stock à jour automatiquement."] },
      { title: "Suivre le stock et les alertes", minutes: 4, steps: ["Renseignez le stock de départ de chaque produit et un seuil d'alerte.", "Quand un produit passe sous le seuil, une alerte apparaît.", "Enregistrez les réceptions de marchandises et les fournisseurs."] },
      { title: "Ouvrir la boutique en ligne", minutes: 4, steps: ["Publiez le logiciel pour obtenir le lien de votre boutique.", "Partagez le lien ou le QR code avec vos clients.", "Traitez les commandes reçues depuis l'onglet Commandes."] },
    ],
  },
  bureau: {
    id: "bureau", title: "MiniSoft Bureau : piloter son agence", goal: "Clients, projets, équipe et facturation.",
    lessons: [
      { title: "Clients et projets", minutes: 4, steps: ["Créez vos clients puis rattachez-leur des projets.", "Suivez l'avancement et les échéances de chaque projet."] },
      { title: "Agenda et équipe", minutes: 4, steps: ["Planifiez les rendez-vous et réunions dans l'agenda.", "Donnez à chaque membre le poste qui correspond à son rôle."] },
      { title: "Devis et factures PDF", minutes: 4, steps: ["Créez un devis, faites-le valider, puis transformez-le en facture.", "Téléchargez le PDF pour l'envoyer au client."] },
    ],
  },
  ecole: {
    id: "ecole", title: "MiniSoft École : gérer l'établissement", goal: "Inscriptions, notes, bulletins, présences et frais.",
    lessons: [
      { title: "Préparer l'année", minutes: 5, steps: ["Créez l'année scolaire et les niveaux (Classes et matières).", "Créez les classes, puis les matières, et affectez chaque matière à sa classe avec un enseignant et un coefficient.", "Définissez les frais de scolarité par niveau (Finances) : ils sont facturés à chaque inscription."] },
      { title: "Inscrire un élève", minutes: 4, steps: ["Ouvrez Élèves puis Inscrire : renseignez l'élève, sa classe et son parent.", "Le matricule et la facture des frais obligatoires sont créés automatiquement.", "Un parent déjà connu (même téléphone) est réutilisé pour ses autres enfants."] },
      { title: "Notes, moyennes et bulletins", minutes: 6, steps: ["Créez une évaluation (devoir, composition…) dans Notes, puis saisissez les notes de la classe.", "Les moyennes utilisent les coefficients de la classe et le barème défini dans les réglages.", "Ouvrez Bulletins pour voir le classement et télécharger le bulletin PDF de chaque élève."] },
      { title: "Présences et parents", minutes: 4, steps: ["Faites l'appel par classe et par date ; les parents reliés à un compte sont notifiés des absences.", "Invitez le parent avec le poste Parent, puis reliez son compte à la fiche de l'élève : il ne verra que ses enfants."] },
      { title: "Paiements et impayés", minutes: 4, steps: ["Encaissez depuis Finances ou la fiche de l'élève : le reçu PDF est numéroté.", "Un paiement ne dépasse jamais le solde ; une annulation reste visible dans la facture.", "La liste des impayés peut s'exporter vers Excel."] },
    ],
  },
  transport: {
    id: "transport", title: "MiniSoft Transport : livraisons et suivi", goal: "Commandes, livreurs et suivi des colis.",
    lessons: [
      { title: "Créer et attribuer une commande", minutes: 4, steps: ["Enregistrez la commande avec l'adresse de départ et d'arrivée.", "Le tarif se calcule selon vos règles.", "Attribuez la livraison à un livreur et à un véhicule."] },
      { title: "Application livreur", minutes: 3, steps: ["Chaque livreur se connecte avec son poste et voit ses livraisons.", "Il met à jour le statut à chaque étape."] },
      { title: "Suivi public des colis", minutes: 3, steps: ["Après publication, vos clients suivent leur colis depuis une page publique.", "Partagez le lien de suivi avec le numéro de commande."] },
    ],
  },
};

const TYPE_HINT: Record<string, string> = { money: "montant en FCFA", date: "date", number: "nombre", boolean: "case oui/non", email: "adresse e-mail", phone: "numéro de téléphone", longtext: "texte long", relation: "lien vers une autre table" };

/** Formation propre à un logiciel sur mesure : une leçon par table, construite à partir de son plan réel. */
function customModule(spec: AppSpec): FormationModule {
  const lessons: Lesson[] = spec.entities.slice(0, 15).map((e) => {
    const required = e.fields.filter((f) => f.required).map((f) => f.label);
    const selects = e.fields.filter((f) => f.type === "select" && f.options?.length).slice(0, 3);
    const steps = [
      `Ouvrez « ${e.labelPlural} » dans le menu du logiciel.${e.description ? ` ${e.description}` : ""}`,
      `Ajoutez un élément avec le bouton de création. Champs : ${e.fields.slice(0, 8).map((f) => `${f.label}${TYPE_HINT[f.type] ? ` (${TYPE_HINT[f.type]})` : ""}`).join(", ")}${e.fields.length > 8 ? "…" : ""}.`,
      ...(required.length ? [`Champs obligatoires : ${required.join(", ")}.`] : []),
      ...selects.map((f) => `« ${f.label} » se choisit dans une liste : ${f.options!.slice(0, 6).join(", ")}.`),
      "Pour corriger, ouvrez l'élément puis modifiez-le ; la recherche et les filtres retrouvent vite une ligne.",
    ];
    return { title: `${e.icon ? e.icon + " " : ""}${e.labelPlural}`, minutes: 3, steps };
  });
  if (spec.dashboard.length) {
    lessons.push({ title: "Lire le tableau de bord", minutes: 3, steps: ["Le tableau de bord se met à jour avec vos saisies.", ...spec.dashboard.slice(0, 6).map((w) => `« ${w.label} » : ${{ count: "nombre d'éléments", sum: "total", monthly: "évolution par mois", breakdown: "répartition", recent: "derniers ajouts", low_stock: "alertes de stock bas" }[w.type]}.`)] });
  }
  return { id: "logiciel", title: `Votre logiciel « ${spec.name} » pas à pas`, goal: "Comment chaque partie de votre logiciel fonctionne.", lessons };
}

/** Modules de formation pour un logiciel : bases communes, leçons de son type (Shop, Bureau, Transport) ou de son plan (sur mesure). */
export function formationFor(spec?: AppSpec | null): FormationModule[] {
  const m = spec?.module;
  const extra = m && SPECIFIC[m] ? SPECIFIC[m] : spec ? customModule(spec) : undefined;
  return extra ? [FORMATION[0]!, extra, ...FORMATION.slice(1)] : FORMATION;
}
