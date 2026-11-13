-- Site Internet connecté : le site existant d'une entreprise (jamais créé par MiniSoft) relié à
-- son logiciel par un code de suivi. Les statistiques ne viennent que des visites réellement reçues.
create table if not exists public.websites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  url text not null,
  host text not null,
  site_key text not null unique,
  -- pending : adresse vérifiée, code de suivi pas encore reçu ; connected : au moins une visite reçue
  -- depuis ce site ; error : la vérification a échoué.
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_error text,
  detected jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  connected_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Événements de visite : aucun cookie, aucune adresse IP ni identifiant personnel stockés.
-- visitor = empreinte à sel mensuel (non réversible), session = visite (30 min d'inactivité).
create table if not exists public.web_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.websites (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null check (char_length(type) <= 30),
  path text not null default '/' check (char_length(path) <= 300),
  visitor text not null check (char_length(visitor) <= 40),
  session text not null check (char_length(session) <= 40),
  device text not null default 'ordinateur' check (device in ('telephone', 'ordinateur', 'tablette')),
  country text check (char_length(country) <= 2),
  referrer text check (char_length(referrer) <= 200),
  duration integer check (duration between 0 and 1800)
);
create index if not exists web_events_site_time_idx on public.web_events (site_id, created_at desc);
create index if not exists web_events_visitor_idx on public.web_events (site_id, visitor, created_at desc);

-- Accès uniquement par le serveur (clé de service) : les routes vérifient l'appartenance au projet.
alter table public.websites enable row level security;
alter table public.web_events enable row level security;
