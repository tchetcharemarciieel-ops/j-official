-- Paiement en ligne par restaurant (ZingoPay) : la clé secrète et le secret de signature de
-- chaque commerce, chiffrés côté serveur. Aucune politique RLS : seul le serveur (service_role)
-- lit et écrit cette table ; ni les membres, ni les clients du menu n'y ont accès.
create table if not exists public.payment_providers (
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null check (provider in ('zingopay')),
  mode text not null check (mode in ('test', 'live')),
  api_key_enc text not null,
  webhook_secret_enc text,
  key_hint text not null default '',
  enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, provider)
);
alter table public.payment_providers enable row level security;
revoke all on public.payment_providers from anon, authenticated;
