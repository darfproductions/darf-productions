-- 0122 (Diego 2026-10-22): beneficios por zona.
--   Una zona no solo es "mejor lugar": puede incluir beneficios configurables por obra (VIP: acceso 15 min antes,
--   póster firmado, foto con el elenco, bartender propio…). Tipos fijos (experiencia, acceso, souvenir, atención,
--   otro). Un beneficio puede ser de varias zonas, tener cupo ("los primeros 20") y valer solo en ciertas funciones.
--   Se ven en la página, al elegir lugares, en WhatsApp, en el boleto y en la puerta, donde se marca lo entregado.
--   Ojo: los boletos con asiento no guardan su zona; es la del asiento (coalesce como check_in_ticket, 0068).

create table if not exists zona_beneficios (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  tipo text not null default 'experiencia' check (tipo in ('experiencia', 'acceso', 'souvenir', 'atencion', 'otro')),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  detalle text check (detalle is null or char_length(detalle) <= 400),
  minutos_antes int check (minutos_antes is null or minutos_antes between 1 and 240),
  cupo int check (cupo is null or cupo between 1 and 100000),
  funciones uuid[],
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zona_beneficios_minutos_acceso check (minutos_antes is null or tipo = 'acceso')
);
create index if not exists zona_beneficios_prod_idx on zona_beneficios(production_id, orden);

create table if not exists zona_beneficio_zonas (
  beneficio_id uuid not null references zona_beneficios(id) on delete cascade,
  price_category_id uuid not null references price_categories(id) on delete cascade,
  primary key (beneficio_id, price_category_id)
);
create index if not exists zona_beneficio_zonas_zona_idx on zona_beneficio_zonas(price_category_id);

create table if not exists beneficio_entregas (
  ticket_id uuid not null references tickets(id) on delete cascade,
  beneficio_id uuid not null references zona_beneficios(id) on delete cascade,
  entregado_at timestamptz not null default now(),
  entregado_por uuid default auth.uid(),
  primary key (ticket_id, beneficio_id)
);

-- La zona y el beneficio deben ser de la misma obra.
create or replace function zona_beneficio_misma_obra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select production_id from zona_beneficios where id = new.beneficio_id)
     is distinct from (select production_id from price_categories where id = new.price_category_id) then
    raise exception 'Esa zona es de otra obra.';
  end if;
  return new;
end $$;
drop trigger if exists zona_beneficio_misma_obra on zona_beneficio_zonas;
create trigger zona_beneficio_misma_obra before insert or update on zona_beneficio_zonas
  for each row execute function zona_beneficio_misma_obra();

drop trigger if exists audit_zona_beneficios on zona_beneficios;
create trigger audit_zona_beneficios after insert or update or delete on zona_beneficios
  for each row execute function audit_row();

-- ──────── RLS ────────
alter table zona_beneficios enable row level security;
alter table zona_beneficio_zonas enable row level security;
alter table beneficio_entregas enable row level security;

drop policy if exists zona_beneficios_read on zona_beneficios;
create policy zona_beneficios_read on zona_beneficios for select using (activo);
drop policy if exists zona_beneficios_team_read on zona_beneficios;
create policy zona_beneficios_team_read on zona_beneficios for select to authenticated
  using (has_perm(production_id, 'funciones.gestionar') or has_perm(production_id, 'ventas.ver'));
drop policy if exists zona_beneficios_write on zona_beneficios;
create policy zona_beneficios_write on zona_beneficios for all to authenticated
  using (has_perm(production_id, 'funciones.gestionar')) with check (has_perm(production_id, 'funciones.gestionar'));

drop policy if exists zona_beneficio_zonas_read on zona_beneficio_zonas;
create policy zona_beneficio_zonas_read on zona_beneficio_zonas for select
  using (exists (select 1 from zona_beneficios b where b.id = beneficio_id));
drop policy if exists zona_beneficio_zonas_write on zona_beneficio_zonas;
create policy zona_beneficio_zonas_write on zona_beneficio_zonas for all to authenticated
  using (exists (select 1 from zona_beneficios b where b.id = beneficio_id and has_perm(b.production_id, 'funciones.gestionar')))
  with check (exists (select 1 from zona_beneficios b where b.id = beneficio_id and has_perm(b.production_id, 'funciones.gestionar')));

