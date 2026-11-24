-- Formule gratuite Découverte : 1 utilisateur par logiciel (les formules payantes gardent leurs places).
update public.plans set max_members = 1 where id = 'decouverte';
