-- Module restaurant / hôtel : ses fiches vivent dans `records` sous des identifiants « hx:… ».
-- Comme dans l'API du module : dépenses (hx:expense) lisibles par les seuls gérants ;
-- fiches clients et personnel (hx:guest, hx:staff) cachées aux membres en lecture seule.
create or replace function public.is_project_staff(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = (select auth.uid()) and m.role <> 'viewer'
  );
$$;
revoke execute on function public.is_project_staff(uuid) from public, anon;
grant execute on function public.is_project_staff(uuid) to authenticated;

drop policy if exists "donnees des membres" on public.records;
create policy "donnees des membres" on public.records for select to authenticated
  using (
    public.is_member(project_id)
    and (entity not in ('gx:expense', 'hx:expense') or public.is_project_manager(project_id))
    and (entity not in ('hx:guest', 'hx:staff') or public.is_project_staff(project_id))
  );
