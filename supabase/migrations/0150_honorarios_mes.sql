-- 0150 · Honorarios, parte 2: el mes (Diego 2026-11-19).
--   * Pagos del mes: las mensualidades (sin inscripciones) de las obras con mensualidad del módulo, por la fecha en que
--     se pagaron: del día siguiente al 2.º sábado del mes anterior al 2.º sábado del mes. Si el mes anterior ya se cerró,
--     también entran los pagos tardíos que se registraron después (no se pierden: cuentan en el siguiente mes abierto).
--   * Emergencia usada por obra (la captura Patricio; nunca más del tope) y aprobación del fondo creativo común: cada
--     cabeza aprueba desde su cuenta; se aplica solo si aprueban todas.
--   * Cerrar el mes (solo las cabezas, desde el 2.º sábado, en orden): guarda el resultado, el pago de cada persona con
--     su desglose y sella los pagos que contó. Un mes cerrado no se recalcula.
-- Precede: 0149. No borra datos.

begin;

alter table member_payments add column if not exists hon_mes date;
alter table member_payments_ficha add column if not exists hon_mes date;
create index if not exists idx_member_payments_hon_mes on member_payments (hon_mes);

create table if not exists hon_meses (
  periodo date primary key check (extract(day from periodo) = 1),
  fondo_aplicado boolean not null default false,
  total_pagado numeric(12,2) not null,
  reserva_mes numeric(12,2) not null,
  resultado jsonb not null,
  cerrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  cerrado_at timestamptz not null default now()
);

create table if not exists hon_mes_obra (
  periodo date not null check (extract(day from periodo) = 1),
  production_id text not null references productions(id) on delete cascade,
  emergencia_uso numeric(12,2) not null default 0 check (emergencia_uso >= 0),
  nota text check (nota is null or length(nota) <= 300),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (periodo, production_id)
);

create table if not exists hon_fondo_aprobaciones (
  periodo date not null check (extract(day from periodo) = 1),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aprobado_at timestamptz not null default now(),
  primary key (periodo, user_id)
);

create table if not exists hon_mes_personas (
  periodo date not null references hon_meses(periodo) on delete restrict,
  person_id uuid not null references people(id) on delete restrict,
  nombre text not null,
  pago numeric(12,2) not null,
  bruto numeric(12,2) not null,
  partes jsonb not null,
  fondo_aplicado boolean not null default false,  -- para que cada quien vea que ese mes se aplicó el fondo común
  primary key (periodo, person_id)
);

-- ──────── Lectura y escritura ────────
alter table hon_meses enable row level security;
alter table hon_mes_obra enable row level security;
alter table hon_fondo_aprobaciones enable row level security;
alter table hon_mes_personas enable row level security;
drop policy if exists hon_meses_cabezas on hon_meses;
create policy hon_meses_cabezas on hon_meses for select to authenticated using (hon_cabeza());
drop policy if exists hon_mes_obra_cabezas on hon_mes_obra;
create policy hon_mes_obra_cabezas on hon_mes_obra for all to authenticated
  using (hon_cabeza()) with check (hon_cabeza() and not exists (select 1 from hon_meses m where m.periodo = hon_mes_obra.periodo));
drop policy if exists hon_fondo_cabezas on hon_fondo_aprobaciones;
create policy hon_fondo_cabezas on hon_fondo_aprobaciones for select to authenticated using (hon_cabeza());
drop policy if exists hon_mes_personas_cabezas on hon_mes_personas;
create policy hon_mes_personas_cabezas on hon_mes_personas for select to authenticated using (hon_cabeza());
-- ¿Esta ficha es mía? (la regla de "people" no deja leer la ficha dentro de otra regla).
create or replace function hon_es_mi_persona(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from people p where p.id = pid and p.profile_id = auth.uid())
$$;
revoke all on function hon_es_mi_persona(uuid) from public, anon;
grant execute on function hon_es_mi_persona(uuid) to authenticated;
-- Cada quien ve su propio pago y desglose (y sus asignaciones; corrige la regla de 0149).
drop policy if exists hon_mes_personas_propio on hon_mes_personas;
create policy hon_mes_personas_propio on hon_mes_personas for select to authenticated using (hon_es_mi_persona(person_id));
drop policy if exists hon_asig_propia on hon_asignaciones;
create policy hon_asig_propia on hon_asignaciones for select to authenticated using (hon_es_mi_persona(person_id));
revoke all on hon_meses, hon_mes_obra, hon_fondo_aprobaciones, hon_mes_personas from anon;

