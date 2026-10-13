-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0089: audiciones con votación (personajes de la obra, opciones de los jueces, callback, votación secreta, propuesta y ajuste del cast, mandar ofertas y avisos). Requiere 0088.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create table production_characters (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> '' and length(nombre) <= 80),
  descripcion text check (length(descripcion) <= 500),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_production_characters on production_characters(production_id, orden);
alter table production_characters enable row level security;
create policy production_characters_read on production_characters for select
  using (production_is_visible(production_id) or in_production_team(production_id));
create policy production_characters_write on production_characters for all to authenticated
  using (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'elenco.gestionar'))
  with check (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'elenco.gestionar'));
create trigger audit_production_characters after insert or update or delete on production_characters
  for each row execute function audit_row();

alter table audition_roles add column character_id uuid references production_characters(id) on delete set null;

create or replace function production_character_move(cid uuid, p_dir int)
returns void language plpgsql security definer set search_path = public as $$
declare c production_characters%rowtype; otro production_characters%rowtype;
begin
  select * into c from production_characters where id = cid;
  if not found then raise exception 'El personaje no existe.'; end if;
  if not (has_perm(c.production_id, 'obra.editar') or has_perm(c.production_id, 'elenco.gestionar')) then raise exception 'No autorizado'; end if;
  -- Normaliza el orden (1..n) y luego intercambia con el vecino.
  update production_characters x set orden = q.n
    from (select id, row_number() over (order by orden, created_at) as n from production_characters where production_id = c.production_id) q
   where x.id = q.id;
  select * into c from production_characters where id = cid;
  select * into otro from production_characters where production_id = c.production_id and orden = c.orden + sign(p_dir)::int;
  if not found then return; end if;
  update production_characters set orden = c.orden where id = otro.id;
  update production_characters set orden = otro.orden where id = c.id;
end $$;

