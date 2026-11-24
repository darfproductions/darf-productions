-- DARF 2.0 — 0167: ajuste del cast con resultados de la votación, desempate y solo Dirección general (Diego 2026-11-24).
--   * Propuesta del cast (al cerrar la votación), del personaje más importante al menos importante:
--     - Gana el más votado.
--     - Empate: gana quien tuvo más «Opción 1» de los jueces para ese personaje; luego, el mejor promedio de
--       calificaciones; luego, el número de turno. Se anota «Empate…» para revisarlo en la junta.
--     - Si el más votado ya quedó en un personaje más importante, pasa al siguiente más votado. Se anota.
--     - Las notas quedan en auditions.propuesta_notas (por personaje).
--   * Permiso nuevo «audiciones.cast» (Armar y mandar el cast). Lo tiene Dirección general (y los administradores);
--     se le puede dar a otro rol desde Permisos. Mover, agregar personajes, regresar a la votación y mandar lo piden.
--     Quien gestiona la audición sigue viendo el ajuste y los resultados.
--   * audition_resultados(aid): por personaje, ranking (votos, Opción 1, promedio), abstenciones, qué votó cada juez,
--     quién quedó y la nota. La dirección y los jueces, ya cerrada la votación.
--   * En el ajuste se pueden agregar personajes que no existían (audition_cast_personaje) y quitar los que siguen
--     vacíos y sin votos (audition_cast_quitar_personaje).
begin;

insert into permissions (id, grupo, descripcion, orden) values
  ('audiciones.cast', 'Audiciones', 'Armar y mandar el cast después de la votación (Dirección general)', 14)
on conflict (id) do nothing;

alter table auditions add column if not exists propuesta_notas jsonb not null default '{}';

-- Promedio de calificaciones de una persona en una ronda (todos los jueces, todos los criterios).
create or replace function _audition_promedio(app uuid, p_ronda int) returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg(e.value::numeric), 2) from audition_scores s cross join jsonb_each_text(s.puntos) e
   where s.application_id = app and s.ronda = p_ronda and e.value ~ '^[0-9.]+$'
$$;

-- Ranking de un personaje: votos, Opción 1 de los jueces, promedio y número. Lo usan la propuesta y los resultados.
create or replace function _audition_ranking(aid uuid, rid uuid)
returns table (app uuid, nombre text, numero int, votos int, op1 int, prom numeric)
language sql stable security definer set search_path = public as $$
  select v.application_id, ap.nombre, ap.numero, count(*)::int,
         (select count(*)::int from audition_picks k where k.application_id = v.application_id and k.role_id = rid
            and k.ronda = audition_ronda_voto(aid) and k.opcion = 1),
         _audition_promedio(v.application_id, audition_ronda_voto(aid))
    from audition_votes v join audition_applications ap on ap.id = v.application_id
   where v.role_id = rid and v.application_id is not null and ap.audition_id = aid
   group by v.application_id, ap.nombre, ap.numero
   order by 4 desc, 5 desc, 6 desc nulls last, ap.numero nulls last, ap.nombre
$$;

create or replace function _audition_propuesta(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ro record; q record; r int := audition_ronda_voto(aid); notas jsonb := '{}';
        gan record; segundo record; tiene_gan boolean; tiene_seg boolean; saltados text[]; empatados text[]; nota text; hay boolean;
begin
  delete from audition_cast where audition_id = aid;
  for ro in select id, nombre from audition_roles where audition_id = aid order by orden, nombre loop
    -- (Un record con algún campo nulo no es «is not null»: por eso se lleva aparte si ya hay ganador.)
    tiene_gan := false; tiene_seg := false; saltados := '{}'; empatados := '{}'; nota := null; hay := false;
    for q in select k.*, (select ro2.nombre from audition_cast c left join audition_roles ro2 on ro2.id = c.role_id
                           where c.audition_id = aid and c.application_id = k.app) ya
               from _audition_ranking(aid, ro.id) k loop
      hay := true;
      if exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = q.app) then
        if not tiene_gan then saltados := saltados || format('%s ya quedó en %s', q.nombre, coalesce(q.ya, 'Ensamble')); end if;
        continue;
      end if;
      if not tiene_gan then gan := q; tiene_gan := true; continue; end if;
      if not tiene_seg then segundo := q; tiene_seg := true; end if;
      if q.votos = gan.votos then empatados := empatados || q.nombre; end if;
    end loop;
    if tiene_gan then
      insert into audition_cast (audition_id, application_id, role_id) values (aid, gan.app, ro.id);
      if cardinality(saltados) > 0 then
        nota := array_to_string(saltados, '; ') || format('. Pasó al siguiente más votado: %s (%s %s).', gan.nombre, gan.votos, case when gan.votos = 1 then 'voto' else 'votos' end);
      end if;
      if cardinality(empatados) > 0 then
        nota := concat_ws(' ', nota, format('Empate a %s %s con %s. Se desempató por %s.', gan.votos, case when gan.votos = 1 then 'voto' else 'votos' end,
          array_to_string(empatados, ', '),
          case when gan.op1 > segundo.op1 then 'más «Opción 1» de los jueces'
               when coalesce(gan.prom, 0) > coalesce(segundo.prom, 0) then 'mejor promedio de calificaciones'
               else 'número de turno: decídanlo en la junta' end));
      end if;
    elsif hay then
      nota := array_to_string(saltados, '; ') || '. Todos los votados ya quedaron en otro personaje.';
    end if;
    if nota is not null then notas := notas || jsonb_build_object(ro.id::text, nota); end if;
  end loop;
  -- Ensamble: marcados para ensamble en la ronda de votación que no quedaron en un personaje.
  insert into audition_cast (audition_id, application_id, role_id)
  select distinct aid, k.application_id, null::uuid
    from audition_picks k join audition_applications ap on ap.id = k.application_id
   where ap.audition_id = aid and k.ronda = r and k.ensamble and ap.ronda >= r and ap.estado not in ('cancelado', 'no_cumple')
  on conflict do nothing;
  update auditions set propuesta_notas = notas where id = aid;
