-- MiniSoft RCA — schéma initial
-- Principe de sécurité : la RLS est activée partout. Les clients (clé anon + session)
-- ne peuvent que LIRE les données des projets dont ils sont membres. Toutes les
-- écritures passent par le serveur (clé service_role) après vérification explicite
-- du rôle et des permissions de l'utilisateur.

create extension if not exists pgcrypto;

-- ---------- Formules ----------
create table public.plans (
  id text primary key,
  name text not null,
  price_xaf integer not null default 0,
  monthly_credits integer not null,
  max_projects integer not null,
  max_members integer not null,
  can_publish boolean not null default false,
  ai_modifications boolean not null default false,
  description text not null default '',
  sort integer not null default 0
);

insert into public.plans (id, name, price_xaf, monthly_credits, max_projects, max_members, can_publish, ai_modifications, description, sort) values
  ('decouverte', 'Découverte', 0, 20, 1, 1, false, true, 'Essais limités et applications de démonstration.', 1),
  ('pro', 'Pro', 15000, 200, 5, 5, true, true, 'Publication de logiciels, modifications par IA.', 2),
  ('business', 'Business', 45000, 800, 20, 25, true, true, 'Plusieurs logiciels, équipes et permissions avancées.', 3),
  ('agence', 'Agence', 120000, 3000, 100, 100, true, true, 'Création de logiciels pour plusieurs clients.', 4);

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  plan text not null default 'decouverte' references public.plans (id),
  credits integer not null default 20 check (credits >= 0),
  is_admin boolean not null default false,
  suspended boolean not null default false,
  suspended_reason text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Projets (mini-logiciels) ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  sector text not null default '',
  problem text not null default '',
  diagnosis jsonb,
  draft_spec jsonb,
  draft_version integer not null default 0,
  published_spec jsonb,
  published_version integer,
  status text not null default 'preparation'
    check (status in ('preparation', 'generation', 'test', 'published', 'suspended', 'failed')),
  last_error text,
  template_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'employee', 'viewer')),
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version integer not null,
  spec jsonb not null,
  summary text not null default '',
  changes jsonb not null default '[]',
  test_report jsonb,
  author_id uuid references public.profiles (id),
  source text not null default 'generation',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'employee', 'viewer')),
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Données métier des mini-logiciels ----------
create table public.records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  entity text not null,
  data jsonb not null default '{}',
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_lookup_idx on public.records (project_id, entity, is_demo, created_at desc);

create table public.record_history (
  id bigserial primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  record_id uuid not null,
  entity text not null,
  action text not null check (action in ('create', 'update', 'delete', 'import', 'restore')),
  before jsonb,
  after jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index record_history_project_idx on public.record_history (project_id, created_at desc);

create table public.backups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  spec_version integer,
  records jsonb not null,
  record_count integer not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Intégrations ----------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (type in ('webhook')),
  label text not null,
  config jsonb not null default '{}',
  status text not null default 'not_tested' check (status in ('not_tested', 'connected', 'error')),
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Journalisation, IA, statistiques ----------
create table public.audit_logs (
  id bigserial primary key,
  project_id uuid references public.projects (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.ai_usage (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  operation text not null,
  engine text not null check (engine in ('ai', 'rules')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_xaf integer not null default 0,
  credits integer not null default 0,
  status text not null check (status in ('success', 'failed', 'refunded')),
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

create table public.app_views (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (project_id, day)
);

-- ---------- Fonctions ----------
create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = (select auth.uid()));
$$;

-- Débit atomique des crédits : refuse si solde insuffisant.
create or replace function public.consume_credits(uid uuid, amount integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  update public.profiles set credits = credits - amount
   where id = uid and credits >= amount and not suspended
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.refund_credits(uid uuid, amount integer)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set credits = credits + amount where id = uid;
$$;

create or replace function public.track_view(pid uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.app_views (project_id, day, views) values (pid, current_date, 1)
  on conflict (project_id, day) do update set views = public.app_views.views + 1;
$$;

revoke execute on function public.consume_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.track_view(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_versions enable row level security;
alter table public.invitations enable row level security;
alter table public.records enable row level security;
alter table public.record_history enable row level security;
alter table public.backups enable row level security;
alter table public.integrations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.app_views enable row level security;

create policy "plans lisibles" on public.plans for select to anon, authenticated using (true);
create policy "profil personnel" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "projets des membres" on public.projects for select to authenticated using (public.is_member(id));
create policy "membres visibles des membres" on public.project_members for select to authenticated using (public.is_member(project_id));
create policy "versions des membres" on public.project_versions for select to authenticated using (public.is_member(project_id));
create policy "donnees des membres" on public.records for select to authenticated using (public.is_member(project_id));
create policy "consommation personnelle" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
-- invitations, record_history, backups, integrations, audit_logs, app_views :
-- aucune politique → accessibles uniquement par le serveur (service_role).