create or replace function audition_import_characters(aid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare pid text; n int; base int;
begin
  if not audition_config_perm(aid) then raise exception 'No autorizado'; end if;
  select production_id into pid from auditions where id = aid;
  if pid is null then raise exception 'Esta convocatoria no es de una obra.'; end if;
  select coalesce(max(orden), 0) into base from audition_roles where audition_id = aid;
  insert into audition_roles (audition_id, nombre, descripcion, orden, character_id)
  select aid, c.nombre, c.descripcion, base + row_number() over (order by c.orden, c.created_at), c.id
    from production_characters c
   where c.production_id = pid
     and not exists (select 1 from audition_roles r where r.audition_id = aid and (r.character_id = c.id or lower(r.nombre) = lower(c.nombre)));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function audition_role_move(rid uuid, p_dir int)
returns void language plpgsql security definer set search_path = public as $$
declare r audition_roles%rowtype; otro audition_roles%rowtype;
begin
  select * into r from audition_roles where id = rid;
  if not found then raise exception 'El personaje no existe.'; end if;
  if not audition_config_perm(r.audition_id) then raise exception 'No autorizado'; end if;
  update audition_roles x set orden = q.n
    from (select id, row_number() over (order by orden, nombre) as n from audition_roles where audition_id = r.audition_id) q
   where x.id = q.id;
  select * into r from audition_roles where id = rid;
  select * into otro from audition_roles where audition_id = r.audition_id and orden = r.orden + sign(p_dir)::int;
  if not found then return; end if;
  update audition_roles set orden = r.orden where id = otro.id;
  update audition_roles set orden = otro.orden where id = r.id;
end $$;

create or replace function notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare a auditions%rowtype; uid uuid;
begin
  begin
    select id into uid from auth.users where lower(email) = lower(new.email) limit 1;
    if uid is null then return new; end if;
    select * into a from auditions where id = new.audition_id;
    perform notify(array[uid], 'audicion', 'Te invitaron a audicionar',
      concat_ws(' · ', a.titulo, production_name(a.production_id)), '/audiciones/' || a.id, a.production_id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_invite after insert on audition_invites for each row execute function notify_invite();

alter table auditions
  add column con_callback boolean not null default false,
  add column fase text not null default 'audicion'
    check (fase in ('audicion', 'seleccion_callback', 'callback', 'votacion', 'ajuste', 'enviado'));

create or replace function audition_ronda_voto(aid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when con_callback then 2 else 1 end from auditions where id = aid
$$;

create table audition_picks (
  application_id uuid not null references audition_applications(id) on delete cascade,
  judge_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ronda int not null check (ronda between 1 and 5),
  opcion smallint not null check (opcion between 1 and 3),
  role_id uuid references audition_roles(id) on delete cascade,
  ensamble boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (application_id, judge_id, ronda, opcion),
  check ((role_id is null) = ensamble)
);
create unique index uq_audition_picks_role on audition_picks(application_id, judge_id, ronda, role_id) where role_id is not null;
create unique index uq_audition_picks_ens on audition_picks(application_id, judge_id, ronda) where ensamble;
create index idx_audition_picks_role on audition_picks(role_id, ronda);
alter table audition_picks enable row level security;
create policy audition_picks_own_read on audition_picks for select to authenticated
  using (judge_id = auth.uid() or audition_perm(application_audition(application_id), 'audiciones.gestionar'));
revoke all on audition_picks from anon;

create or replace function audition_picks_set(app uuid, p_ronda int, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare aid uuid := application_audition(app); a auditions%rowtype; e jsonb; v_role uuid; n int := 0;
begin
  if aid is null then raise exception 'La solicitud no existe.'; end if;
  if not audition_perm(aid, 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid;
  if not ((p_ronda = 1 and a.fase in ('audicion', 'seleccion_callback')) or (p_ronda = 2 and a.fase = 'callback')) then
    raise exception 'Las opciones de esta ronda ya están cerradas.';
  end if;
  if (select ronda from audition_applications where id = app) < p_ronda then raise exception 'Esta persona no está en esta ronda.'; end if;
  if jsonb_typeof(coalesce(p, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p, '[]'::jsonb)) > 3 then
    raise exception 'Máximo 3 opciones.';
  end if;
  delete from audition_picks where application_id = app and judge_id = auth.uid() and ronda = p_ronda;
  for e in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    n := n + 1;
    if coalesce(e->>'role_id', '') = '' then continue; end if;
    if e->>'role_id' = 'ensamble' then
      insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble)
      values (app, auth.uid(), p_ronda, coalesce((e->>'opcion')::int, n), null, true);
    else
      v_role := (e->>'role_id')::uuid;
      if not exists (select 1 from audition_roles where id = v_role and audition_id = aid) then raise exception 'Ese personaje no es de esta convocatoria.'; end if;
      insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble)
      values (app, auth.uid(), p_ronda, coalesce((e->>'opcion')::int, n), v_role, false);
    end if;
  end loop;
exception when unique_violation then
  raise exception 'No repitas el mismo personaje (ni Ensamble) en dos opciones.';
end $$;

create table audition_votes (
  audition_id uuid not null references auditions(id) on delete cascade,
  role_id uuid not null references audition_roles(id) on delete cascade,
  judge_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references audition_applications(id) on delete cascade,  -- null = abstención
  at timestamptz not null default now(),
  primary key (role_id, judge_id)
);
create index idx_audition_votes_aud on audition_votes(audition_id);
alter table audition_votes enable row level security;
revoke all on audition_votes from anon, authenticated;

create or replace function audition_es_candidato(aid uuid, rid uuid, app uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from audition_picks k join audition_applications a on a.id = k.application_id
     where k.role_id = rid and k.application_id = app and a.audition_id = aid
       and k.ronda = audition_ronda_voto(aid) and a.ronda >= audition_ronda_voto(aid)
       and a.estado not in ('cancelado', 'no_cumple'))
$$;

create or replace function audition_vote(aid uuid, rid uuid, app uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
  if (select fase from auditions where id = aid) <> 'votacion' then raise exception 'La votación no está abierta.'; end if;
  if not exists (select 1 from audition_roles where id = rid and audition_id = aid) then raise exception 'Ese personaje no es de esta convocatoria.'; end if;
  if app is not null and not audition_es_candidato(aid, rid, app) then raise exception 'Esa persona no está entre los candidatos de este personaje.'; end if;
  insert into audition_votes (audition_id, role_id, judge_id, application_id) values (aid, rid, auth.uid(), app)
  on conflict (role_id, judge_id) do update set application_id = excluded.application_id, at = now();
end $$;

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
            'votos', case when abiertos then (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id = ap.id) end
          ) order by ap.numero nulls last, ap.nombre)
            from audition_applications ap
           where ap.audition_id = aid and audition_es_candidato(aid, ro.id, ap.id)), '[]'::json)
      ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json),
    'votaron', case when gestiona then coalesce((
        select json_agg(distinct coalesce(nullif(btrim(p.nombre), ''), 'Juez'))
          from audition_votes v join profiles p on p.id = v.judge_id where v.audition_id = aid), '[]'::json) end,
    'jueces', case when gestiona then (
        select count(distinct k.judge_id) from audition_picks k join audition_applications ap on ap.id = k.application_id
         where ap.audition_id = aid and k.ronda = r) end
  );
