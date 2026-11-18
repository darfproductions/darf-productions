-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Calendario de ensayos de Showman, del 21 de noviembre de 2026 al 22 de enero de 2027 (Diego 2026-11-18).
-- Solo cambia datos de ensayos de Showman; no cambia la estructura de la base.
--   * Si ya hay un ensayo ese mismo día, se le cambian hora, lugar y notas. Se conservan su lista de citados,
--     encargados, confirmaciones, permisos de falta y asistencia.
--   * Si no hay ensayo ese día, se crea uno con la misma convocatoria (citados y encargados) del ensayo más reciente.
--   * Los ensayos que ya estaban programados de hoy al 22 de enero en días que NO vienen en la lista se CANCELAN
--     (no se borran: se ven como cancelados y se conservan sus datos).
--   * No toca los llamados de función ni ensayos pasados.
--   * En lugar de mandar un aviso por cada cambio, se manda UNO a todo el elenco y equipo citado: "Nuevo calendario".
-- Se puede correr más de una vez (la segunda vez ya no cambia nada ni vuelve a avisar). Si la base no es DEV, aborta.
-- Al final muestra cómo quedó el calendario.

begin;

do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

-- El calendario nuevo (horas de Querétaro / Ciudad de México). "PD" = por definir.
create temp table _nuevo (dia date primary key, desde time not null, hasta time, lugar text, notas text) on commit drop;
insert into _nuevo values
  ('2026-11-21', '09:00', '15:00', 'Salón habitual', null),
  ('2026-11-28', '09:00', '15:00', 'Salón habitual', null),
  ('2026-11-29', '10:00', '15:00', 'Por definir', null),
  ('2026-12-05', '09:00', '15:00', 'Salón habitual', null),
  ('2026-12-06', '10:00', '15:00', 'Por definir', null),
  ('2026-12-12', '09:00', '15:00', 'Salón habitual', '¡Convivio de Navidad!'),
  ('2026-12-13', '10:00', '15:00', 'Por definir', null),
  ('2027-01-09', '09:00', '15:00', 'Salón habitual', null),
  ('2027-01-10', '10:00', '15:00', 'Por definir', null),
  ('2027-01-16', '09:00', '15:00', 'Salón habitual', null),
  ('2027-01-17', '10:00', '15:00', 'Por definir', null),
  ('2027-01-22', '16:00', null,    'Teatro IMSS', 'Hora de llegada aproximada (por confirmar). Hora de salida por definir.');

do $$
declare
  pid text; tpl rehearsals; salon text; n record; r rehearsals; v_ini timestamptz; v_fin timestamptz; v_lugar text;
  cambios int := 0; nuevos int := 0; cancelados int := 0; uids uuid[];
  tz constant text := 'America/Mexico_City';
  desde_ts timestamptz := now();
  hasta_ts timestamptz := ('2027-01-23'::date)::timestamp at time zone 'America/Mexico_City';
begin
  -- La obra: Showman (por id o por nombre; tiene que ser una sola).
  select id into pid from productions where id = 'showman';
  if pid is null then
    if (select count(*) from productions where nombre ilike '%showman%') <> 1 then
      raise exception 'ABORTADO: no encontré una sola obra llamada Showman. No se cambió nada.';
    end if;
    select id into pid from productions where nombre ilike '%showman%';
  end if;

  -- Modelo para los ensayos nuevos: el ensayo de Showman más reciente (no cancelado, no llamado de función).
  select * into tpl from rehearsals
   where production_id = pid and llamado_id is null and performance_id is null and estado = 'programado'
   order by inicia desc limit 1;
  -- "Salón habitual": el lugar que ya usaban los sábados, si lo tenían escrito.
  select lugar into salon from rehearsals
   where production_id = pid and llamado_id is null and performance_id is null and nullif(btrim(lugar), '') is not null
     and extract(isodow from inicia at time zone tz) = 6
   order by inicia desc limit 1;

  -- Un solo aviso al final, no uno por cambio.
  alter table rehearsals disable trigger notify_rehearsal;

  for n in select * from _nuevo order by dia loop
    v_lugar := case when n.lugar = 'Salón habitual' then coalesce(salon, 'Salón habitual') else n.lugar end;
    v_ini := (n.dia + n.desde) at time zone tz;
    v_fin := null;
    if n.hasta is not null then v_fin := (n.dia + n.hasta) at time zone tz; end if;
    select * into r from rehearsals
     where production_id = pid and llamado_id is null and performance_id is null
       and (inicia at time zone tz)::date = n.dia
     order by (estado = 'programado') desc, inicia limit 1;
    if found then
      if r.inicia is distinct from v_ini or r.termina is distinct from v_fin
         or r.lugar is distinct from v_lugar or r.notas is distinct from n.notas or r.estado <> 'programado' then
        update rehearsals set inicia = v_ini, termina = v_fin, lugar = v_lugar, notas = n.notas, estado = 'programado'
         where id = r.id;
        cambios := cambios + 1;
      end if;
    else
      insert into rehearsals (production_id, titulo, inicia, termina, lugar, notas, convocatoria, grupos, personas,
                              equipo, equipo_todos, encargados, created_by)
      values (pid, coalesce(tpl.titulo, 'Ensayo'), v_ini, v_fin, v_lugar, n.notas, coalesce(tpl.convocatoria, 'todos'), coalesce(tpl.grupos, '{}'), coalesce(tpl.personas, '{}'),
              coalesce(tpl.equipo, '{}'), coalesce(tpl.equipo_todos, false), coalesce(tpl.encargados, '{}'), tpl.created_by);
      nuevos := nuevos + 1;
    end if;
  end loop;

  -- Los que quedaron fuera del calendario (de hoy al 22 de enero): cancelados, sin borrar.
  update rehearsals set estado = 'cancelado'
   where production_id = pid and llamado_id is null and performance_id is null and estado = 'programado'
     and inicia >= desde_ts and inicia < hasta_ts
     and (inicia at time zone tz)::date not in (select dia from _nuevo);
  get diagnostics cancelados = row_count;

  alter table rehearsals enable trigger notify_rehearsal;

  -- Un aviso a todos los citados en el nuevo calendario (solo si algo cambió).
  if cambios + nuevos + cancelados > 0 then
    select array_agg(distinct u) into uids
      from rehearsals x, unnest(_citados(x)) u
     where x.production_id = pid and x.llamado_id is null and x.estado = 'programado'
       and x.inicia >= desde_ts and x.inicia < hasta_ts;
    if uids is not null then
      perform notify(uids, 'elenco', 'Nuevo calendario de ensayos',
        'Showman: revisa las fechas de noviembre a enero en tu calendario.', '/cuenta/produccion/' || pid, pid);
    end if;
  end if;

  raise notice 'Showman: % cambiados, % nuevos, % cancelados.', cambios, nuevos, cancelados;
end $$;

commit;

-- Así quedó (de hoy al 22 de enero):
select (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow from r.inicia at time zone 'America/Mexico_City')::int] as dia,
       to_char(r.inicia at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as inicia,
       to_char(r.termina at time zone 'America/Mexico_City', 'HH24:MI') as termina,
       r.lugar, r.notas, r.estado, r.titulo
  from rehearsals r join productions p on p.id = r.production_id
 where (p.id = 'showman' or p.nombre ilike '%showman%') and r.llamado_id is null and r.performance_id is null
   and r.inicia >= now() - interval '1 day' and r.inicia < '2027-01-23'
 order by r.inicia;
