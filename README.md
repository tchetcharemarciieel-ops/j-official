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

### MiniSoft Vision IA — Restaurant

Ouvert depuis la zone « Accueil / Caisse » (ou « Restaurant » à l'hôtel), pas depuis le plan 2D/3D. Géré par les gérants et par les employés dont la fiche du personnel, reliée à leur compte, porte le poste « Caisse et accueil » (contrôlé aussi par le serveur). Code : `lib/venue/vision.ts` (statuts, délais, statistiques), `lib/venue/vision-ops.ts` (opérations `vision.*`), `components/runtime/venue/vision/` (écrans), tests `tests/vision.test.ts`.

- **Plan 2D en direct** : tables disposables par glisser-déposer, statuts Libre, Occupée, Réservée, En attente de service, En attente du plat, Plat prêt, À nettoyer. Les statuts de commande viennent de la cuisine (`order.status`), jamais de la caméra ; le paiement n'est « payé » qu'après un encaissement confirmé.
- **Service** : installation (chronomètre), « Client servi », commande depuis la table, « Clients partis », puis « Remettre en Libre » après nettoyage.
- **Alertes** : quatre seuils réglables (premier service, commande non prise, préparation, plat prêt non servi ; 0 = désactivé). Une alerte par passage ou commande et par type (identifiant déduit de son objet, aucun doublon entre appareils), son joué une seule fois par appareil, prise en charge « Je m'en occupe », clôture automatique quand la cause disparaît, historique conservé.
- **Caméras** : caméra placée sur le plan avec son champ de vision, affichée « Caméra non connectée » tant qu'aucune détection réelle n'est reçue. Une passerelle installée au restaurant (analyse locale des images) envoie seulement l'état des tables à `POST /api/apps/[id]/venue/vision` avec `Authorization: Bearer <clé>` (clé générée dans l'écran Caméras, seule son empreinte SHA-256 est enregistrée). Aucune image, aucun visage.
- **Passerelle de référence** : `public/vision/minisoft_passerelle.py` (Python, OpenCV + détection de personnes YOLO, analyse locale, état stabilisé 20 s, modes `--test` et `--apercu`), `public/vision/config_exemple.json`, configuration préremplie téléchargeable depuis l'écran Caméras, tutoriel vidéo `public/vision/tutoriel-camera.mp4`.
- **Mode démonstration** : simulateur d'arrivées et de départs, toujours signalé, refusé par le serveur sur les données réelles.
- Données dans `records` (`hx:vseat`, `hx:valert`, `hx:vcam`) : aucune migration nécessaire. Les passages et alertes chargés sont ceux des 90 derniers jours.

### Restaurant en ligne (menu QR, commandes, cuisine, agent)

Code : `lib/venue/online.ts` (modèle, suivi public, rapport), `lib/venue/online-ops.ts` (opérations `online.*` et `qr.*`), `lib/venue/public.ts` (accès public), pages `app/r/[slug]` (menu général), `app/r/[slug]/t/[jeton]` (table), `app/r/[slug]/suivi/[jeton]` (suivi), écrans `components/public/` et `components/runtime/venue/online/`, tests `tests/online.test.ts`.