-- Las entregas solo se tocan con las funciones de abajo; el equipo de la obra las lee.
drop policy if exists beneficio_entregas_read on beneficio_entregas;
create policy beneficio_entregas_read on beneficio_entregas for select to authenticated
  using (exists (select 1 from zona_beneficios b where b.id = beneficio_id
                 and (has_perm(b.production_id, 'puerta.validar') or has_perm(b.production_id, 'ventas.ver'))));

-- ──────── Beneficios de un boleto (interna) ────────
-- alcanza: sin cupo, siempre; con cupo, si el boleto está entre los primeros N boletos pagados de la función con ese
-- beneficio (por hora de aprobación). Null mientras la orden no esté aprobada.
create or replace function beneficios_de_ticket(p_ticket uuid)
returns table (beneficio_id uuid, tipo text, nombre text, detalle text, minutos_antes int, cupo int,
               alcanza boolean, entregado_at timestamptz, zona text)
language sql stable security definer set search_path = public as $$
  with b as (
    select t.id as tid, t.performance_id as pf, t.created_at as t_at, o.status, coalesce(o.approved_at, o.created_at) as pagado,
           coalesce(t.price_category_id, s.price_category_id) as zona
    from tickets t join orders o on o.id = t.order_id left join seats s on s.id = t.seat_id
    where t.id = p_ticket and t.is_active
  )
  select zb.id, zb.tipo, zb.nombre, zb.detalle, zb.minutos_antes, zb.cupo,
         case when zb.cupo is null then true
              when b.status <> 'aprobado' then null
              else (select count(*) from tickets t2 join orders o2 on o2.id = t2.order_id left join seats s2 on s2.id = t2.seat_id
                     where t2.performance_id = b.pf and t2.is_active and o2.status = 'aprobado'
                       and coalesce(t2.price_category_id, s2.price_category_id) in
                           (select z2.price_category_id from zona_beneficio_zonas z2 where z2.beneficio_id = zb.id)
                       and (coalesce(o2.approved_at, o2.created_at), t2.created_at, t2.id) < (b.pagado, b.t_at, b.tid)) < zb.cupo
         end,
         e.entregado_at, pc.nombre
  from b
  join zona_beneficio_zonas z on z.price_category_id = b.zona
  join zona_beneficios zb on zb.id = z.beneficio_id and zb.activo and (zb.funciones is null or b.pf = any(zb.funciones))
  join price_categories pc on pc.id = b.zona
  left join beneficio_entregas e on e.ticket_id = b.tid and e.beneficio_id = zb.id
  order by zb.orden, zb.created_at
$$;
revoke all on function beneficios_de_ticket(uuid) from public, anon, authenticated;

-- Para el dueño del boleto (Mi cuenta, PDF, Wallet) y el equipo con ventas o puerta.
create or replace function beneficios_boleto(p_ticket uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid text; dueno uuid;
begin
  select pf.production_id, o.buyer_user_id into pid, dueno
  from tickets t join orders o on o.id = t.order_id join performances pf on pf.id = t.performance_id where t.id = p_ticket;
  if pid is null then return '[]'::json; end if;
  if not (coalesce(dueno = auth.uid(), false) or is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'puerta.validar')) then
    raise exception 'No autorizado';
  end if;
  return coalesce((select json_agg(row_to_json(x)) from beneficios_de_ticket(p_ticket) x), '[]'::json);
end $$;
revoke all on function beneficios_boleto(uuid) from public, anon;
grant execute on function beneficios_boleto(uuid) to authenticated;

-- Puerta: beneficios del boleto escaneado (por su QR).
create or replace function beneficios_qr(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare tid uuid; pid text;
begin
  select t.id, pf.production_id into tid, pid from tickets t join performances pf on pf.id = t.performance_id
  where t.qr_token::text = lower(btrim(coalesce(p_token, '')));
  if tid is null then return json_build_object('ticket_id', null, 'beneficios', '[]'::json); end if;
  if not (is_staff() or has_perm(pid, 'puerta.validar')) then raise exception 'No autorizado'; end if;
  return json_build_object('ticket_id', tid,
    'beneficios', coalesce((select json_agg(row_to_json(x)) from beneficios_de_ticket(tid) x), '[]'::json));
end $$;
revoke all on function beneficios_qr(text) from public, anon;
grant execute on function beneficios_qr(text) to authenticated;

-- Puerta: marcar (o desmarcar) que ya se entregó.
create or replace function beneficio_entregar(p_token text, p_beneficio uuid, p_entregado boolean default true) returns json
language plpgsql security definer set search_path = public as $$
declare tid uuid; pid text;
begin
  select t.id, pf.production_id into tid, pid from tickets t join performances pf on pf.id = t.performance_id
  where t.qr_token::text = lower(btrim(coalesce(p_token, '')));
  if tid is null then raise exception 'Boleto no encontrado.'; end if;
  if not (is_staff() or has_perm(pid, 'puerta.validar')) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio) then
    raise exception 'Este boleto no tiene ese beneficio.';
  end if;
  if p_entregado then
    insert into beneficio_entregas (ticket_id, beneficio_id, entregado_por) values (tid, p_beneficio, auth.uid())
    on conflict (ticket_id, beneficio_id) do nothing;
  else
    delete from beneficio_entregas where ticket_id = tid and beneficio_id = p_beneficio;
  end if;
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  values ('beneficio_entregas', case when p_entregado then 'entregar' else 'desmarcar' end, tid::text, pid,
          json_build_object('beneficio_id', p_beneficio)::jsonb);
  return beneficios_qr(p_token);
