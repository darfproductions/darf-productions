-- 0095: salir del Club Fan (Bloque 4C, 2026-10-13).
--   * fan_leave(): la persona deja el club desde Mi cuenta. Se borran sus recordatorios de
--     preventa (son del club). Sus lugares ya apartados y sus boletos se quedan como están.
--   * Si vuelve a unirse, recibe un número de socio nuevo (el anterior no se recupera).
--   * El equipo y los elencos siguen viendo la Fan Zone por su trabajo (is_fan_member, 0083).
-- Precede: 0094.

begin;

create or replace function fan_leave() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  delete from fan_members where user_id = auth.uid();
  if not found then raise exception 'No estás en el Club Fan.'; end if;
  delete from preventa_recordatorios where user_id = auth.uid();
end $$;
revoke execute on function fan_leave() from public, anon;
grant execute on function fan_leave() to authenticated;

commit;
