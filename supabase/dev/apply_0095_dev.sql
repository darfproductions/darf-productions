-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0095: salir del Club Fan desde Mi cuenta. Requiere 0094.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

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