end $$;

create table audition_cast (
  audition_id uuid not null references auditions(id) on delete cascade,
  application_id uuid not null references audition_applications(id) on delete cascade,
  role_id uuid references audition_roles(id) on delete cascade,   -- null = Ensamble
  primary key (audition_id, application_id)
);
alter table audition_cast enable row level security;
revoke all on audition_cast from anon, authenticated;

create or replace function _audition_propuesta(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ro record; maxv int; r int := audition_ronda_voto(aid);
begin
  delete from audition_cast where audition_id = aid;
  for ro in select id from audition_roles where audition_id = aid order by orden, nombre loop
    select max(c) into maxv from (select count(*) c from audition_votes where role_id = ro.id and application_id is not null group by application_id) q;
    if coalesce(maxv, 0) = 0 then continue; end if;
    insert into audition_cast (audition_id, application_id, role_id)
    select aid, v.application_id, ro.id
      from audition_votes v
     where v.role_id = ro.id and v.application_id is not null
     group by v.application_id
    having count(*) = maxv
       and not exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = v.application_id);
  end loop;
  -- Ensamble: marcados para ensamble en la ronda de votación que no quedaron en un personaje.
  insert into audition_cast (audition_id, application_id, role_id)
  select distinct aid, k.application_id, null::uuid
    from audition_picks k join audition_applications ap on ap.id = k.application_id
   where ap.audition_id = aid and k.ronda = r and k.ensamble and ap.ronda >= r and ap.estado not in ('cancelado', 'no_cumple')
  on conflict do nothing;
end $$;

create or replace function audition_fase(aid uuid, p_dir text)
returns text language plpgsql security definer set search_path = public as $$
declare a auditions%rowtype; nueva text; pasan uuid[];
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid for update;
  if not exists (select 1 from audition_roles where audition_id = aid) then raise exception 'Esta convocatoria no tiene personajes: agrégalos para usar la votación.'; end if;
  if p_dir = 'siguiente' then
    nueva := case a.fase
      when 'audicion' then case when a.con_callback then 'seleccion_callback' else 'votacion' end
      when 'seleccion_callback' then 'callback'
      when 'callback' then 'votacion'
      when 'votacion' then 'ajuste' end;
    if nueva is null then raise exception 'Para terminar, usa "Mandar" en el ajuste del cast.'; end if;
  elsif p_dir = 'anterior' then
    nueva := case a.fase
      when 'seleccion_callback' then 'audicion'
      when 'callback' then 'seleccion_callback'
      when 'votacion' then case when a.con_callback then 'callback' else 'audicion' end
      when 'ajuste' then 'votacion' end;
    if nueva is null then raise exception 'No se puede regresar desde aquí.'; end if;
  else
    raise exception 'Dirección no válida.';
  end if;

  if a.fase = 'seleccion_callback' and nueva = 'callback' then
    select array_agg(id) into pasan from audition_applications where audition_id = aid and estado = 'callback';
    if pasan is null then raise exception 'Marca primero quién pasa a callback.'; end if;
    update audition_applications set ronda = greatest(ronda, 2) where id = any(pasan);
    insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble)
    select application_id, judge_id, 2, opcion, role_id, ensamble from audition_picks
     where application_id = any(pasan) and ronda = 1
    on conflict do nothing;
    begin
      perform notify((select array_agg(user_id) from audition_applications where id = any(pasan) and user_id is not null),
        'audicion', '¡Pasaste a callback!', concat_ws(' · ', a.titulo, production_name(a.production_id)), '/cuenta', a.production_id);
    exception when others then null;
    end;
  end if;
  if nueva = 'ajuste' then perform _audition_propuesta(aid); end if;
  if a.fase = 'ajuste' and nueva = 'votacion' then delete from audition_cast where audition_id = aid; end if;

  update auditions set fase = nueva where id = aid;
  return nueva;
