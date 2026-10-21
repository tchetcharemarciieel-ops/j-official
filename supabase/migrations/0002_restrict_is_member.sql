-- is_member n'est utile qu'aux utilisateurs connectés (politiques RLS) : retrait de l'accès anonyme.
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
