-- 0071: notificaciones en Mi cuenta (2026-10-12, aprobado por Diego).
--   push_test (probar el teléfono) ya no es solo del equipo: cualquier persona con sesión
--   (el elenco, fans) puede probar, con el mismo tope de 5 por hora (0068). La prueba lleva a
--   /cuenta/notificaciones, que existe para todos.
-- Precede: 0070.

begin;

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
