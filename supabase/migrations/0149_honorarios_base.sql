-- 0149 · Honorarios, parte 1: configuración, obras, bolsas y asignaciones; fecha real de pago y recargo
-- (especificación de Diego y Patricio, 2026-11-18; decisiones de Diego 2026-11-19).
--   * Solo las 4 cabezas de DARF (casa_cargos.directivo, más el Director) ven y editan honorarios.
--   * Configuración con vigencia: cada cambio es una versión nueva desde una fecha (el historial no se borra).
--   * Obras del módulo: con mensualidad (reparto mensual + cierre) o solo de temporada (Showman). La mensualidad
--     de cada obra sale de production_fees (ya existe); la inscripción nunca entra al reparto.
--   * Asignaciones: persona (ficha) + bolsa (creativa de una obra o la compartida) + % + desde/hasta. Cambiar un %
--     cierra la asignación anterior y abre otra: los meses ya pagados no cambian.
--   * Pagos de mensualidad: fecha_pago (la que pone quien cobra; por defecto hoy) y recargo. En las obras con
--     mensualidad del módulo, un pago que llega después del 2.º sábado del mes que paga lleva el recargo de la
--     configuración (200). Lo pueden perdonar las cabezas y quien tenga casa.recargos (Valentina). Va a la reserva.
-- Precede: 0148. No borra datos.

begin;

-- ──────── Quién: las cabezas ────────
create or replace function hon_cabeza() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from casa_cargos c where c.user_id = auth.uid() and c.directivo
                and exists (select 1 from casa_members m where m.user_id = c.user_id)))
$$;
revoke execute on function hon_cabeza() from public;
grant execute on function hon_cabeza() to anon, authenticated;

insert into permissions (id, grupo, descripcion, orden)
values ('casa.recargos', 'Casa DARF', 'Perdonar recargos por pago tardío de mensualidades', 111)
on conflict (id) do nothing;

create or replace function hon_perdona_recargos() returns boolean
language sql stable security definer set search_path = public as $$
  select hon_cabeza() or has_casa('casa.recargos')
$$;
grant execute on function hon_perdona_recargos() to authenticated;

-- 2.º sábado del mes de una fecha (el corte del ciclo).
create or replace function segundo_sabado(d date) returns date
language sql immutable as $$
  select (date_trunc('month', d)::date + ((6 - extract(dow from date_trunc('month', d))::int + 7) % 7) + 7)
$$;

