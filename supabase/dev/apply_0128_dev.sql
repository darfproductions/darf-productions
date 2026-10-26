-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0128: cada obra decide si los apartados de la página se cancelan solos si no se pagan a tiempo, y el plazo
-- (de 1 hora a 30 días). Las obras que ya existen siguen igual (se cancelan solos a las 24 h) hasta que lo cambies
-- en Boletos → Funciones y horarios → Venta y precios.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.obra_logistica') is null then
    raise exception 'ABORTADO: primero corre el script de 0127.';
  end if;
end $$;
-- 0128 (Diego 2026-10-26): apartados de la página con vencimiento por obra.
--   * Cada obra decide si las órdenes que se apartan en la página se cancelan solas si no se pagan a tiempo, y cuánto
--     tiempo dan (de 1 hora a 30 días). Antes era fijo para todas: entre 30 min y 24 h (0054).
--   * Apagado: la orden se queda apartada hasta que el equipo la apruebe o la cancele a mano.
--   * Encendido: vence a las horas elegidas, nunca después de 3 h antes de la función (para no abrir puertas con
--     asientos apartados sin pagar) ni antes de 30 min.
--   * Las obras que ya existen siguen igual: encendido y 24 h.
--   * Beneficios (2026-10-26): el resumen de la orden (WhatsApp) también trae la nota del beneficio ("uno por compra,
--     no por boleto"), como ya la traía cada boleto.
-- Precede: 0127.

begin;

alter table productions add column if not exists apartados_vencen boolean not null default true;
alter table productions add column if not exists apartados_horas int not null default 24;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'productions_apartados_horas_rango') then
    alter table productions add constraint productions_apartados_horas_rango check (apartados_horas between 1 and 720);
  end if;
end $$;

-- Plazo de una orden nueva del público según su obra (null = no vence).
create or replace function plazo_apartado(pfid uuid, desde timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when p.apartados_vencen then
           greatest(desde + interval '30 minutes',
                    least(desde + make_interval(hours => p.apartados_horas),
                          coalesce(pf.starts_at - interval '3 hours', desde + make_interval(hours => p.apartados_horas))))
         end
    from performances pf join productions p on p.id = pf.production_id
   where pf.id = pfid
$$;

create or replace function orders_set_expiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pendiente' and new.expires_at is null and new.created_by_staff_id is null then
    new.expires_at := plazo_apartado(new.performance_id);
  end if;
  return new;
end $$;

-- Interruptor y plazo de la obra. Ajusta los apartados pendientes de las funciones que vienen:
-- al apagar dejan de vencer; al encender (o cambiar el plazo) los que no tenían plazo toman el nuevo desde ahora.
-- Los que ya tenían plazo lo conservan (no se le recorta tiempo a nadie).
create or replace function obra_apartados(pid text, p_vence boolean, p_horas int) returns int
language plpgsql security definer set search_path = public as $$
declare antes productions; n int;
begin
  if not (has_perm(pid, 'ventas.operar') or has_perm(pid, 'funciones.gestionar')) then raise exception 'No autorizado'; end if;
  if p_vence is null then raise exception 'Elige si los apartados se cancelan solos.'; end if;
  if p_horas is null or p_horas not between 1 and 720 then raise exception 'El plazo va de 1 hora a 30 días.'; end if;
  select * into antes from productions where id = pid for update;
  if not found then raise exception 'No se encontró la obra.'; end if;
  update productions set apartados_vencen = p_vence, apartados_horas = p_horas, updated_at = now() where id = pid;
  if p_vence then
    update orders o set expires_at = plazo_apartado(o.performance_id), aviso_vence_at = null
      from performances pf
     where pf.id = o.performance_id and pf.production_id = pid and pf.starts_at > now()
       and o.status = 'pendiente' and o.expires_at is null and o.created_by_staff_id is null;
  else
    update orders o set expires_at = null, aviso_vence_at = null
      from performances pf
     where pf.id = o.performance_id and pf.production_id = pid
       and o.status = 'pendiente' and o.expires_at is not null;
  end if;
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('productions', 'apartados', pid,
            jsonb_build_object('vencen', antes.apartados_vencen, 'horas', antes.apartados_horas),
            jsonb_build_object('vencen', p_vence, 'horas', p_horas, 'ordenes', n));
  return n;
end $$;

-- La nota del beneficio también en el resumen de la orden (igual que 0125, más 'detalle').
create or replace function orden_beneficios(p_order uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid text; dueno uuid;
begin
  select pf.production_id, o.buyer_user_id into pid, dueno from orders o join performances pf on pf.id = o.performance_id where o.id = p_order;
  if pid is null then return '[]'::json; end if;
  if not (coalesce(dueno = auth.uid(), false) or is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'ventas.operar')) then
    raise exception 'No autorizado';
  end if;
  return coalesce((
    select json_agg(json_build_object('zona', z.zona, 'beneficios', z.bs) order by z.zona)
    from (
      select pc.nombre as zona,
             json_agg(json_build_object('tipo', zb.tipo, 'nombre', zb.nombre, 'detalle', zb.detalle, 'minutos_antes', zb.minutos_antes, 'cupo', zb.cupo,
                                        'entrega', zb.entrega, 'entrega_dias', zb.entrega_dias)
                      order by zb.orden, zb.created_at) as bs
      from (select distinct coalesce(t.price_category_id, s.price_category_id) as zona
              from tickets t left join seats s on s.id = t.seat_id where t.order_id = p_order and t.is_active) tz
      join price_categories pc on pc.id = tz.zona
      join zona_beneficio_zonas zz on zz.price_category_id = tz.zona
      join zona_beneficios zb on zb.id = zz.beneficio_id and zb.activo
           and (zb.funciones is null or (select performance_id from orders where id = p_order) = any(zb.funciones))
      group by pc.nombre
    ) z), '[]'::json);
end $$;

revoke all on function plazo_apartado(uuid, timestamptz), obra_apartados(text, boolean, int) from public, anon;
grant execute on function obra_apartados(text, boolean, int) to authenticated;
revoke execute on function orders_set_expiry() from public, anon, authenticated;

commit;


select 'Listo 0128. Obras con apartados que vencen: ' || (select count(*) from productions where apartados_vencen)
  || ' de ' || (select count(*) from productions) || '.' as resultado;
