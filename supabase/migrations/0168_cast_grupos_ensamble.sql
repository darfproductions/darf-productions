-- DARF 2.0 — 0168: grupos de ensamble y tipo de cada personaje en el ajuste del cast (Diego 2026-11-24).
--   * audition_roles.categoria: protagonista, apoyo o ensamble (grupo de ensamble). Si es nulo, se usa la del personaje
--     de la obra (production_characters.categoria) y, si no hay, protagonista. Solo agrega una columna: el cast que ya
--     está armado no cambia.
--   * audition_cast_personaje(aid, nombre, app, categoria): en el ajuste se crea un protagonista, un personaje de apoyo
--     o un grupo de ensamble (por ejemplo «Surfistas»). El «Ensamble general» sigue siendo quien no tiene personaje.
--   * El tablero (audition_cast_board) trae la categoría de cada personaje, para agruparlo y para el documento del cast.
--   * Al mandar, quien queda en un grupo de ensamble recibe una oferta de Ensamble con el nombre del grupo.
begin;

alter table audition_roles add column if not exists categoria text;
do $$ begin
  alter table audition_roles add constraint audition_roles_categoria check (categoria is null or categoria in ('protagonista', 'apoyo', 'ensamble'));
exception when duplicate_object then null;
end $$;

-- Categoría efectiva de un personaje de la convocatoria.
create or replace function _audition_categoria(rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(r.categoria, c.categoria, 'protagonista')
    from audition_roles r left join production_characters c on c.id = r.character_id where r.id = rid
$$;
revoke execute on function _audition_categoria(uuid) from public, anon, authenticated;

drop function if exists audition_cast_personaje(uuid, text, uuid);
create or replace function audition_cast_personaje(aid uuid, p_nombre text, p_app uuid default null, p_categoria text default 'apoyo') returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid; n text := btrim(coalesce(p_nombre, ''));
begin
  if not audition_perm(aid, 'audiciones.cast') then raise exception 'Solo Dirección general puede agregar personajes al cast.'; end if;
  if (select fase from auditions where id = aid) <> 'ajuste' then raise exception 'Los personajes nuevos se agregan durante el ajuste del cast.'; end if;
  if n = '' or length(n) > 80 then raise exception 'Escribe el nombre del personaje (máximo 80 letras).'; end if;
  if coalesce(p_categoria, '') not in ('protagonista', 'apoyo', 'ensamble') then raise exception 'Elige si es protagonista, de apoyo o un grupo de ensamble.'; end if;
  if exists (select 1 from audition_roles where audition_id = aid and unaccent_lower(nombre) = unaccent_lower(n)) then
    raise exception 'Ya hay un personaje con ese nombre.';
  end if;
  insert into audition_roles (audition_id, nombre, orden, categoria)
  values (aid, n, coalesce((select max(orden) + 1 from audition_roles where audition_id = aid), 1), p_categoria)
  returning id into nuevo;
  if p_app is not null then perform audition_cast_move(aid, p_app, nuevo::text); end if;
  return nuevo;
end $$;
revoke all on function audition_cast_personaje(uuid, text, uuid, text) from public, anon;
grant execute on function audition_cast_personaje(uuid, text, uuid, text) to authenticated;

-- Tablero: igual que en 0167, más la categoría de cada personaje (en orden: protagonistas, apoyo, grupos de ensamble).
create or replace function audition_cast_board(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r int := audition_ronda_voto(aid); a auditions%rowtype;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid;
  return json_build_object(
    'fase', a.fase,
    'titulo', a.titulo,
    'obra', (select nombre from productions where id = a.production_id),
    'puede_mover', audition_perm(aid, 'audiciones.cast'),
    'roles', coalesce((
      select json_agg(json_build_object(
        'id', ro.id, 'nombre', ro.nombre, 'categoria', _audition_categoria(ro.id), 'nota', a.propuesta_notas->>ro.id::text,
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
      ) order by array_position(array['protagonista', 'apoyo', 'ensamble'], _audition_categoria(ro.id)), ro.orden, ro.nombre)
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

-- Mandar: quien queda en un grupo de ensamble recibe una oferta de Ensamble con el nombre del grupo.
do $$
declare def text;
begin
  def := pg_get_functiondef('audition_cast_enviar(uuid, text, timestamp with time zone)'::regprocedure);
  if position('_audition_categoria' in def) = 0 then
    def := replace(def, $q$for c in select ac.application_id, ac.role_id, ap.user_id, ro.nombre as papel$q$,
      $q$for c in select ac.application_id, ac.role_id, ap.user_id, ro.nombre as papel,
                    (ac.role_id is null or _audition_categoria(ac.role_id) = 'ensamble') as es_ens$q$);
    def := replace(def, $q$case when c.role_id is null then 'ensamble' else 'reparto' end$q$,
      $q$case when c.es_ens then 'ensamble' else 'reparto' end$q$);
    if position('_audition_categoria' in def) = 0 or position('c.es_ens' in def) = 0 then raise exception '0168: no se pudo ajustar audition_cast_enviar'; end if;
    execute def;
  end if;
end $$;

commit;