-- ──────── Configuración (versiones) ────────
create table if not exists hon_config (
  id uuid primary key default gen_random_uuid(),
  vigente_desde date not null unique,
  reserva_pct numeric(5,2) not null default 10 check (reserva_pct between 0 and 100),
  reserva_meta numeric(12,2) not null default 19000 check (reserva_meta >= 0),
  emergencia_pct numeric(5,2) not null default 5 check (emergencia_pct between 0 and 100),
  renta numeric(12,2) not null default 8000 check (renta >= 0),
  gastos numeric(12,2) not null default 1500 check (gastos >= 0),
  creativo_pct numeric(5,2) not null default 60 check (creativo_pct between 0 and 100),
  recargo numeric(10,2) not null default 200 check (recargo >= 0),
  redondeo int not null default 10 check (redondeo in (1, 5, 10, 50, 100)),
  umbral_alumnos int not null default 10 check (umbral_alumnos >= 0),
  fondo_pct numeric(5,2) not null default 30 check (fondo_pct between 0 and 100),
  cierre_empresa_pct numeric(5,2) not null default 40,
  cierre_creativos_pct numeric(5,2) not null default 25,
  cierre_compartida_pct numeric(5,2) not null default 20,
  cierre_casa_pct numeric(5,2) not null default 15,
  casa_cabezas_pct numeric(5,2) not null default 60 check (casa_cabezas_pct between 0 and 100),
  check (cierre_empresa_pct + cierre_creativos_pct + cierre_compartida_pct + cierre_casa_pct = 100),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- La configuración vigente en una fecha.
create or replace function hon_config_en(d date) returns hon_config
language sql stable security definer set search_path = public as $$
  select * from hon_config where vigente_desde <= d order by vigente_desde desc limit 1
$$;

-- ──────── Obras del módulo ────────
create table if not exists hon_obras (
  production_id text primary key references productions(id) on delete cascade,
  mensual boolean not null default true,       -- con mensualidad (Grease, Encanto) o solo temporada (Showman)
  activa boolean not null default true,
  -- Reparto del cierre propio de la obra (si es null, el de la configuración). Showman: 40 / 45 / 0 / 15.
  cierre_empresa_pct numeric(5,2), cierre_creativos_pct numeric(5,2), cierre_compartida_pct numeric(5,2), cierre_casa_pct numeric(5,2),
  check ((cierre_empresa_pct is null) = (cierre_creativos_pct is null) and (cierre_creativos_pct is null) = (cierre_compartida_pct is null)
         and (cierre_compartida_pct is null) = (cierre_casa_pct is null)),
  check (cierre_empresa_pct is null or cierre_empresa_pct + cierre_creativos_pct + cierre_compartida_pct + cierre_casa_pct = 100),
  orden int not null default 100,
  updated_at timestamptz not null default now()
);

-- ──────── Asignaciones (persona + bolsa + %) con historial ────────
create table if not exists hon_asignaciones (
  id uuid primary key default gen_random_uuid(),
  bolsa text not null check (bolsa = 'compartida' or bolsa like 'creativa:%'),
  person_id uuid not null references people(id) on delete restrict,
  puesto text check (puesto is null or length(btrim(puesto)) between 1 and 80),
  pct numeric(7,4) not null check (pct > 0 and pct <= 100),
  desde date not null,
  hasta date,                                  -- exclusiva; null = vigente
  check (hasta is null or hasta > desde),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hon_asig_bolsa on hon_asignaciones (bolsa, desde);
create unique index if not exists hon_asig_una_vigente on hon_asignaciones (bolsa, person_id) where hasta is null;

-- Guardar (o cambiar) el % de una persona en una bolsa desde una fecha. pct null = quitarla desde esa fecha.
create or replace function hon_asignacion_guardar(p_bolsa text, p_person uuid, p_puesto text, p_pct numeric, p_desde date) returns void
language plpgsql security definer set search_path = public as $$
declare v hon_asignaciones;
begin
  if not hon_cabeza() then raise exception 'Solo las cabezas de DARF pueden cambiar los honorarios.'; end if;
  if p_desde is null then raise exception 'Elige desde qué fecha aplica.'; end if;
  if p_pct is not null and (p_pct <= 0 or p_pct > 100) then raise exception 'El porcentaje debe estar entre 0 y 100.'; end if;
  if p_bolsa like 'creativa:%' and not exists (select 1 from hon_obras where production_id = substr(p_bolsa, 10)) then
    raise exception 'Esa obra no está en honorarios.';
  end if;
  select * into v from hon_asignaciones where bolsa = p_bolsa and person_id = p_person and hasta is null for update;
  if found then
    if p_desde < v.desde then raise exception 'La fecha no puede ser anterior a la del porcentaje vigente (%).', to_char(v.desde, 'DD/MM/YYYY'); end if;
    if p_desde = v.desde then
      -- Corrección el mismo día: se reemplaza.
      if p_pct is null then delete from hon_asignaciones where id = v.id; return; end if;
      update hon_asignaciones set pct = p_pct, puesto = nullif(btrim(p_puesto), '') where id = v.id;
      return;
    end if;
    update hon_asignaciones set hasta = p_desde where id = v.id;
  end if;
  if p_pct is not null then
    insert into hon_asignaciones (bolsa, person_id, puesto, pct, desde) values (p_bolsa, p_person, nullif(btrim(p_puesto), ''), p_pct, p_desde);
  end if;
end $$;
revoke all on function hon_asignacion_guardar(text, uuid, text, numeric, date) from public, anon;
grant execute on function hon_asignacion_guardar(text, uuid, text, numeric, date) to authenticated;

-- ──────── Lectura y escritura ────────
alter table hon_config enable row level security;
alter table hon_obras enable row level security;
alter table hon_asignaciones enable row level security;
drop policy if exists hon_config_cabezas on hon_config;
create policy hon_config_cabezas on hon_config for all to authenticated using (hon_cabeza()) with check (hon_cabeza());
drop policy if exists hon_obras_cabezas on hon_obras;
create policy hon_obras_cabezas on hon_obras for all to authenticated using (hon_cabeza()) with check (hon_cabeza());
drop policy if exists hon_asig_cabezas on hon_asignaciones;
create policy hon_asig_cabezas on hon_asignaciones for select to authenticated using (hon_cabeza());
-- Cada quien ve sus propias asignaciones (para su desglose).
drop policy if exists hon_asig_propia on hon_asignaciones;
create policy hon_asig_propia on hon_asignaciones for select to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.profile_id = auth.uid()));
revoke all on hon_config, hon_obras, hon_asignaciones from anon;