end $$;
revoke all on function beneficio_entregar(text, uuid, boolean) from public, anon;
grant execute on function beneficio_entregar(text, uuid, boolean) to authenticated;

-- Para WhatsApp y la pantalla final: zonas de la orden con sus beneficios.
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
             json_agg(json_build_object('tipo', zb.tipo, 'nombre', zb.nombre, 'minutos_antes', zb.minutos_antes, 'cupo', zb.cupo)
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
revoke all on function orden_beneficios(uuid) from public, anon;
grant execute on function orden_beneficios(uuid) to authenticated;

-- Reporte por función: cuántos boletos tienen derecho y cuántos ya se entregaron.
create or replace function beneficios_reporte(p_performance uuid)
returns table (beneficio_id uuid, nombre text, tipo text, cupo int, con_derecho int, entregados int)
language plpgsql stable security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from performances where id = p_performance;
  if pid is null then return; end if;
  if not (is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'puerta.validar') or has_perm(pid, 'funciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select zb.id, zb.nombre, zb.tipo, zb.cupo,
           (select case when zb.cupo is null then count(*) else least(count(*), zb.cupo) end
              from tickets t join orders o on o.id = t.order_id left join seats s on s.id = t.seat_id
             where t.performance_id = p_performance and t.is_active and o.status = 'aprobado'
               and coalesce(t.price_category_id, s.price_category_id) in (select z.price_category_id from zona_beneficio_zonas z where z.beneficio_id = zb.id))::int,
           (select count(*) from beneficio_entregas e join tickets t on t.id = e.ticket_id
             where e.beneficio_id = zb.id and t.performance_id = p_performance)::int
    from zona_beneficios zb
    where zb.production_id = pid and zb.activo and (zb.funciones is null or p_performance = any(zb.funciones))
    order by zb.orden, zb.created_at;
end $$;
revoke all on function beneficios_reporte(uuid) from public, anon;
grant execute on function beneficios_reporte(uuid) to authenticated;

-- Mi cuenta: beneficios de varios boletos de una vez (solo los míos o los de una obra donde soy del equipo).
create or replace function beneficios_boletos(p_tickets uuid[]) returns table (ticket_id uuid, beneficios json)
language sql stable security definer set search_path = public as $$
  select t.id, coalesce((select json_agg(row_to_json(x)) from beneficios_de_ticket(t.id) x), '[]'::json)
  from tickets t join orders o on o.id = t.order_id join performances pf on pf.id = t.performance_id
  where t.id = any(p_tickets)
    and (o.buyer_user_id = auth.uid() or is_staff() or has_perm(pf.production_id, 'ventas.ver') or has_perm(pf.production_id, 'puerta.validar'))
$$;
revoke all on function beneficios_boletos(uuid[]) from public, anon;
grant execute on function beneficios_boletos(uuid[]) to authenticated;

-- Apple Wallet actualiza el pase sin sesión (con su token): mismos beneficios que ve el dueño.
create or replace function wallet_beneficios(p_serial text, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare w wallet_pases;
begin
  if not wallet_token_ok(p_serial, p_token) then return '[]'::json; end if;
  select * into w from wallet_pases where serial = p_serial;
  if w.tipo <> 'boleto' or w.ticket_id is null then return '[]'::json; end if;
  return coalesce((select json_agg(row_to_json(x)) from beneficios_de_ticket(w.ticket_id) x), '[]'::json);
end $$;
revoke all on function wallet_beneficios(text, text) from public;
grant execute on function wallet_beneficios(text, text) to anon, authenticated;