- **Adresses** : `/r/<adresse-du-logiciel>` pour le menu ; chaque table a un QR code `/r/<adresse>/t/<jeton aléatoire>` (au lieu de `table-04`, devinable) : le client ne peut pas changer de table. Régénérer un QR code invalide l'ancien ; un QR désactivé affiche un message.
- **Menu client** : photos, descriptions, options payantes, instructions, panier, commande sans compte ni application. Prix et options toujours recalculés par le serveur ; double validation sans doublon ; limite de requêtes par adresse IP.
- **Paiement** : « à la caisse ou au serveur » (confirmé par l'équipe). Une commande n'est « payée » qu'après un encaissement confirmé. Option « envoyer en cuisine seulement après paiement confirmé ». **ALETCHCARD** : affiché « bientôt disponible », aucun point d'accès inventé ; à intégrer avec la documentation officielle (création de transaction, notification serveur signée, vérification). Statuts de paiement prévus : en attente, confirmé, échoué, remboursé.
- **Suivi** : lien secret, mise à jour automatique (interrogation toutes les 5 s, sans exposer la base aux visiteurs), notifications du navigateur après accord explicite proposé après la commande, bouton « OK, c'est bon » qui ferme seulement la session du menu sur ce téléphone.
- **Écran cuisine (KDS)** : zone Cuisine (ou `?cuisine=1`), colonnes Nouvelles / Acceptées / En préparation / Prêtes, son, retard, statut du paiement, « Signaler un problème » (visible par la caisse et le client).
- **Rôles** : client (public) ; serveur (employé) ; cuisinier (poste « Cuisinier » relié au compte) pour accepter et signaler ; caisse (poste « Caisse et accueil ») ; gérants pour le menu, les QR codes et l'analyse IA.
- **Agent restaurant** (zone Bureau) : commandes en retard, temps de préparation et d'acceptation, rapport imprimable, recommandations calculées, analyse IA facultative sur des chiffres agrégés (aucune donnée personnelle, crédits d'IA).
- **Statistiques QR** : scans, visiteurs uniques par jour (empreinte anonyme), commandes générées, plats consultés (`hx:qstat`).
- **Mode démonstration** : « Tester (démo) » dans l'aperçu ou `?demo=1` pour le propriétaire connecté : commandes de démonstration et confirmation de paiement simulée, jamais sur les données réelles.

## Gestion des équipes

Onglet « Gestion des équipes » de chaque logiciel (`app/projets/[id]/tabs/TeamTab.tsx`). Règles dans `lib/team.ts` (postes par secteur, permissions, `canAssign` contre l'auto-promotion), `lib/op-perms.ts` (permission exigée par chaque opération métier), `lib/zone-perms.ts` (zones et fonctions visibles), serveur dans `lib/team-server.ts` et les routes `app/api/projects/[id]/{team,invitations,members,positions,seats}`. Base : `supabase/migrations/0010_team.sql` (ajouts uniquement). Tests : `tests/team.test.ts`.

- **Postes** : restaurant (Administrateur, Accueil / Caisse, Cuisine, Gestion du stock, Salle de restaurant, Réception, Responsable), hôtel (Administrateur, Réception, Ménage, Cuisine, Restaurant, Gestion des chambres), garage (Administrateur, Accueil, Mécanicien, Gestion des pièces, Responsable), et postes personnalisés.
- **Invitation** : jeton de 256 bits stocké haché, 7 jours, usage unique, réservé à l'adresse invitée ; e-mail envoyé par le SMTP configuré dans Supabase (modèles « Invite user » et « Magic Link ») avec repli par lien à partager ; renvoi (nouveau lien) et annulation ; la page d'invitation montre l'entreprise et le poste, l'employé crée son propre compte et son mot de passe. Invitations en attente aussi proposées dans « Mon espace ».
- **Sécurité serveur** : accès suspendu refusé sur toutes les routes (`getAccess`) et par les politiques RLS (`is_member` exige `status = 'active'`) ; chaque opération du restaurant, de l'hôtel et du garage vérifie la permission du poste ; tables de données (« Interface classique ») réservées à la permission « donnees » ; personne ne modifie son propre accès, seul le propriétaire nomme un administrateur, un responsable ne donne jamais plus qu'il n'a ; actions journalisées (`audit_logs`).
- **Compatibilité** : un membre sans poste garde exactement les droits de son rôle, comme avant.
- **Licences** : places de la formule du propriétaire + `projects.extra_seats` ; demande d'accès supplémentaires transmise aux administrateurs de la plateforme (aucun tarif affiché).
- **Configuration Supabase** : Authentication → URL Configuration → ajouter `https://minisoft-rca.onrender.com/**` aux URL de redirection autorisées (retour du lien de l'e-mail vers `/auth/invitation`).

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