end $$;

create or replace function audition_cast_board(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r int := audition_ronda_voto(aid);
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  return json_build_object(
    'fase', (select fase from auditions where id = aid),
    'roles', coalesce((
      select json_agg(json_build_object(
        'id', ro.id, 'nombre', ro.nombre,
        'asignados', coalesce((
          select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null,
                                            'votos', (select count(*) from audition_votes v where v.role_id = ro.id and v.application_id = ap.id))
                          order by ap.numero nulls last, ap.nombre)
            from audition_cast c join audition_applications ap on ap.id = c.application_id
           where c.audition_id = aid and c.role_id = ro.id), '[]'::json),
        'pista', coalesce((
          select json_agg(json_build_object('id', q.app, 'nombre', q.nombre, 'votos', q.votos) order by q.votos desc, q.nombre)
            from (select v.application_id app, ap.nombre, count(*) votos
                    from audition_votes v join audition_applications ap on ap.id = v.application_id
                   where v.role_id = ro.id and v.application_id is not null
                     and not exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = v.application_id)
                   group by v.application_id, ap.nombre
                   order by count(*) desc limit 3) q), '[]'::json)
      ) order by ro.orden, ro.nombre)
        from audition_roles ro where ro.audition_id = aid), '[]'::json),
    'ensamble', coalesce((
      select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null)
                      order by ap.numero nulls last, ap.nombre)
        from audition_cast c join audition_applications ap on ap.id = c.application_id
       where c.audition_id = aid and c.role_id is null), '[]'::json),
    -- Los mismos que "Mandar" avisará: quien audicionó y no está en el cast. Primero los de la
    -- ronda de votación que algún juez marcó.
    'fuera', coalesce((
      select json_agg(json_build_object('id', ap.id, 'nombre', ap.nombre, 'numero', ap.numero, 'foto_path', ap.foto_path, 'cuenta', ap.user_id is not null)
                      order by (ap.ronda >= r) desc,
                               exists (select 1 from audition_picks k where k.application_id = ap.id and k.ronda = r) desc,
                               ap.numero nulls last, ap.nombre)
        from audition_applications ap join auditions a on a.id = ap.audition_id
       where ap.audition_id = aid and ap.estado not in ('cancelado', 'no_cumple', 'seleccionado')
         and (ap.checked_in_at is not null or a.modalidad <> 'presencial')
         and not exists (select 1 from audition_cast c where c.audition_id = aid and c.application_id = ap.id)), '[]'::json)
  );
end $$;

