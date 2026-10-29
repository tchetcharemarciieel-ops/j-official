-- Réponses du questionnaire d'inscription, une ligne par utilisateur.
-- Écriture uniquement par le serveur (service_role) ; chaque utilisateur ne lit que ses réponses.
create table if not exists public.onboarding_answers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.onboarding_answers enable row level security;
drop policy if exists "reponses personnelles" on public.onboarding_answers;
create policy "reponses personnelles" on public.onboarding_answers for select to authenticated using (user_id = (select auth.uid()));
