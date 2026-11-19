-- 0152 · Honorarios, parte 3 (especificación sección 7 y decisiones de Diego 2026-11-19).
--   * Cierre de temporada por obra (o por extensión): ingresos de boletos (se llenan solos con las órdenes aprobadas;
--     Patricio puede corregirlos), patrocinios y costos de producción (lista con concepto), préstamos de la reserva a
--     devolver. Se calcula la ganancia y se reparte con el reparto de cierre de la obra. Al cerrarlo se guarda el pago
--     de cada persona con su desglose, los préstamos se devuelven a la reserva y el sobrante del redondeo va a ella.
--   * Reserva: lo que entra cada mes (hon_meses.reserva_mes), préstamos a las obras, devoluciones y ajustes.
--   * Folio del recibo (H-AAAA-0001) al marcar pagado, en los meses y en los cierres.
-- Precede: 0151. No borra datos.

begin;

-- ──────── Folios de recibo ────────
create table if not exists hon_folios (anio int primary key, ultimo int not null default 0);
alter table hon_folios enable row level security;
revoke all on hon_folios from anon, authenticated;
create or replace function hon_folio_next() returns text
language plpgsql security definer set search_path = public as $$
declare a int := extract(year from (now() at time zone 'America/Mexico_City'))::int; n int;
begin
  insert into hon_folios (anio, ultimo) values (a, 1) on conflict (anio) do update set ultimo = hon_folios.ultimo + 1 returning ultimo into n;
  return 'H-' || a || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function hon_folio_next() from public, anon, authenticated;

alter table hon_mes_personas add column if not exists folio text unique;