create or replace function audition_cast_move(aid uuid, app uuid, p_destino text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  if (select fase from auditions where id = aid) <> 'ajuste' then raise exception 'El cast solo se mueve durante el ajuste.'; end if;
  if not exists (select 1 from audition_applications where id = app and audition_id = aid) then raise exception 'Esa persona no es de esta convocatoria.'; end if;
  if p_destino = 'fuera' then
    delete from audition_cast where audition_id = aid and application_id = app;
  elsif p_destino = 'ensamble' then
    insert into audition_cast (audition_id, application_id, role_id) values (aid, app, null)
    on conflict (audition_id, application_id) do update set role_id = null;
  else
    if not exists (select 1 from audition_roles where id = p_destino::uuid and audition_id = aid) then raise exception 'Ese personaje no es de esta convocatoria.'; end if;
    insert into audition_cast (audition_id, application_id, role_id) values (aid, app, p_destino::uuid)
    on conflict (audition_id, application_id) do update set role_id = excluded.role_id;
  end if;
end $$;

create or replace function audition_cast_enviar(aid uuid, p_mensaje text default null, p_responder_antes timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare a auditions%rowtype; c record; enviadas int := 0; sin_cuenta int := 0; avisos int := 0; noquedaron uuid[];
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into a from auditions where id = aid for update;
  if a.fase <> 'ajuste' then raise exception 'Primero cierra la votación y revisa el cast.'; end if;
  if a.production_id is null then raise exception 'Esta convocatoria no es de una obra: no hay a dónde mandar ofertas.'; end if;
  if not has_perm(a.production_id, 'elenco.gestionar') then raise exception 'No tienes permiso para armar el elenco de esta obra.'; end if;
  if not exists (select 1 from audition_cast where audition_id = aid) then raise exception 'El cast está vacío.'; end if;

  for c in select ac.application_id, ac.role_id, ap.user_id, ro.nombre as papel
             from audition_cast ac join audition_applications ap on ap.id = ac.application_id
             left join audition_roles ro on ro.id = ac.role_id
            where ac.audition_id = aid loop
    if c.user_id is null then sin_cuenta := sin_cuenta + 1; continue; end if;
    if exists (select 1 from casting_offers o where o.application_id = c.application_id and o.production_id = a.production_id
                and o.estado in ('enviada', 'aceptada')
                and o.tipo = case when c.role_id is null then 'ensamble' else 'reparto' end
                and coalesce(o.papel, '') = coalesce(c.papel, '')) then continue; end if;
    insert into casting_offers (production_id, user_id, application_id, tipo, papel, mensaje, responder_antes)
    values (a.production_id, c.user_id, c.application_id, case when c.role_id is null then 'ensamble' else 'reparto' end,
            c.papel, left(nullif(btrim(p_mensaje), ''), 2000), p_responder_antes);
    enviadas := enviadas + 1;
  end loop;

  -- Quienes audicionaron en la ronda de votación y no quedaron.
  select array_agg(ap.id) into noquedaron
    from audition_applications ap
   where ap.audition_id = aid and ap.estado not in ('cancelado', 'no_cumple', 'seleccionado')
     and (ap.checked_in_at is not null or a.modalidad <> 'presencial')
     and not exists (select 1 from audition_cast c2 where c2.audition_id = aid and c2.application_id = ap.id);
  if noquedaron is not null then
    update audition_applications set estado = 'no_seleccionado' where id = any(noquedaron);
    select count(*) into avisos from audition_applications where id = any(noquedaron) and user_id is not null;
    begin
      perform notify((select array_agg(user_id) from audition_applications where id = any(noquedaron) and user_id is not null),
        'audicion', 'Gracias por audicionar',
        concat_ws(' · ', a.titulo, 'Esta vez no quedaste en el elenco. ¡Te esperamos en la próxima convocatoria!'), '/audiciones', a.production_id);
    exception when others then null;
    end;
  end if;

  update auditions set fase = 'enviado' where id = aid;
  return json_build_object('ofertas', enviadas, 'sin_cuenta', sin_cuenta, 'avisos', avisos);
end $$;

create or replace function notify_offer_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform notify(array[new.user_id], 'audicion', 'Tienes una oferta en ' || coalesce(production_name(new.production_id), 'DARF'),
      case when new.tipo = 'ensamble' then 'Ensamble' else coalesce(new.papel, '') end || ' · Respóndela en Mi cuenta', '/cuenta', new.production_id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_offer_sent after insert on casting_offers for each row execute function notify_offer_sent();

revoke execute on function _audition_propuesta(uuid), notify_invite(), notify_offer_sent(), audition_es_candidato(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function production_character_move(uuid, int), audition_import_characters(uuid), audition_role_move(uuid, int),
  audition_ronda_voto(uuid), audition_picks_set(uuid, int, jsonb), audition_vote(uuid, uuid, uuid), audition_voting(uuid),
  audition_fase(uuid, text), audition_cast_board(uuid), audition_cast_move(uuid, uuid, text), audition_cast_enviar(uuid, text, timestamptz)
  from public, anon;
grant execute on function production_character_move(uuid, int), audition_import_characters(uuid), audition_role_move(uuid, int),
  audition_ronda_voto(uuid), audition_picks_set(uuid, int, jsonb), audition_vote(uuid, uuid, uuid), audition_voting(uuid),
  audition_fase(uuid, text), audition_cast_board(uuid), audition_cast_move(uuid, uuid, text), audition_cast_enviar(uuid, text, timestamptz)
  to authenticated;


commit;
