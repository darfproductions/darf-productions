-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0115: "En escena" en audiciones (el host pasa al siguiente; los jueces ven formulario, entrevista e historial).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.regalos_cumple') is null then
    raise exception 'ABORTADO: primero corre apply_0114_dev.sql.';
  end if;
end $$;
begin;

alter table auditions add column if not exists en_escena uuid references audition_applications(id) on delete set null;
alter table auditions add column if not exists en_escena_at timestamptz;

-- Poner en escena (app = null: nadie en escena).
create or replace function audition_en_escena(aid uuid, app uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications; prev uuid;
begin
  if not (audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select en_escena into prev from auditions where id = aid for update;
  if not found then raise exception 'No se encontró la audición.'; end if;
  if app is not null then
    select * into v from audition_applications where id = app and audition_id = aid for update;
    if not found then raise exception 'Esa persona no es de esta audición.'; end if;
    if v.checked_in_at is null then raise exception 'Primero marca su llegada en Registro.'; end if;
    if v.estado in ('cancelado', 'no_cumple') then raise exception 'Esa solicitud está cancelada.'; end if;
  end if;
  -- El anterior termina (si había entrado y no había terminado).
  if prev is not null and prev is distinct from app then
    update audition_applications set finished_at = now(), updated_at = now()
     where id = prev and entered_at is not null and finished_at is null;
  end if;
  if app is not null then
    update audition_applications set entered_at = coalesce(entered_at, now()), entered_by = coalesce(entered_by, auth.uid()),
           finished_at = null, updated_at = now()
     where id = app;
  end if;
  update auditions set en_escena = app, en_escena_at = case when app is null then null else now() end where id = aid;
  return json_build_object('app', app, 'numero', v.numero, 'nombre', v.nombre);
end $$;
revoke all on function audition_en_escena(uuid, uuid) from public, anon;
grant execute on function audition_en_escena(uuid, uuid) to authenticated;

-- El siguiente por número: ya llegó, no ha terminado y no es quien está ahora.
create or replace function audition_siguiente(aid uuid) returns json
language plpgsql security definer set search_path = public as $$
declare cur uuid; cur_num int; nxt uuid;
begin
  if not (audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select en_escena into cur from auditions where id = aid;
  select numero into cur_num from audition_applications where id = cur;
  select a.id into nxt from audition_applications a
   where a.audition_id = aid and a.checked_in_at is not null and a.finished_at is null
     and a.estado not in ('cancelado', 'no_cumple') and a.id is distinct from cur
   order by (cur_num is not null and coalesce(a.numero, 2147483647) < cur_num), a.numero nulls last, a.checked_in_at
   limit 1;
  if nxt is null then
    perform audition_en_escena(aid, null);
    return json_build_object('app', null);
  end if;
  return audition_en_escena(aid, nxt);
end $$;
revoke all on function audition_siguiente(uuid) from public, anon;
grant execute on function audition_siguiente(uuid) to authenticated;

-- Pantalla del juez: quien está en escena con todo lo necesario para evaluar (sin contacto).
create or replace function audition_juez_actual(aid uuid, p_ronda int default 1) returns json
language plpgsql stable security definer set search_path = public as $$
declare au auditions; a audition_applications; v_person uuid;
begin
  if not (audition_perm(aid, 'audiciones.evaluar') or audition_perm(aid, 'audiciones.entrevista')
          or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = aid;
  if au.en_escena is null then return json_build_object('app', null); end if;
  select * into a from audition_applications where id = au.en_escena;
  if a.user_id is not null then select id into v_person from people where profile_id = a.user_id; end if;
  return json_build_object(
    'app', a.id, 'numero', a.numero, 'nombre', a.nombre, 'edad', audition_age(aid, a.fecha_nacimiento),
    'foto_path', a.foto_path, 'desde', au.en_escena_at,
    'personajes', (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('pregunta', f.etiqueta, 'respuesta', a.respuestas->>f.id::text) order by f.orden)
        from audition_fields f
       where f.audition_id = aid and f.tipo <> 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) <> ''), '[]'::jsonb),
    'enlaces', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('titulo', f.etiqueta, 'url', btrim(a.respuestas->>f.id::text)) as x
          from audition_fields f
         where f.audition_id = aid and f.tipo = 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) ~* '^https://\S+$'
        union all
        select jsonb_build_object('titulo', v.titulo, 'url', v.url) from audition_videos v where v.application_id = a.id) q), '[]'::jsonb),
    'entrevista', coalesce(a.entrevista, '[]'::jsonb), 'extra', a.entrevista_extra, 'entrevista_at', a.entrevista_at,
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('obra', p.nombre, 'temporada', p.temporada, 'tipo', c.tipo, 'papel', c.papel) order by p.created_at desc)
        from production_credits c join productions p on p.id = c.production_id
       where v_person is not null and c.person_id = v_person), '[]'::jsonb),
    'puntos', coalesce((select sc.puntos from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda), '{}'::jsonb),
    'notas', (select sc.notas from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('opcion', k.opcion, 'role_id', k.role_id, 'ensamble', k.ensamble))
        from audition_picks k where k.application_id = a.id and k.judge_id = auth.uid() and k.ronda = p_ronda), '[]'::jsonb));
end $$;
revoke all on function audition_juez_actual(uuid, int) from public, anon;
grant execute on function audition_juez_actual(uuid, int) to authenticated;

commit;

select 'Listo 0115. En escena activo en audiciones.' as resultado;
