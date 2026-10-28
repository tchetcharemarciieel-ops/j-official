-- Vérifie l'isolation entre clients et le blocage des écritures directes.
-- Chaque assertion lève une exception si la règle de sécurité n'est pas respectée.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.cm'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.cm');
insert into public.projects (id, owner_id, name, slug) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'A', 'projet-a');
insert into public.project_members (project_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner');
insert into public.records (project_id, entity, data) values ('10000000-0000-0000-0000-000000000001', 'clients', '{"nom":"x"}');

do $$ begin assert (select count(*) from public.profiles) = 2, 'profils non créés par le déclencheur'; end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.records) = 1, 'le propriétaire doit voir ses données';
  assert (select count(*) from public.profiles) = 1, 'un utilisateur ne voit que son profil';
  update public.profiles set credits = 99999;
  update public.projects set name = 'pirate';
  begin
    insert into public.records (project_id, entity, data) values ('10000000-0000-0000-0000-000000000001', 'clients', '{}');
    raise exception 'écriture directe autorisée !';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.records) = 0, 'B voit les données de A';
  assert (select count(*) from public.projects) = 0, 'B voit le projet de A';
  assert (select count(*) from public.project_members) = 0, 'B voit les membres de A';
end $$;

reset role;
set role anon;
do $$ begin
  assert (select count(*) from public.records) = 0, 'données visibles sans connexion';
  assert (select count(*) from public.plans) = 4, 'les formules doivent être publiques';
end $$;

reset role;
set role authenticated;
do $$ begin
  begin
    perform public.consume_credits('00000000-0000-0000-0000-00000000000a', 1);
    raise exception 'crédits modifiables depuis le navigateur !';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  assert (select credits from public.profiles where email = 'a@test.cm') = 20, 'crédits modifiés sans autorisation';
  assert (select name from public.projects) = 'A', 'projet modifié sans autorisation';
  assert public.consume_credits('00000000-0000-0000-0000-00000000000a', 25) = false, 'débit au-delà du solde accepté';
  assert public.consume_credits('00000000-0000-0000-0000-00000000000a', 5) = true, 'débit valide refusé';
end $$;

\echo 'RLS : toutes les vérifications sont passées.'

-- Module garage : un employé ne lit pas les dépenses du garage ; le propriétaire si.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@test.cm');
insert into public.project_members (project_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'employee');
insert into public.records (project_id, entity, data) values
  ('10000000-0000-0000-0000-000000000001', 'gx:expense', '{"amount":5000}'),
  ('10000000-0000-0000-0000-000000000001', 'gx:job', '{"ref":"GAR-2026-0001"}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.records where entity = 'gx:expense') = 0, 'un employé lit les dépenses du garage';
  assert (select count(*) from public.records where entity = 'gx:job') = 1, 'un employé doit voir les dossiers du garage';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.records where entity = 'gx:expense') = 1, 'le propriétaire doit voir les dépenses';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.records where entity like 'gx:%') = 0, 'B voit le garage de A';
end $$;
reset role;