-- ──────── Los pagos que cuentan para un mes ────────
create or replace function hon_pagos_mes(p_periodo date)
returns table (tabla text, id uuid, production_id text, alumno uuid, nombre text, periodo date, fecha_pago date, monto numeric, recargo numeric, perdonado boolean)
language plpgsql stable security definer set search_path = public as $$
declare corte date; corte_ant date; ant_cerrado boolean; cerrado boolean;
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF.'; end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  corte := segundo_sabado(p_periodo);
  corte_ant := segundo_sabado((p_periodo - interval '1 month')::date);
  ant_cerrado := exists (select 1 from hon_meses where hon_meses.periodo = (p_periodo - interval '1 month')::date);
  cerrado := exists (select 1 from hon_meses where hon_meses.periodo = p_periodo);
  return query
    select 'cuenta'::text, p.id, p.production_id, p.user_id, display_name(p.user_id), p.periodo, p.fecha_pago, p.monto, p.recargo, p.recargo_perdonado_at is not null
      from member_payments p join hon_obras o on o.production_id = p.production_id and o.mensual
     where p.concepto = 'mensualidad' and p.anulado_at is null
       and case when cerrado then p.hon_mes = p_periodo
                else p.hon_mes is null and o.activa and p.fecha_pago <= corte and (p.fecha_pago > corte_ant or ant_cerrado) end
    union all
    select 'ficha'::text, f.id, f.production_id, f.person_id, pe.nombre, f.periodo, f.fecha_pago, f.monto, f.recargo, f.recargo_perdonado_at is not null
      from member_payments_ficha f join hon_obras o on o.production_id = f.production_id and o.mensual
      join people pe on pe.id = f.person_id
     where f.concepto = 'mensualidad'
       and case when cerrado then f.hon_mes = p_periodo
                else f.hon_mes is null and o.activa and f.fecha_pago <= corte and (f.fecha_pago > corte_ant or ant_cerrado) end;
end $$;
revoke all on function hon_pagos_mes(date) from public, anon;
grant execute on function hon_pagos_mes(date) to authenticated;

