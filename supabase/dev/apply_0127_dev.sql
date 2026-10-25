-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0127: logística de las funciones (puertas, duración, dirección, indicaciones) y llamados del elenco y la producción
-- (cada función genera sus llamados como ensayos, con gafete y asistencia). No cambia nada de lo que ya existe:
-- las obras sin logística siguen igual hasta que se configure.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.request_late(text, uuid, timestamptz, text)') is null then
    raise exception 'ABORTADO: primero corre el script de 0126.';
  end if;
end $$;
-- 0127 (Diego 2026-10-23): logística de las funciones.
--   * Por obra (con ajuste por función): a qué hora abren las puertas, cuánto dura (con intermedio), dirección y
--     liga de Google Maps, acceso tardío e indicaciones. Lo ve el público (página, boleto, diseño "Prepárate").
--   * Llamados del elenco y la producción: por obra se definen ("Elenco 2 h antes", "Producción 3 h antes") con a
--     quién citan (grupos del elenco y/o el equipo). Cada función genera sus llamados como ENSAYOS ligados a la
--     función, así se checan con gafete, cuentan retardos/faltas, aceptan llegada tarde y salen en el portal.
--     Se crean y mueven solos con la función; los que ya tienen asistencia o se movieron a mano no se tocan.
-- Precede: 0126.

begin;

-- ──────── Logística de la obra ────────
create table if not exists obra_logistica (
  production_id text primary key references productions(id) on delete cascade,
  puertas_min int not null default 30 check (puertas_min between 0 and 240),
  duracion_min int not null default 120 check (duracion_min between 10 and 600),
  intermedio_min int check (intermedio_min is null or intermedio_min between 5 and 60),
  direccion text check (direccion is null or char_length(direccion) <= 300),
  maps_url text check (maps_url is null or (maps_url ~ '^https://' and char_length(maps_url) <= 500)),
  acceso_tardio text check (acceso_tardio is null or char_length(acceso_tardio) <= 300),
  indicaciones text check (indicaciones is null or char_length(indicaciones) <= 1500),
  updated_at timestamptz not null default now()
);
alter table obra_logistica enable row level security;
drop policy if exists obra_logistica_read on obra_logistica;
create policy obra_logistica_read on obra_logistica for select using (true);
drop policy if exists obra_logistica_write on obra_logistica;
create policy obra_logistica_write on obra_logistica for all to authenticated
  using (has_perm(production_id, 'funciones.gestionar')) with check (has_perm(production_id, 'funciones.gestionar'));
revoke insert, update, delete on obra_logistica from anon;
drop trigger if exists audit_obra_logistica on obra_logistica;
create trigger audit_obra_logistica after insert or update or delete on obra_logistica for each row execute function audit_row();

-- Ajuste de una función (vacío = lo calcula con la obra).
alter table performances
  add column if not exists puertas_at timestamptz,
  add column if not exists termina_at timestamptz;
alter table performances drop constraint if exists performances_horario;
alter table performances add constraint performances_horario check (
  (puertas_at is null or puertas_at <= starts_at) and (termina_at is null or termina_at > starts_at));

-- Si la función se mueve, su horario propio se mueve con ella (y sin fecha no hay horario).
create or replace function performances_mover_horario() returns trigger
language plpgsql as $$
begin
  if new.starts_at is null then
    new.puertas_at := null; new.termina_at := null;
  elsif old.starts_at is not null and new.starts_at is distinct from old.starts_at then
    if new.puertas_at is not distinct from old.puertas_at and old.puertas_at is not null then new.puertas_at := old.puertas_at + (new.starts_at - old.starts_at); end if;
    if new.termina_at is not distinct from old.termina_at and old.termina_at is not null then new.termina_at := old.termina_at + (new.starts_at - old.starts_at); end if;
  end if;
  return new;
end $$;
drop trigger if exists performances_mover_horario on performances;
create trigger performances_mover_horario before update of starts_at on performances for each row execute function performances_mover_horario();

-- ──────── Llamados ────────
create table if not exists obra_llamados (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 60),
  minutos_antes int not null check (minutos_antes between 0 and 600),
  -- A quién del elenco: todos, por grupos o nadie (solo equipo).
  elenco text not null default 'todos' check (elenco in ('todos', 'grupos', 'nadie')),
  grupos text[] not null default '{}' check (grupos <@ array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico', 'staff']),
  equipo_todos boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  check (elenco <> 'grupos' or cardinality(grupos) > 0),
  check (elenco <> 'nadie' or equipo_todos)
);
create index if not exists obra_llamados_prod_idx on obra_llamados(production_id, orden);
alter table obra_llamados enable row level security;
drop policy if exists obra_llamados_read on obra_llamados;
create policy obra_llamados_read on obra_llamados for select to authenticated
  using (has_perm(production_id, 'ensayos.gestionar') or has_perm(production_id, 'funciones.gestionar') or has_perm(production_id, 'obra.ver'));
