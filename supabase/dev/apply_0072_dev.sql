-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0072: avisos para quien compra boletos. Requiere 0071 ya aplicada. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
alter table orders
  add column aviso_vence_at timestamptz,     -- ya se avisó que el apartado vence pronto
  add column aviso_funcion_at timestamptz;   -- ya se mandó el recordatorio de la función

-- "hoy a las 19:00" / "mañana a las 19:00" / "el 24/10 a las 19:00" (hora de CDMX).
create or replace function cuando_mx(t timestamptz) returns text
language sql stable set search_path = public as $$
  select case (t at time zone 'America/Mexico_City')::date - (now() at time zone 'America/Mexico_City')::date
           when 0 then 'hoy' when 1 then 'mañana'
           else 'el ' || to_char(t at time zone 'America/Mexico_City', 'DD/MM') end
         || ' a las ' || to_char(t at time zone 'America/Mexico_City', 'HH24:MI')
$$;

-- ════════ Cambios de estado de la orden ════════
create or replace function notify_buyer() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text; inicio timestamptz; obra text;
begin
  begin
    if new.buyer_user_id is null or new.created_by_staff_id is not null or new.status = old.status then return new; end if;
    select production_id, starts_at into pid, inicio from performances where id = new.performance_id;
    obra := production_name(pid);
    if new.status = 'aprobado' then
      perform notify(array[new.buyer_user_id], 'boletos', '¡Tus boletos están listos!',
        concat_ws(' · ', obra, case when inicio is not null then 'Función ' || cuando_mx(inicio) end, new.order_code, 'Muestra tu código QR en la entrada'),
        '/cuenta#boletos', pid);
    elsif new.status = 'rechazado' and new.vencida_at is not null and old.status = 'pendiente' then
      perform notify(array[new.buyer_user_id], 'boletos', 'Tu apartado venció',
        concat_ws(' · ', obra, new.order_code, 'No recibimos tu pago a tiempo y los asientos se liberaron. Puedes volver a comprar.'),
        '/producciones/' || pid, pid);
    elsif new.status = 'rechazado' then
      perform notify(array[new.buyer_user_id], 'boletos', 'Tu orden fue cancelada',
        concat_ws(' · ', obra, new.order_code, 'Si crees que es un error, escríbenos.'),
        '/contacto', pid);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_buyer after update of status on orders for each row execute function notify_buyer();

-- ════════ Recordatorios (cada 15 min) ════════
create or replace function notify_buyer_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  -- Apartados que vencen en 2 horas o menos (una sola vez).
  for r in
    select o.id, o.buyer_user_id, o.order_code, o.expires_at, pf.production_id as pid
      from orders o join performances pf on pf.id = o.performance_id
     where o.status = 'pendiente' and o.buyer_user_id is not null and o.created_by_staff_id is null
       and o.aviso_vence_at is null and o.expires_at is not null
       and o.expires_at > now() and o.expires_at <= now() + interval '2 hours'
       and o.created_at < now() - interval '30 minutes'
     for update of o skip locked
  loop
    perform notify(array[r.buyer_user_id], 'boletos', 'Tu apartado vence pronto',
      concat_ws(' · ', production_name(r.pid), r.order_code, 'Paga antes de ' || cuando_mx(r.expires_at) || ' para no perder tus asientos'),
      '/cuenta#boletos', r.pid);
    update orders set aviso_vence_at = now() where id = r.id;
    n := n + 1;
  end loop;

  -- Recordatorio de la función (entre 24 h y 1 h antes; una sola vez).
  for r in
    select o.id, o.buyer_user_id, pf.starts_at, pf.venue, pf.production_id as pid,
           (select count(*) from tickets t where t.order_id = o.id and t.is_active) as boletos
      from orders o join performances pf on pf.id = o.performance_id
     where o.status = 'aprobado' and o.buyer_user_id is not null
       and o.aviso_funcion_at is null and pf.starts_at is not null
       and pf.starts_at > now() + interval '1 hour' and pf.starts_at <= now() + interval '24 hours'
     for update of o skip locked
  loop
    if r.boletos > 0 then
      perform notify(array[r.buyer_user_id], 'boletos', 'Tu función es ' || cuando_mx(r.starts_at),
        concat_ws(' · ', production_name(r.pid), r.venue, r.boletos || case when r.boletos = 1 then ' boleto' else ' boletos' end, 'Ten tu código QR a la mano'),
        '/cuenta#boletos', r.pid);
      n := n + 1;
    end if;
    update orders set aviso_funcion_at = now() where id = r.id;
  end loop;
  return n;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_buyer_reminders';
    perform cron.schedule('darf_buyer_reminders', '*/15 * * * *', 'select public.notify_buyer_reminders()');
  end if;
end $$;

-- Se puede apagar en el teléfono como los demás tipos.
create or replace function push_set_off(p_tipos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into push_prefs (user_id, apagados)
  values (auth.uid(), coalesce((select array_agg(distinct t) from unnest(p_tipos) t
                                 where t in ('contacto', 'audicion', 'orden', 'oferta', 'documento', 'ausencia', 'solicitud', 'boletos', 'equipo', 'cambio', 'prueba')), '{}'))
  on conflict (user_id) do update set apagados = excluded.apagados;
end $$;
revoke execute on function push_set_off(text[]) from public, anon;
grant execute on function push_set_off(text[]) to authenticated;

revoke execute on function notify_buyer(), notify_buyer_reminders() from public, anon, authenticated;
revoke execute on function cuando_mx(timestamptz) from public, anon;

commit;
