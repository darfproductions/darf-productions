-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0071: cualquiera con sesión puede probar las notificaciones en su teléfono (desde Mi cuenta).
-- Requiere 0070 ya aplicada. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
create or replace function push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  if (select count(*) from notifications where user_id = auth.uid() and tipo = 'prueba' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya mandaste varias pruebas. Intenta en una hora.';
  end if;
  insert into notifications (user_id, tipo, titulo, detalle, href)
  values (auth.uid(), 'prueba', 'Prueba de notificación', 'Si ves esto en tu teléfono, ya quedó.', '/cuenta/notificaciones');
end $$;
revoke execute on function push_test() from public, anon;
grant execute on function push_test() to authenticated;

commit;
