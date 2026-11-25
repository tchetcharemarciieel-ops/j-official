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
