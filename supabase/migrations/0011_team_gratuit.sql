-- Gestion des équipes gratuite : chaque formule permet jusqu'à 200 membres par logiciel.
update public.plans set max_members = greatest(max_members, 200);