-- ──────── Pagos: fecha real y recargo ────────
alter table member_payments
  add column if not exists fecha_pago date,
  add column if not exists recargo numeric(10,2) not null default 0 check (recargo >= 0),
  add column if not exists recargo_perdonado_por uuid references auth.users(id) on delete set null,
  add column if not exists recargo_perdonado_at timestamptz;
update member_payments set fecha_pago = (registrado_at at time zone 'America/Mexico_City')::date where fecha_pago is null;
alter table member_payments alter column fecha_pago set default hoy_mx();
alter table member_payments alter column fecha_pago set not null;

alter table member_payments_ficha
  add column if not exists fecha_pago date,
  add column if not exists recargo numeric(10,2) not null default 0 check (recargo >= 0),
  add column if not exists recargo_perdonado_por uuid references auth.users(id) on delete set null,
  add column if not exists recargo_perdonado_at timestamptz;
update member_payments_ficha set fecha_pago = (pagado_at at time zone 'America/Mexico_City')::date where fecha_pago is null;
alter table member_payments_ficha alter column fecha_pago set default hoy_mx();
alter table member_payments_ficha alter column fecha_pago set not null;

-- Al pasar los pagos de una ficha a su cuenta (0111) se conservan la fecha real y el recargo.
create or replace function pagos_ficha_pasar(p_person uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid; n int;
begin
  select profile_id into uid from people where id = p_person;
  if uid is null then return 0; end if;
  insert into member_enrollment (production_id, user_id, ingreso, baja_at)
  select c.production_id, uid, coalesce(c.ingreso, hoy_mx()), c.baja_at from ficha_cuotas c where c.person_id = p_person
  on conflict (production_id, user_id) do update
    set ingreso = least(member_enrollment.ingreso, excluded.ingreso),
        baja_at = coalesce(member_enrollment.baja_at, excluded.baja_at);
  insert into member_fee_terms (production_id, user_id, beca, sin_inscripcion)
  select c.production_id, uid, c.beca, c.sin_inscripcion from ficha_cuotas c
   where c.person_id = p_person and (c.beca or c.sin_inscripcion)
  on conflict (production_id, user_id) do update
    set beca = member_fee_terms.beca or excluded.beca,
        sin_inscripcion = member_fee_terms.sin_inscripcion or excluded.sin_inscripcion;
  perform set_config('darf.sin_aviso_pago', 'si', true);
  insert into member_payments (production_id, user_id, periodo, monto, metodo, nota, registrado_at, concepto, fecha_pago, recargo, recargo_perdonado_por, recargo_perdonado_at)
  select f.production_id, uid, f.periodo, f.monto, f.metodo, f.nota, f.pagado_at, f.concepto, f.fecha_pago, f.recargo, f.recargo_perdonado_por, f.recargo_perdonado_at
    from member_payments_ficha f
   where f.person_id = p_person
     and not exists (select 1 from member_payments p where p.production_id = f.production_id and p.user_id = uid
                      and p.concepto = f.concepto and p.periodo = f.periodo and p.anulado_at is null)
   order by f.pagado_at;
  get diagnostics n = row_count;
  perform set_config('darf.sin_aviso_pago', '', true);
  delete from member_payments_ficha where person_id = p_person;
  delete from ficha_cuotas where person_id = p_person;
  return n;
end $$;
revoke all on function pagos_ficha_pasar(uuid) from public, anon, authenticated;

-- No se puede registrar un pago con fecha futura.
create or replace function hon_pago_fecha() returns trigger
language plpgsql security definer set search_path = public as $$
declare c hon_config;
begin
  if new.fecha_pago is null then new.fecha_pago := hoy_mx(); end if;
  if new.fecha_pago > hoy_mx() then raise exception 'La fecha de pago no puede ser futura.'; end if;
  -- Recargo: mensualidad de una obra con mensualidad del módulo, pagada después del 2.º sábado del mes que paga.
  -- (Al pasar pagos de una ficha a su cuenta, el recargo ya viene decidido.)
  if coalesce(current_setting('darf.sin_aviso_pago', true), '') <> 'si' and new.concepto = 'mensualidad'
     and exists (select 1 from hon_obras o where o.production_id = new.production_id and o.mensual and o.activa) then
    c := hon_config_en(new.fecha_pago);
    new.recargo := case when new.fecha_pago > segundo_sabado(new.periodo) and c.id is not null then c.recargo else 0 end;
  end if;
  return new;
end $$;
drop trigger if exists hon_pago_fecha on member_payments;
create trigger hon_pago_fecha before insert or update of fecha_pago on member_payments for each row execute function hon_pago_fecha();
drop trigger if exists hon_pago_fecha on member_payments_ficha;
create trigger hon_pago_fecha before insert or update of fecha_pago on member_payments_ficha for each row execute function hon_pago_fecha();

-- Perdonar (o volver a cobrar) el recargo de un pago. p_tabla: 'cuenta' o 'ficha'.
create or replace function hon_recargo_perdonar(p_tabla text, p_id uuid, p_perdonar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hon_perdona_recargos() then raise exception 'No tienes permiso para perdonar recargos.'; end if;
  if p_tabla = 'cuenta' then
    update member_payments set recargo_perdonado_por = case when p_perdonar then auth.uid() end,
           recargo_perdonado_at = case when p_perdonar then now() end
     where id = p_id and recargo > 0;
  elsif p_tabla = 'ficha' then
    update member_payments_ficha set recargo_perdonado_por = case when p_perdonar then auth.uid() end,
           recargo_perdonado_at = case when p_perdonar then now() end
     where id = p_id and recargo > 0;
  else
    raise exception 'Tabla no válida.';
  end if;
  if not found then raise exception 'Ese pago no tiene recargo.'; end if;
end $$;
revoke all on function hon_recargo_perdonar(text, uuid, boolean) from public, anon;
grant execute on function hon_recargo_perdonar(text, uuid, boolean) to authenticated;

-- Casa DARF para el reparto del cierre: cabezas (60 %) y el resto (40 %), con su ficha de persona.
create or replace function hon_casa_integrantes() returns table (user_id uuid, person_id uuid, nombre text, cabeza boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, pe.id, coalesce(pe.nombre, display_name(m.user_id)), coalesce(bool_or(c.directivo), false)
    from casa_members m
    left join casa_cargos c on c.user_id = m.user_id
    left join people pe on pe.profile_id = m.user_id
   where hon_cabeza()
   group by m.user_id, pe.id, pe.nombre
$$;
revoke all on function hon_casa_integrantes() from public, anon;
grant execute on function hon_casa_integrantes() to authenticated;

-- Registrar el pago de una ficha (sin cuenta) con la fecha en que pagó (la versión de 0112 sigue sirviendo, con hoy).
create or replace function pago_ficha_registrar(pid text, p_person uuid, p_concepto text, p_periodo date, p_monto numeric, p_metodo text, p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(pid, 'mensualidades.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from production_credits where production_id = pid and person_id = p_person) then
    raise exception 'Esa persona no es de esta obra.';
  end if;
  insert into member_payments_ficha (production_id, person_id, concepto, periodo, monto, metodo, nota, fecha_pago)
  values (pid, p_person, p_concepto, date_trunc('month', p_periodo)::date, p_monto, coalesce(p_metodo, 'otro'), 'Registrado en Cuotas', coalesce(p_fecha, hoy_mx()))
  on conflict (production_id, person_id, concepto, periodo) do nothing;
end $$;
revoke all on function pago_ficha_registrar(text, uuid, text, date, numeric, text, date) from public, anon;
grant execute on function pago_ficha_registrar(text, uuid, text, date, numeric, text, date) to authenticated;

commit;
