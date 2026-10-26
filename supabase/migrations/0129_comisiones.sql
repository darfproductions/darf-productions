-- 0129 (Diego 2026-10-26): comisiones de los vendedores por obra.
--   * Cada obra tiene su tabla de tramos: "del boleto 26 al 35, 10 %; del 36 al 45, 20 %". Cada % se aplica solo a
--     los boletos de su tramo (no a todos). También sirve un solo % para todos (desde el 1) o "a partir del boleto N".
--   * A un vendedor se le puede poner su propia tabla; si la tiene, manda sobre la de la obra.
--   * Se calcula sobre lo que pagó cada boleto (ya con descuento). Las cortesías no cuentan ni para el número de boleto.
--   * El conteo junta todas las funciones de la obra, en el orden en que se pagaron. Es en vivo: si se cancela un
--     boleto, se recalcula.
--   * Pagos: el equipo marca lo que ya se le pagó a cada vendedor (con bitácora); queda "por pagar" la diferencia.
-- Precede: 0128.

begin;

create table if not exists comision_tramos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  seller_id uuid references sellers(id) on delete cascade,  -- null = regla de la obra
  desde int not null check (desde >= 1),
  hasta int check (hasta is null or hasta >= desde),         -- null = en adelante
  porcentaje numeric(5,2) not null check (porcentaje between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists comision_tramos_obra_idx on comision_tramos(production_id, seller_id);

create table if not exists comision_pagos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  seller_id uuid not null references sellers(id) on delete cascade,
  monto numeric(10,2) not null check (monto > 0),
  nota text check (nota is null or char_length(nota) <= 200),
  pagado_por uuid default auth.uid(),
  pagado_at timestamptz not null default now()
);
create index if not exists comision_pagos_obra_idx on comision_pagos(production_id, seller_id);

alter table comision_tramos enable row level security;
alter table comision_pagos enable row level security;
drop policy if exists comision_tramos_team on comision_tramos;
create policy comision_tramos_team on comision_tramos for select to authenticated
  using (has_perm(production_id, 'ventas.ver') or has_perm(production_id, 'vendedores.gestionar'));
drop policy if exists comision_pagos_team on comision_pagos;
create policy comision_pagos_team on comision_pagos for select to authenticated
  using (has_perm(production_id, 'ventas.ver') or has_perm(production_id, 'vendedores.gestionar'));

-- % del boleto número n de un vendedor (su tabla si tiene, si no la de la obra; 0 si ningún tramo lo cubre).
create or replace function comision_pct(pid text, sid uuid, n int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select t.porcentaje from comision_tramos t
                    where t.production_id = pid
                      and t.seller_id is not distinct from (case when exists (select 1 from comision_tramos x
                                                                                where x.production_id = pid and x.seller_id = sid)
                                                                 then sid end)
                      and n >= t.desde and (t.hasta is null or n <= t.hasta)
                    order by t.desde limit 1), 0)
$$;

-- Cálculo de toda la obra (sin revisar permisos: lo usan comisiones_obra y mi_comision).
create or replace function comision_calculo(pid text)
returns table (seller_id uuid, boletos int, base numeric, comision numeric, pagado numeric, por_pagar numeric,
               pct_actual numeric, siguiente_desde int, siguiente_pct numeric, propia boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.seller_id as sid, t.unit_price,
           row_number() over (partition by o.seller_id
                              order by coalesce(o.approved_at, o.created_at), t.created_at, t.id)::int as n
      from tickets t
      join orders o on o.id = t.order_id
      join performances pf on pf.id = o.performance_id
     where pf.production_id = pid and o.seller_id is not null and o.status = 'aprobado' and t.is_active
       and o.metodo_pago is distinct from 'cortesia'
  ),
  calc as (
    select b.sid, count(*)::int as boletos, sum(b.unit_price) as base,
           round(sum(b.unit_price * comision_pct(pid, b.sid, b.n) / 100), 2) as comision
      from b group by b.sid
  ),
  ids as (
    select sid from calc
    union select t.seller_id from comision_tramos t where t.production_id = pid and t.seller_id is not null
    union select p.seller_id from comision_pagos p where p.production_id = pid
  ),
  pagos as (
    select p.seller_id as sid, sum(p.monto) as pagado from comision_pagos p where p.production_id = pid group by p.seller_id
  ),
  x as (
    select ids.sid, coalesce(c.boletos, 0) as boletos, coalesce(c.base, 0) as base, coalesce(c.comision, 0) as comision,
           coalesce(pg.pagado, 0) as pagado,
           exists (select 1 from comision_tramos t where t.production_id = pid and t.seller_id = ids.sid) as propia
      from ids left join calc c on c.sid = ids.sid left join pagos pg on pg.sid = ids.sid
  )
  select x.sid, x.boletos, x.base, x.comision, x.pagado, x.comision - x.pagado,
         comision_pct(pid, x.sid, x.boletos + 1),
         sig.desde, sig.porcentaje, x.propia
    from x
    left join lateral (
      select t.desde, t.porcentaje from comision_tramos t
       where t.production_id = pid and t.seller_id is not distinct from (case when x.propia then x.sid end)
         and t.desde > x.boletos + 1
       order by t.desde limit 1
    ) sig on true
$$;