end $$;
revoke execute on function _audition_propuesta(uuid), _audition_ranking(uuid, uuid), _audition_promedio(uuid, int) from public, anon, authenticated;

-- Fases: regresar del ajuste a la votación borra el cast, así que también lo pide «audiciones.cast».
do $$
declare def text;
begin
  def := pg_get_functiondef('audition_fase(uuid, text)'::regprocedure);
  if position('audiciones.cast' in def) = 0 then
    def := replace(def, $q$  if not exists (select 1 from audition_roles where audition_id = aid) then$q$,
      $q$  if a.fase = 'ajuste' and p_dir = 'anterior' and not audition_perm(aid, 'audiciones.cast') then
    raise exception 'Solo Dirección general puede regresar el cast a la votación.';
  end if;
  if not exists (select 1 from audition_roles where audition_id = aid) then$q$);
    if position('audiciones.cast' in def) = 0 then raise exception '0167: no se pudo ajustar audition_fase'; end if;
    def := replace(def, $q$if a.fase = 'ajuste' and nueva = 'votacion' then delete from audition_cast where audition_id = aid; end if;$q$,
      $q$if a.fase = 'ajuste' and nueva = 'votacion' then delete from audition_cast where audition_id = aid; update auditions set propuesta_notas = '{}' where id = aid; end if;$q$);
    execute def;
  end if;
end $$;

-- Tablero: además, la nota de la propuesta por personaje y si quien lo ve puede moverlo.
create or replace function audition_cast_board(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r int := audition_ronda_voto(aid); a auditions%rowtype;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid;
  return json_build_object(
    'fase', a.fase,
    'puede_mover', audition_perm(aid, 'audiciones.cast'),
    'roles', coalesce((
      select json_agg(json_build_object(
        'id', ro.id, 'nombre', ro.nombre, 'nota', a.propuesta_notas->>ro.id::text,
        'sin_votos', not exists (select 1 from audition_votes v where v.role_id = ro.id),
        'asignados', coalesce((
          select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null,
                                            'votos', (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id = ap.id))
                          order by ap.numero nulls last, ap.nombre)
            from audition_cast c join audition_applications ap on ap.id = c.application_id
           where c.audition_id = aid and c.role_id = ro.id), '[]'::json),
        'pista', coalesce((
          select json_agg(json_build_object('id', q.app, 'nombre', q.nombre, 'votos', q.votos) order by q.votos desc, q.nombre)
            from (select k.app, k.nombre, k.votos from _audition_ranking(aid, ro.id) k
                   where not exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = k.app)
                   limit 3) q), '[]'::json)
      ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json),
    'ensamble', coalesce((
      select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null)
                      order by ap.numero nulls last, ap.nombre)
        from audition_cast c join audition_applications ap on ap.id = c.application_id
       where c.audition_id = aid and c.role_id is null), '[]'::json),
    'fuera', coalesce((
      select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null)
                      order by (ap.ronda >= r) desc,
                               exists (select 1 from audition_picks k where k.application_id = ap.id and k.ronda = r) desc,
                               ap.numero nulls last, ap.nombre)
        from audition_applications ap
       where ap.audition_id = aid and ap.estado not in ('cancelado', 'no_cumple', 'seleccionado')
         and (ap.checked_in_at is not null or a.modalidad <> 'presencial')
         and not exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = ap.id)), '[]'::json)
  );
end $$;

