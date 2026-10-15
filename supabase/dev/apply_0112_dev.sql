-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0112: host de audición (entrevista), personajes por crédito (los dobles se separan), teatros guardados, base
-- del Club Fan y medidas de vestuario completas. Requiere 0111. Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.cuentas_empresa') is null then
    raise exception 'ABORTADO: primero corre apply_0111_dev.sql.';
  end if;
end $$;
begin;

-- ════════ 1. Host de audición ════════
insert into permissions (id, grupo, descripcion, orden) values
  ('audiciones.entrevista', 'Audiciones', 'Entrevista del día (host): preguntas de entrada a cada aspirante', 23)
on conflict (id) do nothing;

alter table panel_roles disable trigger panel_roles_protect;
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria) values
  ('host', 'Host de audición', 'Recibe a los aspirantes y les hace las preguntas de entrada; lo anota en su expediente', true, 4, 'staff')
on conflict (id) do nothing;
alter table panel_roles enable trigger panel_roles_protect;
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values
  ('host', 'audiciones.entrevista'),
  ('direccion', 'audiciones.entrevista'),
  ('productor', 'audiciones.entrevista'),
  ('direccion_general', 'audiciones.entrevista')
on conflict do nothing;
alter table role_permissions enable trigger role_permissions_protect;

alter table auditions add column if not exists preguntas_entrevista text[] not null
  default array['Experiencia', '¿Por qué personaje audiciona?', '¿Por qué decidió audicionar?'];
alter table audition_applications add column if not exists entrevista jsonb not null default '[]';
alter table audition_applications add column if not exists entrevista_extra text check (length(entrevista_extra) <= 2000);
alter table audition_applications add column if not exists entrevista_por uuid references auth.users(id) on delete set null;
alter table audition_applications add column if not exists entrevista_at timestamptz;

