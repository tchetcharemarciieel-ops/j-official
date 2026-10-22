-- Préférences d'affichage d'un utilisateur dans un mini-logiciel (vue 3D/2D, vue classique).
-- Une ligne par couple (utilisateur, logiciel) : jamais partagée avec une autre entreprise.
create table if not exists public.user_app_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.user_app_prefs enable row level security;

-- Lecture de ses propres préférences uniquement ; écritures par le serveur (rôle service).
drop policy if exists "prefs_select_own" on public.user_app_prefs;
create policy "prefs_select_own" on public.user_app_prefs
  for select using (auth.uid() = user_id);

create index if not exists user_app_prefs_project_idx on public.user_app_prefs (project_id);
