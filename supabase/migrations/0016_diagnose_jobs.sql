-- Analyses en arrière-plan : le résultat est gardé pour que le client le retrouve s'il quitte la page puis revient.
create table if not exists public.diagnose_jobs (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'running' check (status in ('running','done','error')),
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists diagnose_jobs_user_idx on public.diagnose_jobs (user_id, created_at desc);
alter table public.diagnose_jobs enable row level security;
-- Aucune politique : seul le serveur (clé de service) lit et écrit cette table.
