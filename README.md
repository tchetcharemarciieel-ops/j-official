# MiniSoft RCA

Plateforme qui transforme les problèmes des entreprises en mini-logiciels web personnalisés, publiés sur un lien permanent (`/apps/<identifiant>`).

## Architecture

- **Next.js 16** (App Router) déployé sur **Vercel** — projet distinct `minisoft-rca`, sans lien avec les autres projets du compte.
- **Supabase** : comptes, base Postgres, RLS. Les navigateurs ne peuvent que *lire* les projets dont ils sont membres ; toutes les écritures passent par les routes serveur, qui vérifient le rôle à chaque action (`lib/access.ts`, `lib/app-data.ts`).
- **IA (Anthropic, côté serveur uniquement)** : diagnostic, modifications, interprétation des questions de l'assistant de données. L'IA produit une définition structurée (`AppSpec`, `lib/spec.ts`), jamais du code exécuté. Sans clé, un moteur par règles prend le relais et le dit clairement.
- **Moteur d'exécution** (`components/runtime`) : interprète l'`AppSpec` avec des composants validés (tableaux, formulaires, tableaux de bord, exports).
- **Tests automatiques** (`lib/checks.ts` + `/api/projects/[id]/tests`) : structure, formulaires, calculs, permissions, cycle CRUD réel en base, isolation entre clients.

## Module « Gestion du garage »

Pour un logiciel dont l'espace de travail est un garage, le plan 3D (et le plan 2D) présente cinq zones cliquables : **Accueil**, **Atelier**, **Stock des pièces**, **Bureau** et **Salle de repos**. Un clic ouvre un panneau latéral à gauche sans quitter le plan ; la zone ouverte est mise en évidence ; la croix ferme le panneau.

- Un seul dossier d'intervention suit le véhicule : Accueil → Diagnostic → Devis accepté → Réparation → Contrôle qualité → Prêt → Remise au client.
- Données rangées dans la table `records` existante sous les identifiants réservés `gx:…` (aucun conflit possible avec les tables générées), historique dans `record_history`, sauvegardes comprises.
- Règles appliquées côté serveur (`lib/garage/engine.ts`, route `/api/apps/[id]/garage`) : références uniques (GAR, DEV, FAC, REC, BC), réparation bloquée sans accord enregistré sur un devis, statut « Prêt » réservé à la validation qualité par un gérant, paiements limités au solde (statut « Payée » uniquement calculé), stock déduit une seule fois par mouvement (mises à jour conditionnelles + clés d'opération), sorties supérieures au stock refusées.
- Rôles existants : Employé = accueil et mécaniciens ; Gestionnaire, Administrateur, Propriétaire = gérant ; Lecteur = consultation.
- Démo sans compte : même moteur exécuté dans le navigateur, sans aucune donnée d'exemple.

Configuration : exécuter `supabase/migrations/0007_garage_expenses_rls.sql` (les dépenses du garage ne sont lisibles directement que par les gérants). Les photos des dossiers sont réduites dans le navigateur et stockées en base (8 par dossier) : le projet n'utilise pas encore Supabase Storage.

## Modules « Restaurant » et « Hôtel »

Pour un logiciel dont l'espace de travail est un restaurant ou un hôtel, un questionnaire est posé avant d'afficher le plan 3D, puis reste modifiable (« Configurer le plan ») :

- **Restaurant** : « Votre restaurant possède-t-il une terrasse ? ». Zones : Cuisine (équipements, budget), Salle de restaurant (tables et chaises, capacité, réservations, budget), Stock (produits, entrées et sorties, alertes, valeur), Chambre froide (relevés de température saisis à la main, produits, dates limites, alertes et entretien), Toilettes (aménagement, nettoyage récurrent, produits d'entretien, budget), Accueil / Caisse (commande, encaissement avec monnaie rendue, reçus et factures, rapport de caisse), Bureau (tableau de bord, personnel et horaires, dépenses et bénéfice estimé, rapports) et Terrasse si elle existe.
- **Hôtel** : restaurant sur place ? service en chambre ? autres espaces, puis étape facultative « Ajoutez des photos de votre hôtel » (importer ou continuer sans). Zones : Réception (réservations sans chevauchement, arrivées et départs, disponibilité, paiements et factures, fiches clients), Chambres (chaque chambre enregistrée est cliquable sur le plan : informations, état, nettoyage, réservations, équipements et réparations), Restaurant et Cuisine si l'hôtel en a (commandes reliées à la cuisine, carte, recettes et coût estimé, stock déduit une seule fois, hygiène, consommations ajoutées à la note de chambre d'un client présent), Bureau (tableau de bord, finances, personnel, taux d'occupation, tâches et alertes de toutes les zones).

Règles côté serveur (`lib/venue/engine.ts`, route `/api/apps/[id]/venue`) : prix toujours repris de la carte, paiements limités au reste dû et protégés contre le double envoi, paiements « en attente » exclus des recettes jusqu'à confirmation, aucune température présentée comme mesurée automatiquement, budgets calculés uniquement sur les prix saisis. Données dans `records` sous des identifiants « hx:… » (tests : `tests/venue.test.ts`).

Configuration : exécuter `supabase/migrations/0008_venue_rls.sql` (dépenses réservées aux gérants, fiches clients et personnel cachées aux comptes en lecture seule ; remplace la politique de 0007 en l'étendant).

## Mise en service

1. Créer un projet Supabase, puis exécuter `supabase/migrations/0001_init.sql` (éditeur SQL ou `supabase db push`).
2. Dans Supabase › Authentication › URL Configuration : ajouter `https://<votre-domaine>/auth/callback` aux URL de redirection.
3. Variables d'environnement Vercel (voir `.env.example`) :
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)
   - `NEXT_PUBLIC_SITE_URL` (adresse publique, pour les liens publiés et les invitations)
   - `ADMIN_EMAILS` (administrateurs de la plateforme)
   - `ANTHROPIC_API_KEY` (facultatif) et `AI_MODEL` (défaut `claude-opus-5-5`)
4. La page `/configuration` indique ce qui manque.

Le paiement en ligne n'est pas branché : aucune facturation n'est possible ; l'administrateur change les formules manuellement dans `/admin`.

## Développement

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # tests unitaires du moteur
npm run lint    # vérification TypeScript
```

## Version statique (Neocities ou tout hébergeur sans serveur)

```bash
node scripts/build-static.mjs ./out-static
```

Produit l'accueil, la démo sans compte et la bibliothèque de modèles en fichiers HTML/JS/CSS. Les liens vers les comptes renvoient vers la démo. Déposez le **contenu** du dossier à la racine du site Neocities.
