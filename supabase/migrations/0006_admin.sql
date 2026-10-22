-- Espace administrateur : paramètres de la plateforme, assistance, abonnements et paiements.
-- Toutes les écritures passent par le serveur (rôle service) après vérification de l'administrateur.

-- Paramètres (marque, textes, annonces, IA, modèles…) : jamais lisibles directement par les clients.
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.platform_settings enable row level security;

-- Demandes d'assistance, problèmes signalés et suggestions.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  name text not null default '',
  category text not null default 'assistance' check (category in ('assistance', 'probleme', 'suggestion')),
  subject text not null,
  message text not null,
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'resolu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
create policy "tickets_select_own" on public.support_tickets for select using (auth.uid() = user_id);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  from_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
create policy "messages_select_own" on public.support_messages for select
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- Abonnements : historique des formules (attribution manuelle ou via un fournisseur de paiement).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'canceled')),
  source text not null default 'manuel',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

-- Paiements : un paiement n'est « réussi » qu'après confirmation du fournisseur (webhook signé).
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id text references public.plans(id),
  provider text not null,
  provider_ref text,
  amount_xaf integer not null check (amount_xaf >= 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  confirmed_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
alter table public.payments enable row level security;
create policy "payments_select_own" on public.payments for select using (auth.uid() = user_id);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

-- Formules désactivables sans les supprimer (les abonnés existants les gardent).
alter table public.plans add column if not exists active boolean not null default true;
