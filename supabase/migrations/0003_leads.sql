-- Demandes de démonstration envoyées depuis le site (prospects).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',
  sector text not null default '',
  phone text not null default '',
  email text not null default '',
  message text not null default '',
  source text not null default '',
  status text not null default 'nouveau' check (status in ('nouveau', 'contacte', 'client', 'sans_suite')),
  created_at timestamptz not null default now()
);
create index leads_created_idx on public.leads (created_at desc);
alter table public.leads enable row level security;
-- Aucune politique : lecture et écriture uniquement par le serveur.