-- ──────── Cierres de temporada ────────
create table if not exists hon_cierres (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references hon_obras(production_id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  boletos numeric(12,2),                              -- null = el que da la página (órdenes aprobadas)
  prestamos numeric(12,2) not null default 0 check (prestamos >= 0),
  ganancia numeric(12,2),
  total_pagado numeric(12,2),
  resultado jsonb,
  cerrado_por uuid references auth.users(id) on delete set null,
  cerrado_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists hon_cierre_partidas (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references hon_cierres(id) on delete cascade,
  tipo text not null check (tipo in ('patrocinio', 'costo')),
  concepto text not null check (length(btrim(concepto)) between 1 and 120),
  monto numeric(12,2) not null check (monto >= 0),
  created_at timestamptz not null default now()
);
create table if not exists hon_cierre_personas (
  cierre_id uuid not null references hon_cierres(id) on delete restrict,
  person_id uuid not null references people(id) on delete restrict,
  nombre text not null,
  pago numeric(12,2) not null,
  bruto numeric(12,2) not null,
  partes jsonb not null,
  pagado_at timestamptz, pagado_por uuid references auth.users(id) on delete set null,
  comprobante_path text, recibido_at timestamptz, folio text unique,
  primary key (cierre_id, person_id)
);

-- ──────── Reserva ────────
create table if not exists hon_reserva_movs (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default hoy_mx(),
  tipo text not null check (tipo in ('prestamo', 'devolucion', 'ajuste')),
  production_id text references productions(id) on delete set null,
  monto numeric(12,2) not null,
  concepto text check (concepto is null or length(concepto) <= 200),
  cierre_id uuid references hon_cierres(id) on delete set null,
  check (tipo = 'ajuste' or monto > 0),
  check (tipo = 'ajuste' or production_id is not null),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table hon_cierres enable row level security;
alter table hon_cierre_partidas enable row level security;
alter table hon_cierre_personas enable row level security;
alter table hon_reserva_movs enable row level security;
drop policy if exists hon_cierres_cabezas on hon_cierres;
create policy hon_cierres_cabezas on hon_cierres for all to authenticated using (hon_cabeza()) with check (hon_cabeza() and estado = 'borrador');
drop policy if exists hon_cierre_partidas_cabezas on hon_cierre_partidas;
create policy hon_cierre_partidas_cabezas on hon_cierre_partidas for all to authenticated
  using (hon_cabeza()) with check (hon_cabeza() and exists (select 1 from hon_cierres c where c.id = cierre_id and c.estado = 'borrador'));
drop policy if exists hon_cierre_personas_cabezas on hon_cierre_personas;
create policy hon_cierre_personas_cabezas on hon_cierre_personas for select to authenticated using (hon_cabeza());
drop policy if exists hon_cierre_personas_propio on hon_cierre_personas;
create policy hon_cierre_personas_propio on hon_cierre_personas for select to authenticated using (hon_es_mi_persona(person_id));
drop policy if exists hon_reserva_cabezas on hon_reserva_movs;
create policy hon_reserva_cabezas on hon_reserva_movs for select to authenticated using (hon_cabeza());
drop policy if exists hon_reserva_escribe on hon_reserva_movs;
create policy hon_reserva_escribe on hon_reserva_movs for insert to authenticated with check (hon_cabeza() and cierre_id is null);
revoke all on hon_cierres, hon_cierre_partidas, hon_cierre_personas, hon_reserva_movs from anon;

-- Ingresos por boletos de una obra: lo cobrado en órdenes aprobadas de sus funciones.
create or replace function hon_boletos_obra(pid text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when hon_cabeza() then coalesce((select sum(o.total) from orders o join performances pf on pf.id = o.performance_id
                                                 where pf.production_id = pid and o.status = 'aprobado'), 0) end
$$;
revoke all on function hon_boletos_obra(text) from public, anon;
grant execute on function hon_boletos_obra(text) to authenticated;

-- Cerrar la temporada: guarda el resultado y el pago de cada persona; devuelve los préstamos a la reserva y le suma el
-- sobrante del redondeo. p_personas: [{person_id, nombre, pago, bruto, partes}].
create or replace function hon_cierre_cerrar(p_cierre uuid, p_ganancia numeric, p_total numeric, p_sobrante numeric, p_resultado jsonb, p_personas jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c hon_cierres; x jsonb;
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF pueden cerrar la temporada.'; end if;
  select * into c from hon_cierres where id = p_cierre for update;
  if not found then raise exception 'No se encontró el cierre.'; end if;
  if c.estado = 'cerrado' then raise exception 'Esta temporada ya se cerró.'; end if;
  update hon_cierres set estado = 'cerrado', ganancia = p_ganancia, total_pagado = p_total, resultado = p_resultado,
         cerrado_por = auth.uid(), cerrado_at = now() where id = p_cierre;
  for x in select * from jsonb_array_elements(coalesce(p_personas, '[]')) loop
    insert into hon_cierre_personas (cierre_id, person_id, nombre, pago, bruto, partes)
    values (p_cierre, (x->>'person_id')::uuid, x->>'nombre', (x->>'pago')::numeric, (x->>'bruto')::numeric, coalesce(x->'partes', '[]'));
  end loop;
  if c.prestamos > 0 then
    insert into hon_reserva_movs (tipo, production_id, monto, concepto, cierre_id)
    values ('devolucion', c.production_id, c.prestamos, 'Devuelto al cierre: ' || c.nombre, p_cierre);
  end if;
  if coalesce(p_sobrante, 0) > 0 then
    insert into hon_reserva_movs (tipo, production_id, monto, concepto, cierre_id)
    values ('ajuste', c.production_id, p_sobrante, 'Sobrante del redondeo del cierre: ' || c.nombre, p_cierre);
  end if;
end $$;
revoke all on function hon_cierre_cerrar(uuid, numeric, numeric, numeric, jsonb, jsonb) from public, anon;
grant execute on function hon_cierre_cerrar(uuid, numeric, numeric, numeric, jsonb, jsonb) to authenticated;

-- ──────── Marcar pagado (meses y cierres) con folio ────────
create or replace function hon_marcar_pagado(p_periodo date, p_person uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF.'; end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  p_path := nullif(btrim(coalesce(p_path, '')), '');
  if p_path is not null and p_path not like to_char(p_periodo, 'YYYY-MM') || '/' || p_person || '/%' then
    raise exception 'Comprobante no válido.';
  end if;
  update hon_mes_personas set pagado_at = coalesce(pagado_at, now()), pagado_por = coalesce(pagado_por, auth.uid()),
         comprobante_path = coalesce(p_path, comprobante_path), folio = coalesce(folio, hon_folio_next())
   where periodo = p_periodo and person_id = p_person;
  if not found then raise exception 'Esa persona no tiene pago en ese mes (¿ya se cerró el mes?).'; end if;
end $$;

create or replace function hon_cierre_marcar_pagado(p_cierre uuid, p_person uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF.'; end if;
  p_path := nullif(btrim(coalesce(p_path, '')), '');
  if p_path is not null and p_path not like 'cierre-' || p_cierre || '/' || p_person || '/%' then
    raise exception 'Comprobante no válido.';
  end if;
  update hon_cierre_personas set pagado_at = coalesce(pagado_at, now()), pagado_por = coalesce(pagado_por, auth.uid()),
         comprobante_path = coalesce(p_path, comprobante_path), folio = coalesce(folio, hon_folio_next())
   where cierre_id = p_cierre and person_id = p_person;
  if not found then raise exception 'Esa persona no tiene pago en ese cierre.'; end if;
end $$;
revoke all on function hon_cierre_marcar_pagado(uuid, uuid, text) from public, anon;
grant execute on function hon_cierre_marcar_pagado(uuid, uuid, text) to authenticated;

create or replace function hon_cierre_me_llego(p_cierre uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update hon_cierre_personas set recibido_at = now()
   where cierre_id = p_cierre and hon_es_mi_persona(person_id) and pagado_at is not null and recibido_at is null;
  if not found then raise exception 'No hay un pago marcado para confirmar.'; end if;
end $$;
revoke all on function hon_cierre_me_llego(uuid) from public, anon;
grant execute on function hon_cierre_me_llego(uuid) to authenticated;

-- Folio a los pagos de mes que ya estaban marcados.
update hon_mes_personas set folio = hon_folio_next() where pagado_at is not null and folio is null;

commit;
