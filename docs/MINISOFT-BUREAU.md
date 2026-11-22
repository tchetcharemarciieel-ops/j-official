# MiniSoft Bureau

Mini-logiciel de gestion d'agence / de bureau, intégré à MiniSoft RCA (module `spec.module = "bureau"`).

## Architecture
- Données : table `records` (entités `bu:*`), isolées par `project_id`, écritures uniquement côté serveur (`adminClient`), RLS existante inchangée. Aucune nouvelle table.
- Moteur : `lib/bureau/engine.ts` (`runOp`, validation zod, droits par opération dans `lib/op-perms.ts`, ids idempotents).
- Postes : `lib/team.ts` (administrateur, directeur, secrétaire, employé, comptable) ; filtrage serveur des données par poste dans `lib/bureau/visibility.ts`.
- API : `/api/apps/[id]/bureau` (données, opérations, fichiers), `/bureau/doc` (PDF devis, facture, reçu, contrat), `/bureau/assistant`.
- Interface : `components/bureau/` (navigation latérale, mobile, mode clair/sombre).
- Création : carte « MiniSoft Bureau » dans `/creer` (nom, type d'agence, secteur, employés, bureaux, adresse, téléphone, logo, devise).

## Modules
Tableau de bord, clients, projets et tâches, personnel (postes, présences, performances), agenda (jour/semaine/mois), documents et facturation (devis → facture → paiements → reçus), finances (recettes/dépenses, rapport mensuel, CSV), messagerie interne, équipements, modules métier (immobilier, communication, cabinet, commercial, bureau classique, activables), bureau virtuel 2D/3D/classique, assistant MiniSoft AI, réglages.

## Limites assumées
- Les rappels de rendez-vous sont affichés dans l'application (pas de SMS/e-mail/push).
- Les fichiers sont stockés en base (≤ 380 Ko, formats PDF, images, Word, Excel, texte).
- L'assistant IA exige la clé IA du serveur ; sans elle il répond seulement aux questions courantes, calculées à partir des données.
- Les résultats de campagnes (communication) sont saisis à la main : aucune connexion aux plateformes publicitaires n'est simulée.
