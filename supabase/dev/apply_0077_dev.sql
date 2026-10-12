-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0077: eliminar mi cuenta. Requiere 0076 ya aplicada. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create or replace function account_delete(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_confirm is distinct from 'ELIMINAR' then raise exception 'Escribe ELIMINAR para confirmar.'; end if;
  if exists (select 1 from profiles where id = uid and rol <> 'fan') then
    raise exception 'Tu cuenta es del equipo de DARF. Pide al Director que la dé de baja.';
  end if;
  if exists (select 1 from production_members where user_id = uid)
     or exists (select 1 from member_enrollment where user_id = uid)
     or exists (select 1 from rubric_teachers where user_id = uid)
     or exists (select 1 from audition_members where user_id = uid) then
    raise exception 'Tienes un expediente o un papel en una producción. Escríbenos desde Contacto y lo hacemos contigo.';
  end if;
  -- Cada cuenta tiene código de vendedor (0050); si ya vendió boletos, se queda en la contabilidad.
  if exists (select 1 from orders o join sellers s on s.id = o.seller_id where s.user_id = uid) then
    raise exception 'Hay boletos vendidos con tu código de vendedor. Escríbenos desde Contacto y lo hacemos contigo.';
  end if;
  if exists (select 1 from orders where buyer_user_id = uid and status = 'pendiente') then
    raise exception 'Tienes una orden pendiente de pago. Espera a que se apruebe o se cancele.';
  end if;
  if exists (select 1 from orders o join performances pf on pf.id = o.performance_id
              where o.buyer_user_id = uid and o.status = 'aprobado' and pf.starts_at > now()) then
    raise exception 'Tienes boletos para una función que aún no pasa. Podrás eliminar tu cuenta después de tu función.';
  end if;
  update orders set buyer_user_id = null, buyer_nombre = 'Cuenta eliminada', buyer_telefono = '—' where buyer_user_id = uid;
  delete from auth.users where id = uid;
end $$;
revoke execute on function account_delete(text) from public, anon;
grant execute on function account_delete(text) to authenticated;

commit;