-- Panel: comisiones de la obra (mismo permiso que la lista de vendedores).
create or replace function comisiones_obra(pid text)
returns table (seller_id uuid, boletos int, base numeric, comision numeric, pagado numeric, por_pagar numeric,
               pct_actual numeric, siguiente_desde int, siguiente_pct numeric, propia boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'ventas.ver') or has_perm(pid, 'vendedores.gestionar') or has_perm(pid, 'reportes.ver')) then
    raise exception 'No autorizado';
  end if;
  return query select * from comision_calculo(pid);
end $$;

-- Guarda la tabla de la obra (sid null) o la propia de un vendedor. Lista vacía: la obra queda sin comisiones; el
-- vendedor vuelve a la regla de la obra.
create or replace function comision_guardar(pid text, sid uuid, tramos jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r record; prev_hasta int; primero boolean := true; antes jsonb; n int := 0;
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from productions where id = pid) then raise exception 'No se encontró la obra.'; end if;
  if sid is not null and not exists (select 1 from sellers where id = sid) then raise exception 'No existe ese vendedor.'; end if;
  if tramos is null or jsonb_typeof(tramos) <> 'array' then raise exception 'Faltan los tramos.'; end if;
  if jsonb_array_length(tramos) > 20 then raise exception 'Máximo 20 tramos.'; end if;
  for r in select (e->>'desde')::int as desde, nullif(e->>'hasta', '')::int as hasta, (e->>'porcentaje')::numeric as pct
             from jsonb_array_elements(tramos) e order by (e->>'desde')::int loop
    if r.desde is null or r.desde < 1 then raise exception 'Cada tramo empieza en el boleto 1 o después.'; end if;
    if r.hasta is not null and r.hasta < r.desde then raise exception 'En el tramo que empieza en %, el final va antes del inicio.', r.desde; end if;
    if r.pct is null or r.pct < 0 or r.pct > 100 then raise exception 'El porcentaje va de 0 a 100.'; end if;
    if not primero and (prev_hasta is null or r.desde <= prev_hasta) then
      raise exception 'Los tramos se enciman cerca del boleto %.', r.desde;
    end if;
    prev_hasta := r.hasta; primero := false;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('desde', desde, 'hasta', hasta, 'porcentaje', porcentaje) order by desde), '[]')
    into antes from comision_tramos where production_id = pid and seller_id is not distinct from sid;
  delete from comision_tramos where production_id = pid and seller_id is not distinct from sid;
  insert into comision_tramos (production_id, seller_id, desde, hasta, porcentaje)
    select pid, sid, (e->>'desde')::int, nullif(e->>'hasta', '')::int, round((e->>'porcentaje')::numeric, 2)
      from jsonb_array_elements(tramos) e;
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('comision_tramos', 'guardar', pid, jsonb_build_object('vendedor', sid, 'tramos', antes),
            jsonb_build_object('vendedor', sid, 'tramos', tramos));
  return n;
end $$;

create or replace function comision_pagar(pid text, sid uuid, p_monto numeric, p_nota text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from sellers where id = sid) then raise exception 'No existe ese vendedor.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Escribe cuánto se pagó.'; end if;
  insert into comision_pagos (production_id, seller_id, monto, nota)
    values (pid, sid, round(p_monto, 2), nullif(left(btrim(coalesce(p_nota, '')), 200), '')) returning id into nid;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('comision_pagos', 'pagar', pid, null, jsonb_build_object('vendedor', sid, 'monto', round(p_monto, 2), 'nota', p_nota));
  return nid;
end $$;

create or replace function comision_deshacer_pago(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pg comision_pagos;
begin
  select * into pg from comision_pagos where id = p_id;
  if not found then raise exception 'No se encontró ese pago.'; end if;
  if not has_perm(pg.production_id, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  delete from comision_pagos where id = p_id;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('comision_pagos', 'deshacer', pg.production_id, to_jsonb(pg), null);
end $$;

-- Mi cuenta: mi comisión en cada obra donde vendí o tengo tabla propia (solo obras con alguna regla).
create or replace function mi_comision()
returns table (production_id text, boletos int, comision numeric, pagado numeric, por_pagar numeric,
               pct_actual numeric, siguiente_desde int, siguiente_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select id into sid from sellers where user_id = auth.uid();
  if sid is null then return; end if;
  return query
    select o.pid, c.boletos, c.comision, c.pagado, c.por_pagar, c.pct_actual, c.siguiente_desde, c.siguiente_pct
      from (select distinct pf.production_id as pid from orders od join performances pf on pf.id = od.performance_id
             where od.seller_id = sid
            union select t.production_id from comision_tramos t where t.seller_id = sid) o
      cross join lateral comision_calculo(o.pid) c
     where c.seller_id = sid
       and exists (select 1 from comision_tramos t where t.production_id = o.pid);
end $$;

revoke all on function comision_pct(text, uuid, int), comision_calculo(text) from public, anon, authenticated;
revoke all on function comisiones_obra(text), comision_guardar(text, uuid, jsonb), comision_pagar(text, uuid, numeric, text),
  comision_deshacer_pago(uuid), mi_comision() from public, anon;
grant execute on function comisiones_obra(text), comision_guardar(text, uuid, jsonb), comision_pagar(text, uuid, numeric, text),
  comision_deshacer_pago(uuid), mi_comision() to authenticated;

commit;
