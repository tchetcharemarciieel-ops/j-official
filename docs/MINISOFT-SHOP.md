# MiniSoft Shop : état du module

## Opérationnel (testé)
- Création d'une boutique depuis « Créer un mini-logiciel » (nom + type de commerce), données de test séparées des données réelles.
- Produits : variantes, unités configurables, catégories, photos (jusqu'à 6), référence, code-barres, lots et péremption, archivage, import CSV/Excel, export CSV.
- Caisse : ouverture/fermeture avec fond et écart, entrées/sorties, remises sous permission, espèces (monnaie), Mobile Money et carte (déclaratifs), paiement partiel/différé avec client, reçu imprimable/partageable, lecteur de code-barres (clavier) et caméra (si le navigateur le permet).
- Ventes : historique, retours, remboursements, annulations (la vente reste dans l'historique), facture PDF.
- Stock : mouvements idempotents et conditionnels, inventaire, pertes, endommagés, historique, alertes, réservation des commandes en ligne avec expiration.
- Boutique en ligne /shop/[slug] : catalogue, fiche produit, panier, commande sans compte, livraison/retrait, suivi (lien secret ou numéro + téléphone), WhatsApp, QR code PNG et affiche imprimable/PDF.
- Clients, fournisseurs, bons de commande (réception partielle, dette fournisseur), dépenses avec justificatif, rapports jour/semaine/mois/année, performance des vendeurs.
- Postes : propriétaire, administrateur, responsable, caissier, magasinier, vendeur (permissions serveur, filtrage des données renvoyées).
- MiniSoft AI : réponses calculées par le serveur ; l'IA explique, n'invente rien, ne modifie rien.
- Hors connexion : catalogue consultable, ventes mises en file avec identifiant unique et envoyées au retour d'Internet (conflits signalés).
- Admin : page « Boutiques Shop » (totaux, suspension/réactivation tracées).

## Nécessite une intervention extérieure
- ZingoPay (ALETCHCARD) : chaque commerçant colle sa propre clé (carte « Paiement en ligne ZingoPay » de la page Boutique en ligne). Non testé avec une vraie clé.
- Répartition 51 % ALETCHCARD / 49 % MiniSoft RCA : NON implémentée (aucun contrat ni API de reversement fournis). Les paiements en espèces n'entrent jamais dans cette répartition.
- Mobile Money direct (Orange, Moov, Telecel…) : seule la saisie de la référence est possible ; pas de connecteur sans API fournie.
- Formules (Gratuit/Standard/Pro/Entreprise) : utilise les formules existantes de MiniSoft RCA (page Admin > Abonnements) ; tarifs, limites et essai restent à fixer par vous.

## Limites connues
- Données stockées dans la table `records` existante (entités `sh:…`), isolées par `project_id`, RLS existante, écritures côté serveur uniquement : pas de tables dédiées (businesses, sales…).
- Lecture limitée à 10 000 fiches par collection (avertissement affiché si atteint).
- Facture PDF : texte seul (pas de logo).
- Copie hors ligne gardée dans le navigateur de l'appareil (sans images) : à effacer sur un appareil partagé.
- Variables d'environnement : aucune nouvelle.