drop policy if exists obra_llamados_write on obra_llamados;
create policy obra_llamados_write on obra_llamados for all to authenticated
  using (has_perm(production_id, 'ensayos.gestionar') or has_perm(production_id, 'funciones.gestionar'))
  with check (has_perm(production_id, 'ensayos.gestionar') or has_perm(production_id, 'funciones.gestionar'));
revoke all on obra_llamados from anon;
drop trigger if exists audit_obra_llamados on obra_llamados;
create trigger audit_obra_llamados after insert or update or delete on obra_llamados for each row execute function audit_row();

alter table rehearsals
  add column if not exists performance_id uuid references performances(id) on delete cascade,
  add column if not exists llamado_id uuid references obra_llamados(id) on delete set null,
  add column if not exists llamado_fijo boolean not null default false;
create unique index if not exists rehearsals_llamado_unico on rehearsals(performance_id, llamado_id) where llamado_id is not null;
create index if not exists rehearsals_performance_idx on rehearsals(performance_id) where performance_id is not null;

-- Si alguien mueve a mano un llamado, ya no lo mueve la función.
create or replace function rehearsal_llamado_fijo() returns trigger
language plpgsql as $$
begin
  if new.llamado_id is not null and coalesce(current_setting('darf.sync_llamados', true), '') <> 'on'
     and (new.inicia is distinct from old.inicia or new.termina is distinct from old.termina) then
    new.llamado_fijo := true;
  end if;
  return new;
end $$;
drop trigger if exists rehearsal_llamado_fijo on rehearsals;
create trigger rehearsal_llamado_fijo before update on rehearsals for each row execute function rehearsal_llamado_fijo();

-- Hora de fin de una función: la propia o inicio + duración de la obra.
create or replace function funcion_termina(p performances) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(p.termina_at, p.starts_at + make_interval(mins => coalesce((select duracion_min from obra_logistica where production_id = p.production_id), 120)))
$$;

