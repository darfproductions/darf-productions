-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0151: Honorarios por obra. Cada obra con sus reglas (reserva, emergencia, % creativo y compartido, gastos propios,
-- fondo común, reparto del cierre), bolsas compartidas entre las obras que elijas y gastos compartidos (renta del
-- salón, gastos varios) entre las obras que elijas. Pasa lo que ya está configurado sin perder nada.
-- Correr DESPUÉS de apply_0150_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.hon_meses') is null then
    raise exception 'ABORTADO: primero corre apply_0150_dev.sql.';
  end if;
end $$;
-- 0151 · Honorarios por obra (Diego 2026-11-19): cada obra con sus propias reglas y cómo se relacionan entre sí,
-- todo configurable desde Panel, Honorarios (lo configura Pato).
--   * Reglas por obra (con vigencia): reserva %, tope de emergencia %, % creativo, % compartido (el resto queda en la
--     empresa), gastos propios al mes, si entra al fondo creativo común y el reparto de su cierre de temporada.
--   * Bolsas compartidas: cada una con las obras que aportan a ella (con vigencia). Hoy, una: "Compartida".
--   * Gastos compartidos (renta del salón, gastos varios…): monto al mes y entre qué obras se divide (con vigencia).
--   * Lo global queda en hon_config: recargo, redondeo, umbral y % del fondo común, Casa DARF cabezas/resto y la meta
--     de la reserva (sus columnas por obra de 0149 ya no se usan: pasan a cada obra).
--   * Se pasa lo que ya había: cada obra recibe las reglas de la configuración vigente (Showman, su reparto propio);
--     la bolsa "compartida" pasa a ser la compartida "Compartida" de las obras con mensualidad; la renta y los gastos
--     varios, gastos compartidos entre ellas. Los porcentajes de las personas no cambian.
-- Precede: 0150. No borra datos.


-- ──────── Reglas de cada obra ────────
create table if not exists hon_obra_reglas (
  production_id text not null references hon_obras(production_id) on delete cascade,
  vigente_desde date not null,
  reserva_pct numeric(5,2) not null default 10 check (reserva_pct between 0 and 100),
  emergencia_pct numeric(5,2) not null default 5 check (emergencia_pct between 0 and 100),
  creativo_pct numeric(5,2) not null default 60 check (creativo_pct between 0 and 100),
  compartida_pct numeric(5,2) not null default 40 check (compartida_pct between 0 and 100),
  gastos_propios numeric(12,2) not null default 0 check (gastos_propios >= 0),
  en_fondo boolean not null default true,
  cierre_empresa_pct numeric(5,2) not null default 40,
  cierre_creativos_pct numeric(5,2) not null default 25,
  cierre_compartida_pct numeric(5,2) not null default 20,
  cierre_casa_pct numeric(5,2) not null default 15,
  check (creativo_pct + compartida_pct <= 100),
  check (cierre_empresa_pct + cierre_creativos_pct + cierre_compartida_pct + cierre_casa_pct = 100),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (production_id, vigente_desde)
);

-- ──────── Bolsas compartidas ────────
create table if not exists hon_compartidas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists hon_compartida_obras (
  compartida_id uuid not null references hon_compartidas(id) on delete cascade,
  vigente_desde date not null,
  obras text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (compartida_id, vigente_desde)
);

-- ──────── Gastos compartidos ────────
create table if not exists hon_gastos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists hon_gasto_versiones (
  gasto_id uuid not null references hon_gastos(id) on delete cascade,
  vigente_desde date not null,
  monto numeric(12,2) not null check (monto >= 0),
  obras text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (gasto_id, vigente_desde)
);

