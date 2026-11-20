-- 0153 · Votación: cada juez arma su cast (Diego 2026-11-20).
--   * En cada personaje el juez elige a cualquier persona que audicionó en la ronda de votación (un desplegable con
--     todos), no solo a quienes algún juez marcó como opción. Las opciones 1, 2 y 3 quedan como referencia.
--   * "Subir mi cast": se guardan todos los votos del juez de una vez (audition_vote_cast).
--   * La pantalla de votación trae, por candidato, la opción que le puso este juez (mi_opcion) y la lista de todos
--     los audicionantes. Al cerrar, la propuesta del cast sale igual que antes: el más votado de cada personaje.
-- Precede: 0089. No borra datos.

begin;

-- ¿Se puede votar por esta persona? Audicionó en la ronda de la votación y sigue en ella.
create or replace function audition_votable(aid uuid, app uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from audition_applications ap join auditions a on a.id = ap.audition_id
     where ap.id = app and ap.audition_id = aid
       and ap.ronda >= audition_ronda_voto(aid)
       and ap.estado not in ('cancelado', 'no_cumple')
       and (ap.checked_in_at is not null or a.modalidad <> 'presencial'))
$$;
revoke all on function audition_votable(uuid, uuid) from public, anon;

create or replace function audition_vote(aid uuid, rid uuid, app uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
  if (select fase from auditions where id = aid) <> 'votacion' then raise exception 'La votación no está abierta.'; end if;
  if not exists (select 1 from audition_roles where id = rid and audition_id = aid) then raise exception 'Ese personaje no es de esta convocatoria.'; end if;
  if app is not null and not audition_votable(aid, app) then raise exception 'Esa persona no audicionó en esta ronda.'; end if;
  insert into audition_votes (audition_id, role_id, judge_id, application_id) values (aid, rid, auth.uid(), app)
  on conflict (role_id, judge_id) do update set application_id = excluded.application_id, at = now();
end $$;

-- "Subir mi cast": p_votos = [{rol, app}] (app vacío = me abstengo). Personajes que no vienen no se tocan.
create or replace function audition_vote_cast(aid uuid, p_votos jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_votos, '[]')) loop
    perform audition_vote(aid, (x->>'rol')::uuid, nullif(x->>'app', '')::uuid);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function audition_vote_cast(uuid, jsonb) from public, anon;
grant execute on function audition_vote_cast(uuid, jsonb) to authenticated;

-- Pantalla de votación. Candidatos de cada personaje: a quienes algún juez marcó, más a quien votó este juez (y, ya
-- cerrada, a quien recibió votos). Con mi_opcion: la opción que le puso este juez. aspirantes: todos los votables.
create or replace function audition_voting(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a auditions%rowtype; r int; gestiona boolean; abiertos boolean;
begin
  if not (audition_perm(aid, 'audiciones.evaluar') or audition_perm(aid, 'audiciones.gestionar')) then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid;
  r := audition_ronda_voto(aid);
  gestiona := audition_perm(aid, 'audiciones.gestionar');
  abiertos := a.fase in ('ajuste', 'enviado');
  return json_build_object(
    'fase', a.fase, 'ronda', r,
    'roles', coalesce((
      select json_agg(json_build_object(
        'id', ro.id, 'nombre', ro.nombre, 'descripcion', ro.descripcion,
        'mi_voto', (select coalesce(v.application_id::text, 'abstencion') from audition_votes v where v.role_id = ro.id and v.judge_id = auth.uid()),
        'candidatos', coalesce((
          select json_agg(json_build_object(
            'id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path,
            'op1', (select count(*) from audition_picks k where k.application_id = ap.id and k.role_id = ro.id and k.ronda = r and k.opcion = 1),
            'op2', (select count(*) from audition_picks k where k.application_id = ap.id and k.role_id = ro.id and k.ronda = r and k.opcion = 2),
            'op3', (select count(*) from audition_picks k where k.application_id = ap.id and k.role_id = ro.id and k.ronda = r and k.opcion = 3),
            'mi_opcion', (select min(k.opcion) from audition_picks k where k.application_id = ap.id and k.role_id = ro.id and k.ronda = r and k.judge_id = auth.uid()),
            'votos', case when abiertos then (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id = ap.id) end
          ) order by ap.numero nulls last, ap.nombre)
            from audition_applications ap
           where ap.audition_id = aid
             and (audition_es_candidato(aid, ro.id, ap.id)
                  or exists (select 1 from audition_votes v where v.role_id = ro.id and v.application_id = ap.id
                              and (v.judge_id = auth.uid() or abiertos)))), '[]'::json)
      ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json),
    'aspirantes', coalesce((
      select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero) order by ap.numero nulls last, ap.nombre)
        from audition_applications ap where ap.audition_id = aid and audition_votable(aid, ap.id)), '[]'::json),
    'votaron', case when gestiona then coalesce((
        select json_agg(distinct coalesce(nullif(btrim(p.nombre), ''), 'Juez'))
          from audition_votes v join profiles p on p.id = v.judge_id where v.audition_id = aid), '[]'::json) end,
    'jueces', case when gestiona then (
        select count(distinct k.judge_id) from audition_picks k join audition_applications ap on ap.id = k.application_id
         where ap.audition_id = aid and k.ronda = r) end
  );
end $$;

commit;
