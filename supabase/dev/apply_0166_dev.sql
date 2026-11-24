-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0166: evaluaciones de todos los jueces (Excel y en la votación), votación en PDF y expediente de la audición.
-- Correr DESPUÉS de apply_0165_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'audition_applications' and column_name = 'no_juntar') then
    raise exception 'ABORTADO: falta una migración anterior (0165).';
  end if;
end $$;
-- DARF 2.0 — 0166: evaluaciones de todos los jueces, votos por juez y expediente de la audición (Diego 2026-11-24).
--   * audition_evaluaciones(aid): lo que cada juez puso de cada aspirante (calificaciones, notas y opciones de
--     personaje), por ronda. La dirección (audiciones.gestionar) lo ve siempre; los jueces (audiciones.evaluar), a
--     partir de la votación, para votar con toda la información. Antes cada juez solo ve lo suyo.
--   * audition_expediente(aid): todo junto para la dirección: datos de la audición, jueces, quién pasó a callback,
--     entrevistas, votos por personaje (qué votó cada juez, ya cerrada la votación), cast y ofertas.
--   Solo lectura: no cambia tablas ni permisos de escritura.

create or replace function audition_evaluaciones(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a auditions%rowtype;
begin
  select * into a from auditions where id = aid;
  if a.id is null then raise exception 'La convocatoria no existe.'; end if;
  if not (audition_perm(aid, 'audiciones.gestionar')
          or (audition_perm(aid, 'audiciones.evaluar') and a.fase in ('votacion', 'ajuste', 'enviado'))) then
    raise exception 'Las evaluaciones de todos los jueces se ven a partir de la votación.';
  end if;
  return (
    with filas as (
      select s.application_id app, s.judge_id judge, s.ronda from audition_scores s
        join audition_applications ap on ap.id = s.application_id where ap.audition_id = aid
      union
      select k.application_id, k.judge_id, k.ronda from audition_picks k
        join audition_applications ap on ap.id = k.application_id where ap.audition_id = aid
    ), ev as (
      select f.app, f.ronda, coalesce(nullif(btrim(pr.nombre), ''), 'Juez') juez,
             coalesce(sc.puntos, '{}'::jsonb) puntos, nullif(btrim(coalesce(sc.notas, '')), '') notas,
             (select json_agg(case when k.ensamble then 'Ensamble' else ro.nombre end order by k.opcion)
                from audition_picks k left join audition_roles ro on ro.id = k.role_id
               where k.application_id = f.app and k.judge_id = f.judge and k.ronda = f.ronda) opciones
        from filas f
        left join audition_scores sc on sc.application_id = f.app and sc.judge_id = f.judge and sc.ronda = f.ronda
        left join profiles pr on pr.id = f.judge
    )
    select json_build_object(
      'fase', a.fase,
      'criterios', a.criterios,
      'personas', coalesce((
        select json_agg(json_build_object('id', ap.id, 'numero', ap.numero, 'nombre', ap.nombre, 'ronda', ap.ronda, 'estado', ap.estado,
                 'edad', case when ap.fecha_nacimiento is not null then date_part('year', age(ap.fecha_nacimiento))::int end)
               order by ap.numero nulls last, ap.nombre)
          from audition_applications ap
         where ap.audition_id = aid and exists (select 1 from ev where ev.app = ap.id)), '[]'::json),
      'evaluaciones', coalesce((
        select json_agg(json_build_object('app', ev.app, 'ronda', ev.ronda, 'juez', ev.juez, 'puntos', ev.puntos,
                 'notas', ev.notas, 'opciones', coalesce(ev.opciones, '[]'::json)) order by ev.ronda, ev.juez)
          from ev where ev.puntos <> '{}'::jsonb or ev.notas is not null or ev.opciones is not null), '[]'::json)
    )
  );
end $$;
revoke all on function audition_evaluaciones(uuid) from public, anon;
grant execute on function audition_evaluaciones(uuid) to authenticated;

create or replace function audition_expediente(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a auditions%rowtype; cerrada boolean;
begin
  select * into a from auditions where id = aid;
  if a.id is null then raise exception 'La convocatoria no existe.'; end if;
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  cerrada := a.fase in ('ajuste', 'enviado');
  return json_build_object(
    'titulo', a.titulo,
    'obra', (select nombre from productions where id = a.production_id),
    'fase', a.fase, 'modalidad', a.modalidad, 'con_callback', a.con_callback, 'sede', a.sede,
    'desde', (select min(inicia) from audition_slots where audition_id = aid),
    'hasta', (select max(inicia) from audition_slots where audition_id = aid),
    'conteos', (select json_build_object(
        'inscritos', count(*) filter (where estado <> 'cancelado'),
        'cancelaron', count(*) filter (where estado = 'cancelado'),
        'llegaron', count(*) filter (where checked_in_at is not null or entered_at is not null),
        'callback', count(*) filter (where ronda >= 2),
        'seleccionados', count(*) filter (where estado = 'seleccionado'))
      from audition_applications where audition_id = aid),
    'jueces', coalesce((
      select json_agg(n order by n) from (
        select distinct coalesce(nullif(btrim(pr.nombre), ''), 'Juez') n from (
          select s.judge_id j from audition_scores s join audition_applications ap on ap.id = s.application_id where ap.audition_id = aid
          union select k.judge_id from audition_picks k join audition_applications ap on ap.id = k.application_id where ap.audition_id = aid
          union select v.judge_id from audition_votes v where v.audition_id = aid) x
        left join profiles pr on pr.id = x.j) q), '[]'::json),
    'callback', coalesce((
      select json_agg(json_build_object('id', ap.id, 'numero', ap.numero, 'nombre', ap.nombre) order by ap.numero nulls last, ap.nombre)
        from audition_applications ap where ap.audition_id = aid and ap.ronda >= 2), '[]'::json),
    'entrevistas', coalesce((
      select json_agg(json_build_object('numero', ap.numero, 'nombre', ap.nombre, 'respuestas', ap.entrevista, 'extra', ap.entrevista_extra,
               'por', (select coalesce(nullif(btrim(p.nombre), ''), 'Equipo') from profiles p where p.id = ap.entrevista_por))
             order by ap.numero nulls last, ap.nombre)
        from audition_applications ap where ap.audition_id = aid and ap.entrevista_at is not null), '[]'::json),
    -- Los votos se ven al cerrar la votación (igual que en la pantalla de votación).
    'votacion', case when cerrada then coalesce((
      select json_agg(json_build_object(
          'personaje', ro.nombre,
          'totales', coalesce((
            select json_agg(json_build_object('numero', ap.numero, 'nombre', ap.nombre, 'votos', t.n) order by t.n desc, ap.numero nulls last)
              from (select v.application_id, count(*) n from audition_votes v where v.role_id = ro.id and v.application_id is not null group by 1) t
              join audition_applications ap on ap.id = t.application_id), '[]'::json),
          'abstenciones', (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id is null),
          'por_juez', coalesce((
            select json_agg(json_build_object('juez', coalesce(nullif(btrim(pr.nombre), ''), 'Juez'),
                     'voto', case when ap.id is null then null else concat(case when ap.numero is not null then 'Nº ' || ap.numero || ' · ' end, ap.nombre) end)
                   order by pr.nombre)
              from audition_votes v left join profiles pr on pr.id = v.judge_id
              left join audition_applications ap on ap.id = v.application_id
             where v.role_id = ro.id), '[]'::json)
        ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json) end,
    'cast', case when cerrada then coalesce((
      select json_agg(json_build_object('personaje', g.personaje, 'personas', g.personas) order by g.orden)
        from (
          select coalesce(ro.nombre, 'Ensamble') personaje, coalesce(min(ro.orden), 100000) orden,
                 json_agg(concat(case when ap.numero is not null then 'Nº ' || ap.numero || ' · ' end, ap.nombre) order by ap.numero nulls last, ap.nombre) personas
            from audition_cast c join audition_applications ap on ap.id = c.application_id
            left join audition_roles ro on ro.id = c.role_id
           where c.audition_id = aid
           group by ro.id, ro.nombre) g), '[]'::json) end,
    'ofertas', coalesce((
      select json_agg(json_build_object('nombre', ap.nombre, 'numero', ap.numero, 'tipo', o.tipo, 'papel', o.papel, 'estado', o.estado,
               'enviada', o.created_at, 'respondida', o.respondida_at) order by ap.numero nulls last, ap.nombre, o.created_at)
        from casting_offers o join audition_applications ap on ap.id = o.application_id where ap.audition_id = aid), '[]'::json)
  );
end $$;
revoke all on function audition_expediente(uuid) from public, anon;
grant execute on function audition_expediente(uuid) to authenticated;


select 'Listo: 0166 aplicada (evaluaciones, votación en PDF y expediente).' as resultado;
