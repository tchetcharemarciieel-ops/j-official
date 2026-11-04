-- Gestion des équipes : postes, permissions, suspension, invitations détaillées et accès
-- supplémentaires. Ajouts uniquement : aucune donnée existante n'est modifiée ni supprimée.
-- Les membres existants gardent leur rôle actuel (poste vide = droits du rôle, comme avant).

-- ---------- Membres ----------
alter table public.project_members
  add column if not exists position text not null default '',
  add column if not exists permissions text[] not null default '{}',
  add column if not exists status text not null default 'active',
  add column if not exists display_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.project_members add constraint project_members_status_check check (status in ('active', 'suspended'));
exception when duplicate_object then null; end $$;

-- ---------- Invitations ----------
alter table public.invitations
  add column if not exists full_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists position text not null default '',
  add column if not exists permissions text[] not null default '{}',
  add column if not exists email_status text not null default 'lien',
  add column if not exists sent_count integer not null default 1,
  add column if not exists last_sent_at timestamptz not null default now(),
  add column if not exists revoked_by uuid references public.profiles (id) on delete set null;

create index if not exists invitations_project_idx on public.invitations (project_id, created_at desc);
create index if not exists invitations_email_idx on public.invitations (lower(email));

-- ---------- Postes personnalisés ----------
create table if not exists public.project_positions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (char_length(label) between 2 and 60),
  permissions text[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);
alter table public.project_positions enable row level security;
-- Aucune politique : lecture et écriture uniquement par le serveur (service_role).

-- ---------- Accès supplémentaires (licences) ----------
-- Places ajoutées par l'équipe MiniSoft RCA après une demande du responsable (aucun tarif ici).
alter table public.projects add column if not exists extra_seats integer not null default 0 check (extra_seats >= 0);

-- ---------- Accès suspendu : plus aucune lecture directe ----------
-- Un membre suspendu n'est plus considéré comme membre par les politiques RLS.
create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