-- Mover y mandar: ahora con «audiciones.cast».
do $$
declare f text; def text;
begin
  foreach f in array array['audition_cast_move(uuid, uuid, text)', 'audition_cast_enviar(uuid, text, timestamp with time zone)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('audiciones.cast' in def) = 0 then
      def := replace(def, $q$if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;$q$,
        $q$if not audition_perm(aid, 'audiciones.cast') then raise exception 'Solo Dirección general puede mover y mandar el cast.'; end if;$q$);
      if position('audiciones.cast' in def) = 0 then raise exception '0167: no se pudo ajustar %', f; end if;
      execute def;
    end if;
  end loop;
end $$;

-- Agregar un personaje en el ajuste (alguien queda perfecto para un papel que no estaba) y, si se dice, asignarlo.
create or replace function audition_cast_personaje(aid uuid, p_nombre text, p_app uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid; n text := btrim(coalesce(p_nombre, ''));
begin
  if not audition_perm(aid, 'audiciones.cast') then raise exception 'Solo Dirección general puede agregar personajes al cast.'; end if;
  if (select fase from auditions where id = aid) <> 'ajuste' then raise exception 'Los personajes nuevos se agregan durante el ajuste del cast.'; end if;
  if n = '' or length(n) > 80 then raise exception 'Escribe el nombre del personaje (máximo 80 letras).'; end if;
  if exists (select 1 from audition_roles where audition_id = aid and unaccent_lower(nombre) = unaccent_lower(n)) then
    raise exception 'Ya hay un personaje con ese nombre.';
  end if;
  insert into audition_roles (audition_id, nombre, orden)
  values (aid, n, coalesce((select max(orden) + 1 from audition_roles where audition_id = aid), 1))
  returning id into nuevo;
  if p_app is not null then perform audition_cast_move(aid, p_app, nuevo::text); end if;
  return nuevo;
end $$;

-- Quitar un personaje del ajuste: solo si está vacío y nadie votó por él (los que se agregaron por error).
create or replace function audition_cast_quitar_personaje(aid uuid, rid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.cast') then raise exception 'Solo Dirección general puede quitar personajes del cast.'; end if;
  if (select fase from auditions where id = aid) <> 'ajuste' then raise exception 'Los personajes se quitan durante el ajuste del cast.'; end if;
  if not exists (select 1 from audition_roles where id = rid and audition_id = aid) then raise exception 'Ese personaje no es de esta convocatoria.'; end if;
  if exists (select 1 from audition_cast where role_id = rid) then raise exception 'Primero mueve a quien está en ese personaje.'; end if;
  if exists (select 1 from audition_votes where role_id = rid) or exists (select 1 from audition_picks where role_id = rid) then
    raise exception 'Ese personaje tiene votos u opciones de los jueces: no se puede quitar.';
  end if;
  delete from audition_roles where id = rid;
end $$;

-- Resultados de la votación por personaje. La dirección y los jueces, ya cerrada la votación.
create or replace function audition_resultados(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a auditions%rowtype;
begin
  select * into a from auditions where id = aid;
  if a.id is null then raise exception 'La convocatoria no existe.'; end if;
  if not (audition_perm(aid, 'audiciones.gestionar') or audition_perm(aid, 'audiciones.evaluar')) then raise exception 'No autorizado'; end if;
  if a.fase not in ('ajuste', 'enviado') then raise exception 'Los resultados se ven cuando se cierra la votación.'; end if;
  return json_build_object(
    'fase', a.fase,
    'jueces', (select count(distinct judge_id) from audition_votes where audition_id = aid),
    'roles', coalesce((
      select json_agg(json_build_object(
          'id', ro.id, 'personaje', ro.nombre, 'nota', a.propuesta_notas->>ro.id::text,
          'ranking', coalesce((select json_agg(json_build_object('id', k.app, 'nombre', k.nombre, 'numero', k.numero, 'votos', k.votos, 'op1', k.op1, 'prom', k.prom))
                                 from _audition_ranking(aid, ro.id) k), '[]'::json),
          'abstenciones', (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id is null),
          'por_juez', coalesce((
            select json_agg(json_build_object('juez', coalesce(nullif(btrim(pr.nombre), ''), 'Juez'),
                     'voto', case when ap.id is null then null else concat(case when ap.numero is not null then 'Nº ' || ap.numero || ' · ' end, ap.nombre) end)
                   order by pr.nombre)
              from audition_votes v left join profiles pr on pr.id = v.judge_id
              left join audition_applications ap on ap.id = v.application_id
             where v.role_id = ro.id), '[]'::json),
          'quedo', coalesce((select json_agg(concat(case when ap.numero is not null then 'Nº ' || ap.numero || ' · ' end, ap.nombre) order by ap.numero nulls last)
                               from audition_cast c join audition_applications ap on ap.id = c.application_id
                              where c.audition_id = aid and c.role_id = ro.id), '[]'::json)
        ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json)
  );
end $$;

revoke all on function audition_cast_personaje(uuid, text, uuid), audition_cast_quitar_personaje(uuid, uuid), audition_resultados(uuid) from public, anon;
grant execute on function audition_cast_personaje(uuid, text, uuid), audition_cast_quitar_personaje(uuid, uuid), audition_resultados(uuid) to authenticated;

commit;