alter table hon_obra_reglas enable row level security;
alter table hon_compartidas enable row level security;
alter table hon_compartida_obras enable row level security;
alter table hon_gastos enable row level security;
alter table hon_gasto_versiones enable row level security;
do $$ declare t text; begin
  foreach t in array array['hon_obra_reglas', 'hon_compartidas', 'hon_compartida_obras', 'hon_gastos', 'hon_gasto_versiones'] loop
    execute format('drop policy if exists %I on %I', t || '_cabezas', t);
    execute format('create policy %I on %I for all to authenticated using (hon_cabeza()) with check (hon_cabeza())', t || '_cabezas', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ──────── Bolsas: creativa:<obra> o compartida:<id> ────────
alter table hon_asignaciones drop constraint if exists hon_asignaciones_bolsa_check;
alter table hon_asignaciones add constraint hon_asignaciones_bolsa_check
  check (bolsa = 'compartida' or bolsa like 'creativa:%' or bolsa like 'compartida:%');

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
  if p_bolsa like 'compartida:%' and not exists (select 1 from hon_compartidas where id::text = substr(p_bolsa, 12)) then
    raise exception 'Esa bolsa compartida no existe.';
  end if;
  if p_bolsa not like 'creativa:%' and p_bolsa not like 'compartida:%' then raise exception 'Bolsa no válida.'; end if;
  select * into v from hon_asignaciones where bolsa = p_bolsa and person_id = p_person and hasta is null for update;
  if found then
    if p_desde < v.desde then raise exception 'La fecha no puede ser anterior a la del porcentaje vigente (%).', to_char(v.desde, 'DD/MM/YYYY'); end if;
    if p_desde = v.desde then
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

-- ──────── Pasar lo que ya había ────────
do $$
declare c hon_config; comp uuid; g uuid; mensuales text[]; o hon_obras;
begin
  select * into c from hon_config order by vigente_desde desc limit 1;
  if c.id is null then return; end if;                       -- módulo sin configurar: nada que pasar
  select coalesce(array_agg(production_id order by orden), '{}') into mensuales from hon_obras where mensual;

  -- Reglas de cada obra (si aún no tiene).
  for o in select * from hon_obras loop
    if not exists (select 1 from hon_obra_reglas where production_id = o.production_id) then
      insert into hon_obra_reglas (production_id, vigente_desde, reserva_pct, emergencia_pct, creativo_pct, compartida_pct, en_fondo,
                                   cierre_empresa_pct, cierre_creativos_pct, cierre_compartida_pct, cierre_casa_pct)
      values (o.production_id, (select min(vigente_desde) from hon_config), c.reserva_pct, c.emergencia_pct, c.creativo_pct, 100 - c.creativo_pct, o.mensual,
              coalesce(o.cierre_empresa_pct, c.cierre_empresa_pct), coalesce(o.cierre_creativos_pct, c.cierre_creativos_pct),
              coalesce(o.cierre_compartida_pct, c.cierre_compartida_pct), coalesce(o.cierre_casa_pct, c.cierre_casa_pct));
    end if;
  end loop;

  -- La compartida de siempre, entre las obras con mensualidad (más las que ya repartían compartida al cierre).
  if not exists (select 1 from hon_compartidas) then
    insert into hon_compartidas (nombre) values ('Compartida') returning id into comp;
    insert into hon_compartida_obras (compartida_id, vigente_desde, obras)
    values (comp, (select min(vigente_desde) from hon_config), mensuales);
    update hon_asignaciones set bolsa = 'compartida:' || comp where bolsa = 'compartida';
  end if;

  -- Renta del salón y gastos varios: gastos compartidos entre las obras con mensualidad.
  if not exists (select 1 from hon_gastos) then
    if c.renta > 0 then
      insert into hon_gastos (nombre) values ('Renta del salón') returning id into g;
      insert into hon_gasto_versiones (gasto_id, vigente_desde, monto, obras) values (g, (select min(vigente_desde) from hon_config), c.renta, mensuales);
    end if;
    if c.gastos > 0 then
      insert into hon_gastos (nombre) values ('Gastos varios') returning id into g;
      insert into hon_gasto_versiones (gasto_id, vigente_desde, monto, obras) values (g, (select min(vigente_desde) from hon_config), c.gastos, mensuales);
    end if;
  end if;
end $$;

-- ════════ Pagar al equipo con comprobante (Diego 2026-11-19) ════════
-- Pato marca a cada persona como pagada subiendo la foto de la transferencia (se comprime mucho en el navegador: solo
-- tiene que existir). La persona ve su comprobante y confirma "Ya me llegó".
alter table hon_mes_personas
  add column if not exists pagado_at timestamptz,
  add column if not exists pagado_por uuid references auth.users(id) on delete set null,
  add column if not exists comprobante_path text,
  add column if not exists recibido_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('honorarios', 'honorarios', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: AAAA-MM/<persona>/<archivo>. Lo lee la cabeza o la persona dueña.
create or replace function hon_puede_ver_comprobante(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select hon_cabeza() or (split_part(path, '/', 2) ~ '^[0-9a-f-]{36}$' and hon_es_mi_persona(split_part(path, '/', 2)::uuid))
$$;
grant execute on function hon_puede_ver_comprobante(text) to authenticated;
drop policy if exists honorarios_read on storage.objects;
create policy honorarios_read on storage.objects for select to authenticated using (bucket_id = 'honorarios' and hon_puede_ver_comprobante(name));
drop policy if exists honorarios_upload on storage.objects;
create policy honorarios_upload on storage.objects for insert to authenticated with check (bucket_id = 'honorarios' and hon_cabeza());
drop policy if exists honorarios_remove on storage.objects;
create policy honorarios_remove on storage.objects for delete to authenticated using (bucket_id = 'honorarios' and hon_cabeza());

-- Marcar pagado a una persona de un mes cerrado. El comprobante es opcional (Diego): p_path null marca pagado sin foto
-- (o deja la que ya tenía); con p_path, sube o cambia la foto (y lo marca pagado si aún no lo estaba).
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
         comprobante_path = coalesce(p_path, comprobante_path)
   where periodo = p_periodo and person_id = p_person;
  if not found then raise exception 'Esa persona no tiene pago en ese mes (¿ya se cerró el mes?).'; end if;
end $$;
revoke all on function hon_marcar_pagado(date, uuid, text) from public, anon;
grant execute on function hon_marcar_pagado(date, uuid, text) to authenticated;

-- La persona confirma que le llegó el dinero.
create or replace function hon_ya_me_llego(p_periodo date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update hon_mes_personas set recibido_at = now()
   where periodo = date_trunc('month', p_periodo)::date and hon_es_mi_persona(person_id) and pagado_at is not null and recibido_at is null;
  if not found then raise exception 'No hay un pago marcado para confirmar.'; end if;
end $$;
revoke all on function hon_ya_me_llego(date) from public, anon;
grant execute on function hon_ya_me_llego(date) to authenticated;

select 'Listo 0151: Honorarios por obra y comprobantes de pago' as resultado;
select p.nombre as obra, r.reserva_pct, r.emergencia_pct, r.creativo_pct, r.compartida_pct, r.en_fondo,
       r.cierre_empresa_pct || '/' || r.cierre_creativos_pct || '/' || r.cierre_compartida_pct || '/' || r.cierre_casa_pct as cierre
  from hon_obra_reglas r join productions p on p.id = r.production_id order by p.nombre;