-- ──────── Fondo creativo común: cada cabeza aprueba ────────
-- Cabezas que cuentan para la aprobación: las de Casa DARF marcadas como cabeza.
create or replace function hon_cabezas() returns table (user_id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select c.user_id, display_name(c.user_id) from casa_cargos c
   where c.directivo and exists (select 1 from casa_members m where m.user_id = c.user_id) and hon_cabeza()
$$;
revoke all on function hon_cabezas() from public, anon;
grant execute on function hon_cabezas() to authenticated;

create or replace function hon_fondo_aprobar(p_periodo date, p_aprobar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF.'; end if;
  if not exists (select 1 from casa_cargos c where c.user_id = auth.uid() and c.directivo) then
    raise exception 'Solo las cabezas de Casa DARF aprueban el fondo común.';
  end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  if exists (select 1 from hon_meses where periodo = p_periodo) then raise exception 'Ese mes ya se cerró.'; end if;
  if p_aprobar then
    insert into hon_fondo_aprobaciones (periodo, user_id) values (p_periodo, auth.uid()) on conflict do nothing;
  else
    delete from hon_fondo_aprobaciones where periodo = p_periodo and user_id = auth.uid();
  end if;
end $$;
revoke all on function hon_fondo_aprobar(date, boolean) from public, anon;
grant execute on function hon_fondo_aprobar(date, boolean) to authenticated;

-- ¿Aprobaron todas las cabezas?
create or replace function hon_fondo_aprobado(p_periodo date) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) > 0 and count(*) = count(a.user_id)
    from casa_cargos c
    left join hon_fondo_aprobaciones a on a.user_id = c.user_id and a.periodo = date_trunc('month', p_periodo)::date
   where c.directivo and exists (select 1 from casa_members m where m.user_id = c.user_id)
$$;
grant execute on function hon_fondo_aprobado(date) to authenticated;

-- ──────── Cerrar el mes ────────
-- p_resultado: el cálculo completo (para el historial); p_personas: [{person_id, nombre, pago, bruto, partes}].
create or replace function hon_cerrar_mes(p_periodo date, p_resultado jsonb, p_personas jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ultimo date; x jsonb;
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF pueden cerrar el mes.'; end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  if exists (select 1 from hon_meses where periodo = p_periodo) then raise exception 'Ese mes ya se cerró.'; end if;
  if hoy_mx() < segundo_sabado(p_periodo) then
    raise exception 'El mes se cierra a partir del 2.º sábado (%).', to_char(segundo_sabado(p_periodo), 'DD/MM/YYYY');
  end if;
  select max(periodo) into ultimo from hon_meses;
  if ultimo is not null and p_periodo <> (ultimo + interval '1 month')::date then
    raise exception 'Los meses se cierran en orden: el siguiente es %.', to_char((ultimo + interval '1 month')::date, 'MM/YYYY');
  end if;
  if coalesce(jsonb_array_length(p_resultado->'errores'), 0) > 0 then raise exception 'Hay errores en el cálculo: corrígelos antes de cerrar.'; end if;
  if (p_resultado->>'fondoAplicado')::boolean and not hon_fondo_aprobado(p_periodo) then
    raise exception 'El fondo común no está aprobado por todas las cabezas.';
  end if;

  -- Primero sellar los pagos que contó (con el mes todavía abierto); los que lleguen después cuentan en el siguiente.
  update member_payments p set hon_mes = p_periodo from hon_pagos_mes(p_periodo) h where h.tabla = 'cuenta' and h.id = p.id;
  update member_payments_ficha f set hon_mes = p_periodo from hon_pagos_mes(p_periodo) h where h.tabla = 'ficha' and h.id = f.id;
  insert into hon_meses (periodo, fondo_aplicado, total_pagado, reserva_mes, resultado)
  values (p_periodo, coalesce((p_resultado->>'fondoAplicado')::boolean, false), (p_resultado->>'totalPagado')::numeric,
          (p_resultado->>'reservaMes')::numeric, p_resultado);
  for x in select * from jsonb_array_elements(p_personas) loop
    insert into hon_mes_personas (periodo, person_id, nombre, pago, bruto, partes, fondo_aplicado)
    values (p_periodo, (x->>'person_id')::uuid, x->>'nombre', (x->>'pago')::numeric, (x->>'bruto')::numeric, coalesce(x->'partes', '[]'),
            coalesce((p_resultado->>'fondoAplicado')::boolean, false));
  end loop;
end $$;
revoke all on function hon_cerrar_mes(date, jsonb, jsonb) from public, anon;
grant execute on function hon_cerrar_mes(date, jsonb, jsonb) to authenticated;

-- Un pago que ya contó en un mes cerrado no cambia de fecha.
create or replace function hon_pago_sellado() returns trigger
language plpgsql as $$
begin
  if old.hon_mes is not null and new.fecha_pago is distinct from old.fecha_pago then
    raise exception 'Este pago ya contó en los honorarios de un mes cerrado: su fecha no se puede cambiar.';
  end if;
  return new;
end $$;
drop trigger if exists hon_pago_sellado on member_payments;
create trigger hon_pago_sellado before update of fecha_pago on member_payments for each row execute function hon_pago_sellado();
drop trigger if exists hon_pago_sellado on member_payments_ficha;
create trigger hon_pago_sellado before update of fecha_pago on member_payments_ficha for each row execute function hon_pago_sellado();

commit;
