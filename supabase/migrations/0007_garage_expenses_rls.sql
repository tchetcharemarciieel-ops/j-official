-- Module garage : ses fiches vivent dans `records` sous des identifiants « gx:… ».
-- Les dépenses du garage (gx:expense) ne sont lisibles directement que par les gérants
-- (propriétaire, administrateur, gestionnaire), comme dans l'API du module.
create or replace function public.is_project_manager(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'manager')
  );
$$;
revoke execute on function public.is_project_manager(uuid) from public, anon;
grant execute on function public.is_project_manager(uuid) to authenticated;

drop policy if exists "donnees des membres" on public.records;
create policy "donnees des membres" on public.records for select to authenticated
  using (public.is_member(project_id) and (entity <> 'gx:expense' or public.is_project_manager(project_id)));
