-- 0030: cuántos ensayos tiene una obra, sin revelar los videos.
-- La página de obra muestra el botón "Fan Zone" solo si hay ensayos, también a
-- quien no ha iniciado sesión; los videos siguen visibles solo con cuenta (0029).

begin;

create or replace function production_rehearsal_count(pid text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from production_media
  where production_id = pid and tipo = 'ensayo' and production_is_visible(pid)
$$;
revoke execute on function production_rehearsal_count(text) from public;
grant execute on function production_rehearsal_count(text) to anon, authenticated;

commit;
