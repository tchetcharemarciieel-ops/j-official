-- Profil d'entreprise du client et notifications de l'espace client.
alter table public.profiles
  add column company_name text not null default '',
  add column company_logo_url text not null default '',
  add column company_sector text not null default '',
  add column company_phone text not null default '',
  add column company_email text not null default '',
  add column company_address text not null default '';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null check (type in ('update', 'error', 'publish', 'team', 'info')),
  title text not null,
  body text not null default '',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications personnelles" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
