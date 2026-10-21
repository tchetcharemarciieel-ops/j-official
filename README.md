# MiniSoft RCA

Plateforme qui transforme les problèmes des entreprises en mini-logiciels web personnalisés, publiés sur un lien permanent (`/apps/<identifiant>`).

## Architecture

- **Next.js 16** (App Router) déployé sur **Vercel** — projet distinct `minisoft-rca`, sans lien avec les autres projets du compte.
- **Supabase** : comptes, base Postgres, RLS. Les navigateurs ne peuvent que *lire* les projets dont ils sont membres ; toutes les écritures passent par les routes serveur, qui vérifient le rôle à chaque action (`lib/access.ts`, `lib/app-data.ts`).
- **IA (Anthropic, côté serveur uniquement)** : diagnostic, modifications, interprétation des questions de l'assistant de données. L'IA produit une définition structurée (`AppSpec`, `lib/spec.ts`), jamais du code exécuté. Sans clé, un moteur par règles prend le relais et le dit clairement.
- **Moteur d'exécution** (`components/runtime`) : interprète l'`AppSpec` avec des composants validés (tableaux, formulaires, tableaux de bord, exports).
- **Tests automatiques** (`lib/checks.ts` + `/api/projects/[id]/tests`) : structure, formulaires, calculs, permissions, cycle CRUD réel en base, isolation entre clients.

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