-- Crea, mueve o cancela los llamados de una función según los de la obra.
create or replace function sync_llamados(pf uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p performances; l obra_llamados; r rehearsals; ini timestamptz; fin timestamptz; tit text;
begin
  select * into p from performances where id = pf;
  if not found then return; end if;
  perform set_config('darf.sync_llamados', 'on', true);
  fin := funcion_termina(p);
  -- Función cancelada: se cancelan sus llamados que no han pasado.
  if p.cancelada_at is not null then
    update rehearsals set estado = 'cancelado' where performance_id = pf and llamado_id is not null and estado <> 'cancelado' and inicia > now();
    perform set_config('darf.sync_llamados', '', true);
    return;
  end if;
  for l in select * from obra_llamados where production_id = p.production_id order by orden, created_at loop
    ini := p.starts_at - make_interval(mins => l.minutos_antes);
    tit := left('Llamado ' || l.nombre || ' · función ' || to_char(p.starts_at at time zone 'America/Mexico_City', 'DD/MM HH24:MI'), 120);
    select * into r from rehearsals where performance_id = pf and llamado_id = l.id;
    if found then
      if r.inicia > now() and not r.llamado_fijo
         and not exists (select 1 from rehearsal_attendance a where a.rehearsal_id = r.id) then
        update rehearsals set titulo = tit, inicia = ini, termina = greatest(fin, ini + interval '1 minute'), lugar = p.venue,
               convocatoria = case l.elenco when 'nadie' then 'ninguno' else l.elenco end,
               grupos = case when l.elenco = 'grupos' then l.grupos else '{}' end,
               equipo_todos = l.equipo_todos, estado = 'programado'
         where id = r.id
           and (titulo, inicia, termina, lugar, convocatoria, grupos, equipo_todos, estado)
               is distinct from (tit, ini, greatest(fin, ini + interval '1 minute'), p.venue,
                                 case l.elenco when 'nadie' then 'ninguno' else l.elenco end,
                                 case when l.elenco = 'grupos' then l.grupos else '{}' end, l.equipo_todos, 'programado');
      end if;
    elsif p.starts_at > now() then
      insert into rehearsals (production_id, titulo, inicia, termina, lugar, convocatoria, grupos, equipo_todos, performance_id, llamado_id, created_by)
      values (p.production_id, tit, ini, greatest(fin, ini + interval '1 minute'), p.venue,
              case l.elenco when 'nadie' then 'ninguno' else l.elenco end,
              case when l.elenco = 'grupos' then l.grupos else '{}' end, l.equipo_todos, pf, l.id, null);
    end if;
  end loop;
  perform set_config('darf.sync_llamados', '', true);
end $$;
revoke execute on function sync_llamados(uuid) from public, anon, authenticated;

create or replace function performances_llamados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_llamados(new.id);
  return null;
end $$;
drop trigger if exists performances_llamados on performances;
create trigger performances_llamados after insert or update of starts_at, venue, cancelada_at, termina_at on performances
  for each row execute function performances_llamados();

-- Cambiar los llamados de la obra re-sincroniza sus funciones que no han pasado.
create or replace function obra_llamados_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pf uuid; pid text := coalesce(new.production_id, old.production_id);
begin
  if tg_op = 'DELETE' then
    -- Se borran sus llamados futuros sin asistencia; los demás quedan como ensayos sueltos.
    delete from rehearsals r where r.llamado_id = old.id and r.inicia > now()
      and not exists (select 1 from rehearsal_attendance a where a.rehearsal_id = r.id);
    return old;
  end if;
  for pf in select id from performances where production_id = pid and starts_at > now() loop
    perform sync_llamados(pf);
  end loop;
  return null;
end $$;
drop trigger if exists obra_llamados_sync on obra_llamados;
create trigger obra_llamados_sync after insert or update on obra_llamados for each row execute function obra_llamados_sync();
drop trigger if exists obra_llamados_borrar on obra_llamados;
create trigger obra_llamados_borrar before delete on obra_llamados for each row execute function obra_llamados_sync();

-- Cambiar la duración de la obra mueve la hora de fin de los llamados.
create or replace function obra_logistica_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pf uuid;
begin
  if tg_op = 'UPDATE' and new.duracion_min is not distinct from old.duracion_min then return null; end if;
  for pf in select id from performances where production_id = new.production_id and starts_at > now() loop
    perform sync_llamados(pf);
  end loop;
  return null;
end $$;
drop trigger if exists obra_logistica_sync on obra_logistica;
create trigger obra_logistica_sync after insert or update on obra_logistica for each row execute function obra_logistica_sync();

-- Los llamados nuevos no avisan uno por uno (serían muchos de golpe); sí avisan si se mueven o se cancelan.
create or replace function notify_rehearsal() returns trigger
language plpgsql security definer set search_path = public as $$
declare titulo text; detalle text; uids uuid[];
begin
  begin
    if tg_op = 'INSERT' then
      if new.inicia < now() or new.estado = 'cancelado' or new.llamado_id is not null then return new; end if;
      -- De una serie, solo avisa el primer ensayo (por fecha), aunque se creen todos juntos.
      if new.serie_id is not null and exists (select 1 from rehearsals x where x.serie_id = new.serie_id and (x.inicia, x.id) < (new.inicia, new.id)) then return new; end if;
      titulo := case when new.serie_id is not null then 'Nuevos ensayos en tu calendario' else 'Nuevo ensayo' end;
      detalle := concat_ws(' · ', new.titulo, cuando_mx(new.inicia) || case when new.serie_id is not null then ' (y los siguientes de la serie)' else '' end, new.lugar);
    elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
      if new.inicia < now() then return new; end if;
      titulo := case when new.llamado_id is not null then 'Se canceló un llamado' else 'Se canceló un ensayo' end;
      detalle := concat_ws(' · ', new.titulo, cuando_mx(new.inicia));
    elsif new.estado <> 'cancelado' and (new.inicia is distinct from old.inicia or new.lugar is distinct from old.lugar) then
      if new.inicia < now() then return new; end if;
      titulo := case when new.llamado_id is not null then 'Cambió un llamado' else 'Cambió un ensayo' end;
      detalle := concat_ws(' · ', new.titulo, 'Ahora: ' || cuando_mx(new.inicia), new.lugar);
    else
      return new;
    end if;
    uids := _sin_repetir(_citados(new), titulo, new.production_id);
    perform notify(uids, 'elenco', titulo, detalle, '/cuenta/produccion/' || new.production_id, new.production_id);
  exception when others then null;
  end;
  return new;
end $$;

commit;

select 'Listo 0127. Tablas de logística: ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('obra_logistica', 'obra_llamados')) || ' de 2.' as resultado;