-- El host ve la lista del día (sin datos de contacto).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.audition_day_list(uuid)'::regprocedure);
  def := replace(def, $q$if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then$q$,
                      $q$if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar') or audition_perm(aid, 'audiciones.entrevista')) then$q$);
  execute def;
end $$;

-- Lista del host: quién ya tiene entrevista (sin datos de contacto).
create or replace function audition_entrevistas_lista(aid uuid)
returns table (id uuid, numero int, nombre text, es_menor boolean, llego boolean, entro boolean, termino boolean, hecha boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select a.id, a.numero, a.nombre, a.es_menor, a.checked_in_at is not null, a.entered_at is not null, a.finished_at is not null,
           a.entrevista_at is not null
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.estado <> 'cancelado'
     order by a.numero nulls last, s.inicia nulls last, a.created_at;
end $$;
revoke all on function audition_entrevistas_lista(uuid) from public, anon;
grant execute on function audition_entrevistas_lista(uuid) to authenticated;

-- Entrevista de un aspirante: preguntas de la convocatoria y lo que ya se anotó.
create or replace function audition_entrevista(app uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a audition_applications; au auditions;
begin
  select * into a from audition_applications where id = app;
  if not found then raise exception 'No se encontró.'; end if;
  if not (audition_perm(a.audition_id, 'audiciones.entrevista') or audition_perm(a.audition_id, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = a.audition_id;
  return json_build_object(
    'id', a.id, 'audition_id', a.audition_id, 'numero', a.numero, 'nombre', a.nombre, 'es_menor', a.es_menor,
    'personajes', (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
    'preguntas', au.preguntas_entrevista, 'entrevista', a.entrevista, 'extra', a.entrevista_extra,
    'por', (select coalesce(nullif(btrim(p.nombre), ''), 'Equipo') from profiles p where p.id = a.entrevista_por),
    'at', a.entrevista_at);
end $$;
revoke all on function audition_entrevista(uuid) from public, anon;
grant execute on function audition_entrevista(uuid) to authenticated;

-- Guardar: [{pregunta, respuesta}] en el orden de la convocatoria, más el espacio adicional.
create or replace function audition_entrevista_guardar(app uuid, p_respuestas jsonb, p_extra text) returns void
language plpgsql security definer set search_path = public as $$
declare a audition_applications;
begin
  select * into a from audition_applications where id = app;
  if not found then raise exception 'No se encontró.'; end if;
  if not (audition_perm(a.audition_id, 'audiciones.entrevista') or audition_perm(a.audition_id, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(coalesce(p_respuestas, '[]')) <> 'array' or jsonb_array_length(coalesce(p_respuestas, '[]')) > 30 then
    raise exception 'Respuestas no válidas.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_respuestas, '[]')) e
              where length(coalesce(e->>'respuesta', '')) > 2000 or length(coalesce(e->>'pregunta', '')) > 200) then
    raise exception 'Una respuesta es demasiado larga (máximo 2000 letras).';
  end if;
  update audition_applications
     set entrevista = (select coalesce(jsonb_agg(jsonb_build_object('pregunta', btrim(e->>'pregunta'), 'respuesta', btrim(e->>'respuesta'))), '[]')
                         from jsonb_array_elements(coalesce(p_respuestas, '[]')) e
                        where coalesce(btrim(e->>'respuesta'), '') <> ''),
         entrevista_extra = nullif(btrim(coalesce(p_extra, '')), ''),
         entrevista_por = auth.uid(), entrevista_at = now()
   where id = app;
end $$;
revoke all on function audition_entrevista_guardar(uuid, jsonb, text) from public, anon;
grant execute on function audition_entrevista_guardar(uuid, jsonb, text) to authenticated;

-- La ficha de talento muestra la entrevista en su historial de audiciones.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.talent_history(uuid)'::regprocedure);
  if position('''entrevista''' in def) = 0 then
    def := replace(def, $q$'llego', a.checked_in_at,$q$, $q$'llego', a.checked_in_at, 'entrevista', a.entrevista, 'entrevista_extra', a.entrevista_extra,$q$);
    execute def;
  end if;
end $$;

-- ════════ 2. Personajes por crédito ════════
create table if not exists credit_characters (
  credit_id uuid not null references production_credits(id) on delete cascade,
  character_id uuid not null references production_characters(id) on delete cascade,
  primary key (credit_id, character_id)
);
alter table credit_characters enable row level security;
drop policy if exists credit_characters_read on credit_characters;
create policy credit_characters_read on credit_characters for select
  using (exists (select 1 from production_credits c where c.id = credit_id
                  and (production_is_visible(c.production_id) or in_production_team(c.production_id))));

-- El texto del crédito sale de sus personajes, en el orden de la lista ("Phineas / Barnum").
-- Si se quedó sin personajes ligados, conserva el texto que tenía.
create or replace function credito_papel_recalc(p_credit uuid) returns void
language sql security definer set search_path = public as $$
  update production_credits c
     set papel = x.papel
    from (select string_agg(pc.nombre, ' / ' order by pc.orden, pc.created_at) as papel
            from credit_characters cc join production_characters pc on pc.id = cc.character_id
           where cc.credit_id = p_credit) x
   where c.id = p_credit and x.papel is not null and c.papel is distinct from x.papel
$$;
revoke all on function credito_papel_recalc(uuid) from public, anon, authenticated;

create or replace function credit_characters_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform credito_papel_recalc(coalesce(new.credit_id, old.credit_id));
  return null;
end $$;
drop trigger if exists credit_characters_cambio on credit_characters;
create trigger credit_characters_cambio after insert or delete on credit_characters
  for each row execute function credit_characters_cambio();

-- Renombrar o reordenar un personaje actualiza los créditos que lo tienen.
create or replace function personaje_cambio_creditos() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if new.nombre is not distinct from old.nombre and new.orden is not distinct from old.orden then return null; end if;
  for cid in select credit_id from credit_characters where character_id = new.id loop
    perform credito_papel_recalc(cid);
  end loop;
  return null;
end $$;
drop trigger if exists personaje_cambio_creditos on production_characters;
create trigger personaje_cambio_creditos after update of nombre, orden on production_characters
  for each row execute function personaje_cambio_creditos();

-- Elegir los personajes de un crédito (Reparto).
create or replace function credito_personajes(p_credit uuid, p_chars uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare c production_credits;
begin
  select * into c from production_credits where id = p_credit;
  if not found then raise exception 'No se encontró.'; end if;
  if not (has_perm(c.production_id, 'elenco.gestionar') or has_perm(c.production_id, 'obra.editar')) then raise exception 'No autorizado'; end if;
  if coalesce(cardinality(p_chars), 0) = 0 then raise exception 'Elige al menos un personaje.'; end if;
  if exists (select 1 from unnest(p_chars) x where not exists (select 1 from production_characters pc where pc.id = x and pc.production_id = c.production_id)) then
    raise exception 'Ese personaje no es de esta obra.';
  end if;
  delete from credit_characters where credit_id = p_credit and character_id <> all(p_chars);
  insert into credit_characters (credit_id, character_id) select p_credit, x from unnest(p_chars) x on conflict do nothing;
  perform credito_papel_recalc(p_credit);
end $$;
revoke all on function credito_personajes(uuid, uuid[]) from public, anon;
grant execute on function credito_personajes(uuid, uuid[]) to authenticated;

-- Lo que ya había: los personajes dobles de la lista ("O'Malia / Reina de Inglaterra") se separan en dos, uno
-- tras otro en el mismo lugar (el primero conserva su id y lo que ya lo usa, como las audiciones).
do $$
declare pid text; r record; partes text[]; k int; pos int;
begin
  for pid in select distinct production_id from production_characters where nombre like '%/%' loop
    pos := 0;
    for r in select * from production_characters where production_id = pid order by orden, created_at loop
      partes := array(select btrim(x) from regexp_split_to_table(r.nombre, '\s*/\s*') x where btrim(x) <> '');
      pos := pos + 1;
      if cardinality(partes) < 2 then
        update production_characters set orden = pos where id = r.id;
        continue;
      end if;
      update production_characters set nombre = partes[1], orden = pos where id = r.id;
      for k in 2 .. cardinality(partes) loop
        if not exists (select 1 from production_characters where production_id = pid and lower(nombre) = lower(partes[k])) then
          pos := pos + 1;
          insert into production_characters (production_id, nombre, orden) values (pid, partes[k], pos);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Y cada crédito de Reparto con "A / B" se liga a sus personajes (se crean los que falten).
do $$
declare r record; parte text; ch uuid; k int;
begin
  for r in select c.id, c.production_id, c.papel from production_credits c
            where c.tipo = 'reparto' and coalesce(btrim(c.papel), '') <> ''
              and not exists (select 1 from credit_characters x where x.credit_id = c.id)
            order by c.production_id, c.orden, c.id loop
    k := 0;
    foreach parte in array regexp_split_to_array(r.papel, '\s*/\s*') loop
      parte := btrim(parte);
      continue when parte = '' or length(parte) > 80;
      ch := null;
      select id into ch from production_characters where production_id = r.production_id and lower(nombre) = lower(parte) limit 1;
      if ch is null then
        insert into production_characters (production_id, nombre, orden)
        values (r.production_id, parte, coalesce((select max(orden) from production_characters where production_id = r.production_id), 0) + 1)
        returning id into ch;
      end if;
      insert into credit_characters (credit_id, character_id) values (r.id, ch) on conflict do nothing;
      k := k + 1;
    end loop;
  end loop;
end $$;

-- ════════ 3. Teatros guardados ════════
create table if not exists teatros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  asientos jsonb not null,
  zonas jsonb not null default '[]',
  total int not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists teatros_nombre_key on teatros (lower(btrim(nombre)));
alter table teatros enable row level security;
-- Se leen y escriben por las funciones de abajo.

create or replace function maneja_funciones() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or has_casa('casa.producciones')
      or exists (select 1 from my_panel_access() where permission_id = 'funciones.gestionar')
$$;

create or replace function teatros_lista() returns table (id uuid, nombre text, total int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not maneja_funciones() then raise exception 'No autorizado'; end if;
  return query select t.id, t.nombre, t.total, t.created_at from teatros t order by lower(t.nombre);
end $$;
revoke all on function teatros_lista() from public, anon;
grant execute on function teatros_lista() to authenticated;

-- Guarda el mapa de una obra como teatro (si el nombre ya existe, lo actualiza).
create or replace function teatro_guardar(pid text, p_nombre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_asientos jsonb; v_zonas jsonb; n int; tid uuid;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'Escribe el nombre del teatro.'; end if;
  select jsonb_agg(jsonb_build_object('fila', s.seat_row, 'numero', s.seat_number, 'lado', s.lado, 'seccion', s.section,
                   'etiqueta', s.seat_label, 'activo', s.is_active, 'zona', pc.nombre)), count(*)
    into v_asientos, n
    from seats s left join price_categories pc on pc.id = s.price_category_id
   where s.production_id = pid and s.seat_number is not null and s.lado is not null;
  if coalesce(n, 0) = 0 then raise exception 'Esta obra todavía no tiene mapa de asientos.'; end if;
  select coalesce(jsonb_agg(distinct jsonb_build_object('nombre', pc.nombre, 'descripcion', pc.descripcion, 'color', pc.color)), '[]')
    into v_zonas
    from seats s join price_categories pc on pc.id = s.price_category_id where s.production_id = pid;
  select id into tid from teatros where lower(btrim(nombre)) = lower(btrim(p_nombre));
  if tid is null then
    insert into teatros (nombre, asientos, zonas, total, creado_por) values (btrim(p_nombre), v_asientos, v_zonas, n, auth.uid()) returning id into tid;
  else
    update teatros set asientos = v_asientos, zonas = v_zonas, total = n, creado_por = auth.uid(), created_at = now() where id = tid;
  end if;
  insert into audit_log (tabla, accion, production_id, despues)
  values ('seats', 'guardar_teatro', pid, jsonb_build_object('teatro', btrim(p_nombre), 'asientos', n));
  return tid;
end $$;
revoke all on function teatro_guardar(text, text) from public, anon;
grant execute on function teatro_guardar(text, text) to authenticated;

-- Usa un teatro guardado como mapa de una obra (mismas reglas que copiar el mapa de otra obra).
create or replace function teatro_usar(tid uuid, destino text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t teatros; lista jsonb; n int;
begin
  if not has_perm(destino, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into t from teatros where id = tid;
  if not found then raise exception 'Ese teatro no existe.'; end if;
  if seat_map_has_tickets(destino) then
    raise exception 'Esta obra ya tiene boletos con asiento: el mapa ya no se puede reemplazar.';
  end if;
  insert into price_categories (production_id, nombre, descripcion, color)
  select destino, z->>'nombre', z->>'descripcion', z->>'color' from jsonb_array_elements(t.zonas) z
  on conflict (production_id, nombre) do nothing;
  if exists (select 1 from jsonb_array_elements(t.zonas) z join price_categories d on d.production_id = destino and d.nombre = z->>'nombre'
              where d.cupo is not null) then
    raise exception 'Una zona del teatro se llama igual que una zona de entrada general de esta obra.';
  end if;
  select jsonb_agg(a - 'zona' || jsonb_build_object('zona',
           (select d.id from price_categories d where d.production_id = destino and d.nombre = a->>'zona')))
    into lista from jsonb_array_elements(t.asientos) a;
  n := seat_map_write(destino, coalesce(lista, '[]'));
  insert into audit_log (tabla, accion, production_id, despues)
  values ('seats', 'usar_teatro', destino, jsonb_build_object('teatro', t.nombre, 'asientos', n));
  return jsonb_build_object('asientos', n);
end $$;
revoke all on function teatro_usar(uuid, text) from public, anon;
grant execute on function teatro_usar(uuid, text) to authenticated;

create or replace function teatro_borrar(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or has_casa('casa.producciones') or exists (select 1 from teatros where id = tid and creado_por = auth.uid())) then
    raise exception 'Solo quien lo guardó o Casa DARF (Producciones) puede borrarlo.';
  end if;
  delete from teatros where id = tid;
end $$;
revoke all on function teatro_borrar(uuid) from public, anon;
grant execute on function teatro_borrar(uuid) to authenticated;

-- ════════ 4. Base del Club Fan ════════
create or replace function club_socios() returns table (
  user_id uuid, numero int, desde timestamptz, nombre text, email text, telefono text, fecha_nacimiento date,
  producciones int, visitas int, compras int, boletos int, gastado numeric, ultima_compra timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_casa('casa.club') then raise exception 'No autorizado'; end if;
  return query
    select f.user_id, f.numero::int, f.created_at,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           u.email::text, pr.telefono, pr.fecha_nacimiento,
           lealtad_producciones(f.user_id), fan_visitas(f.user_id),
           (select count(*)::int from orders o where o.buyer_user_id = f.user_id and o.status = 'aprobado'),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id
             where o.buyer_user_id = f.user_id and o.status = 'aprobado' and t.is_active),
           (select coalesce(sum(o.total), 0) from orders o where o.buyer_user_id = f.user_id and o.status = 'aprobado'),
           (select max(o.created_at) from orders o where o.buyer_user_id = f.user_id and o.status = 'aprobado')
      from fan_members f
      join auth.users u on u.id = f.user_id
      left join profiles pr on pr.id = f.user_id
      left join people pe on pe.profile_id = f.user_id
     order by f.numero;
end $$;
revoke all on function club_socios() from public, anon;
grant execute on function club_socios() to authenticated;

-- ════════ 5. Medidas de vestuario (tabla de DARF) ════════
-- Ya existían altura, busto/tórax (pecho_cm), cintura y cadera; en centímetros.
do $$
declare c text;
begin
  foreach c in array array['cuello_cm', 'abdomen_cm', 'brazo_cm', 'muneca_cm', 'talle_espalda_cm', 'altura_busto_cm', 'bajo_busto_cm',
                           'talle_delantero_cm', 'altura_cadera_cm', 'altura_cervical_cm', 'largo_manga_cm', 'largo_falda_cm',
                           'largo_pantalon_cm', 'entrepierna_cm', 'bajada_cadera_cm'] loop
    execute format('alter table person_files add column if not exists %I numeric(5,1)', c);
    execute format('alter table person_files drop constraint if exists %I', 'person_files_' || c || '_check');
    execute format('alter table person_files add constraint %I check (%I between 1 and 250)', 'person_files_' || c || '_check', c);
  end loop;
end $$;

commit;

select 'Listo 0112. Personajes: ' || (select count(*) from production_characters)
    || ' · créditos ligados a personajes: ' || (select count(distinct credit_id) from credit_characters)
    || ' · rol Host: ' || (select count(*) from panel_roles where id = 'host') as resultado;
