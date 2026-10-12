-- 0080: gafete con jerarquía y credencial del Club Fan con QR (Diego 2026-10-12).
--   * Gafete: sale el rol más alto y sin el nombre de la obra. Primero el cargo en DARF
--     (team_members.cargo, 0063: "CEO" gana a "Dirección artística" de una obra); luego los roles
--     de obra por jerarquía; el elenco solo dice "Elenco". badge_mio / badge_publico ya no
--     devuelven obra ni temporada (la web pone "DARF Productions · año").
--   * Credencial Club Fan: token (va en el QR como /f/<token>) y código corto FAN-XXXX, como el
--     gafete. Página pública de verificación (fan_publico): nombre corto y número, nada de contacto.
--   * Eventos Club Fan: fan_encuentros ya no es solo "Foto con el elenco" (tipo 'foto', con función):
--     también 'evento' con título, fecha, lugar y descripción; con o sin registro y con o sin
--     boleto. En la entrada se escanea la credencial (fan_checkin) y se marca la llegada.
-- Precede: 0079.

begin;

-- ════════ Gafete: jerarquía ════════

create or replace function badge_puede(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol in ('staff', 'admin'))
      or exists (select 1 from team_members tm join people pe on pe.id = tm.person_id where pe.profile_id = uid)
      or exists (select 1 from production_members where user_id = uid)
      or exists (select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid and c.activo)
$$;

-- Papel del gafete: el más alto, sin obra.
--   1 cargo en DARF (STAFF) · 2 Director/staff de la app sin cargo (STAFF, con su rol de obra más
--   alto o "Dirección general"/"Producción") · 3 Producción / Dirección artística de una obra ·
--   4 crédito creativo · 5 crédito de producción · 6 otro rol de obra · 7 crew o técnico ·
--   8 elenco ("Elenco"). Dentro de cada nivel, la obra activa más reciente.
create or replace function badge_papel(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare rol_app text; v_cargo text; v_nivel int; v_papel text;
begin
  select rol into rol_app from profiles where id = uid;
  select tm.cargo into v_cargo
    from team_members tm join people pe on pe.id = tm.person_id
   where pe.profile_id = uid
   order by tm.orden, tm.created_at limit 1;
  if v_cargo is not null then
    return json_build_object('franja', 'staff', 'papel', v_cargo);
  end if;

  select x.nivel, x.papel into v_nivel, v_papel from (
    select case when m.role_id in ('productor', 'direccion') then 3 when m.role_id = 'integrante' then 8 else 6 end as nivel,
           case when m.role_id = 'integrante' then 'Elenco' else r.nombre end as papel,
           r.orden as sub, p.concluded, p.created_at
      from production_members m
      join panel_roles r on r.id = m.role_id
      join productions p on p.id = m.production_id
     where m.user_id = uid
    union all
    select case c.tipo when 'creativo' then 4 when 'produccion' then 5 when 'crew' then 7 when 'tecnico' then 7 else 8 end,
           case when c.tipo in ('reparto', 'ensamble') then 'Elenco' else coalesce(nullif(btrim(c.papel), ''), 'Equipo') end,
           c.orden, p.concluded, p.created_at
      from production_credits c
      join people pe on pe.id = c.person_id
      join productions p on p.id = c.production_id
     where pe.profile_id = uid and c.activo
  ) x
  order by x.nivel, x.concluded, x.created_at desc, x.sub
  limit 1;

  if rol_app in ('admin', 'staff') then
    return json_build_object('franja', 'staff',
      'papel', case when v_nivel between 3 and 7 then v_papel when rol_app = 'admin' then 'Dirección general' else 'Producción' end);
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case when v_nivel = 8 then 'elenco' else 'equipo' end, 'papel', v_papel);
end $$;
revoke execute on function badge_puede(uuid), badge_papel(uuid) from public, anon, authenticated;

create or replace function badge_mio() returns json
language plpgsql security definer set search_path = public as $$
declare b badges; papel json;
begin
  if auth.uid() is null or not badge_puede(auth.uid()) then return null; end if;
  papel := badge_papel(auth.uid());
  if papel is null then return null; end if;
  select * into b from badges where user_id = auth.uid();
  if not found then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo()) returning * into b;
  end if;
  return json_build_object('token', b.token, 'codigo', b.codigo,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil,
    'franja', papel->>'franja', 'papel', papel->>'papel');
end $$;

create or replace function badge_publico(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare b badges; pr profiles; persona people; pro pro_profiles; papel json; menor boolean; correo text;
begin
  select * into b from badges where token = p_token;
  if not found or not badge_puede(b.user_id) then return null; end if;
  papel := badge_papel(b.user_id);
  if papel is null then return null; end if;
  select * into pr from profiles where id = b.user_id;
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (current_date - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel',
    'retrato_path', case when pro.person_id is not null and pro_is_public(pro.person_id) then pro.retrato_path end,
    'telefono', case when b.compartir_telefono and not menor then pr.telefono end,
    'correo', case when b.compartir_correo and not menor then correo end,
    'instagram', case when b.compartir_instagram then pro.instagram end,
    'perfil', case when b.compartir_perfil and pro.person_id is not null and pro_is_public(pro.person_id) then pro.slug end);
end $$;

-- ════════ Credencial del Club Fan ════════

alter table fan_members
  add column token text unique check (char_length(token) >= 24),
  add column codigo text unique check (codigo ~ '^FAN-[2-9A-HJ-NP-Z]{4}$');

create or replace function fan_nuevo_codigo() returns text language plpgsql volatile set search_path = public as $$
declare alfabeto text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; c text;
begin
  loop
    c := 'FAN-' || (select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from fan_members where codigo = c);
  end loop;
  return c;
end $$;

do $$ declare r record; begin
  for r in select user_id from fan_members order by numero loop
    update fan_members set token = badge_nuevo_token(), codigo = fan_nuevo_codigo() where user_id = r.user_id;
  end loop;
end $$;

create or replace function fan_members_credencial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.token := coalesce(new.token, badge_nuevo_token());
  new.codigo := coalesce(new.codigo, fan_nuevo_codigo());
  return new;
end $$;
create trigger fan_members_credencial before insert on fan_members for each row execute function fan_members_credencial();
alter table fan_members alter column token set not null, alter column codigo set not null;
revoke execute on function fan_nuevo_codigo(), fan_members_credencial() from public, anon, authenticated;

create or replace function fan_join() returns json
language plpgsql security definer set search_path = public as $$
declare m fan_members;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  insert into fan_members (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into m from fan_members where user_id = auth.uid();
  return json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100, 'token', m.token, 'codigo', m.codigo);
end $$;

create or replace function fan_me() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('numero', numero, 'desde', created_at, 'fundador', numero <= 100, 'token', token, 'codigo', codigo)
    from fan_members where user_id = auth.uid()
$$;

-- Si se pierde o se comparte de más: credencial nueva (la anterior deja de servir).
create or replace function fan_regenerar() returns void
language plpgsql security definer set search_path = public as $$
begin
  update fan_members set token = badge_nuevo_token(), codigo = fan_nuevo_codigo() where user_id = auth.uid();
end $$;
revoke execute on function fan_regenerar() from public, anon;
grant execute on function fan_regenerar() to authenticated;

-- Lo que ve quien escanea la credencial con su celular: nombre corto y número. Nada de contacto.
create or replace function fan_publico(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'nombre', btrim(coalesce(nullif(btrim(p.nombres), ''), split_part(btrim(coalesce(p.nombre, '')), ' ', 1)) || ' ' ||
                    coalesce(left(nullif(btrim(coalesce(nullif(btrim(p.apellidos), ''), nullif(split_part(btrim(coalesce(p.nombre, '')), ' ', 2), ''))), ''), 1) || '.', '')),
    'numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100)
    from fan_members m left join profiles p on p.id = m.user_id
   where m.token = p_token
$$;
revoke execute on function fan_publico(text) from public;
grant execute on function fan_publico(text) to anon, authenticated;

-- ════════ Eventos del Club Fan ════════

alter table fan_encuentros
  alter column performance_id drop not null,
  add column tipo text not null default 'foto' check (tipo in ('foto', 'evento')),
  add column titulo text check (char_length(titulo) <= 120),
  add column descripcion text check (char_length(descripcion) <= 600),
  add column lugar text check (char_length(lugar) <= 160),
  add column inicia timestamptz,
  add column requiere_registro boolean not null default true,
  add column requiere_boleto boolean not null default true;
alter table fan_encuentros
  add constraint fan_encuentros_tipo_ok check (
    (tipo = 'foto' and performance_id is not null)
    or (tipo = 'evento' and inicia is not null and nullif(btrim(titulo), '') is not null)),
  add constraint fan_encuentros_boleto_ok check (performance_id is not null or not requiere_boleto);
-- Una sola foto con el elenco por función; los eventos pueden ligarse a una función o no.
alter table fan_encuentros drop constraint fan_encuentros_performance_id_key;
create unique index fan_encuentros_foto_funcion on fan_encuentros (performance_id) where tipo = 'foto';

alter table fan_encuentro_lugares
  add column llegada_at timestamptz,
  add column marcado_por uuid references auth.users(id) on delete set null;

-- Quien está en la puerta también ve los eventos (para validar credenciales).
create policy fan_encuentros_puerta on fan_encuentros for select to authenticated
  using (has_perm(production_id, 'puerta.validar'));

drop function fan_encuentros_lista(text);
create function fan_encuentros_lista(pid text default null)
returns table (id uuid, production_id text, performance_id uuid, tipo text, titulo text, descripcion text, lugar text,
               starts_at timestamptz, venue text, cupo int, libres int, abierto boolean, notas text,
               requiere_registro boolean, requiere_boleto boolean, apartado boolean, con_boleto boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, e.performance_id, e.tipo, e.titulo, e.descripcion, e.lugar,
         coalesce(pf.starts_at, e.inicia), coalesce(e.lugar, pf.venue, pr.venue), e.cupo,
         greatest(0, e.cupo - (select count(*) from fan_encuentro_lugares l where l.encuentro_id = e.id))::int,
         e.abierto, e.notas, e.requiere_registro, e.requiere_boleto,
         exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()),
         not e.requiere_boleto or e.performance_id is null
           or exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado')
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    join productions pr on pr.id = e.production_id
   where is_fan_member() and production_is_visible(e.production_id)
     and coalesce(pf.starts_at, e.inicia) > now()
     and (pid is null or e.production_id = pid)
   order by coalesce(pf.starts_at, e.inicia)
$$;
revoke execute on function fan_encuentros_lista(text) from public, anon;
grant execute on function fan_encuentros_lista(text) to authenticated;

create or replace function fan_encuentro_apartar(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; t timestamptz; usados int;
begin
  if not is_fan_member() then raise exception 'Únete al Club Fan para apartar tu lugar.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found or not production_is_visible(e.production_id) then raise exception 'Este evento no existe.'; end if;
  if not p_on then
    delete from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid() and llegada_at is null;
    return;
  end if;
  if not e.requiere_registro then raise exception 'Este evento no necesita registro: solo muestra tu credencial en la entrada.'; end if;
  t := coalesce((select starts_at from performances where id = e.performance_id), e.inicia);
  if t is null or t <= now() then raise exception 'Este evento ya pasó.'; end if;
  if not e.abierto then raise exception 'El registro para este evento está cerrado.'; end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado') then
    raise exception 'Necesitas un boleto aprobado para esta función.';
  end if;
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return; end if;
  select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
  if usados >= e.cupo then raise exception 'Ya no hay lugares para este evento.'; end if;
  insert into fan_encuentro_lugares (encuentro_id, user_id) values (eid, auth.uid());
end $$;

drop function fan_encuentro_personas(uuid);
create function fan_encuentro_personas(eid uuid)
returns table (user_id uuid, nombre text, telefono text, numero int, created_at timestamptz, llegada_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, coalesce(p.nombre, ''), p.telefono, m.numero, l.created_at, l.llegada_at
    from fan_encuentro_lugares l
    join fan_encuentros e on e.id = l.encuentro_id
    left join profiles p on p.id = l.user_id
    left join fan_members m on m.user_id = l.user_id
   where l.encuentro_id = eid and (has_perm(e.production_id, 'fanzone.editar') or has_perm(e.production_id, 'puerta.validar'))
   order by l.llegada_at nulls last, l.created_at
$$;
revoke execute on function fan_encuentro_personas(uuid) from public, anon;
grant execute on function fan_encuentro_personas(uuid) to authenticated;

-- Validar la credencial en la entrada (QR con /f/<token>, el token solo o el código FAN-XXXX).
create or replace function fan_checkin(eid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; entrada text; m fan_members; l fan_encuentro_lugares; nombre text; foto text; usados int; base json;
begin
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Ese evento no existe.'; end if;
  if not (has_perm(e.production_id, 'fanzone.editar') or has_perm(e.production_id, 'puerta.validar')) then
    raise exception 'No tienes permiso para validar credenciales en esta obra.';
  end if;
  entrada := btrim(coalesce(p_code, ''));
  if entrada ~ '/f/' then entrada := split_part(split_part(entrada, '/f/', 2), '?', 1); end if;
  if upper(entrada) ~ '^FAN-[2-9A-HJ-NP-Z]{4}$' then
    select * into m from fan_members where codigo = upper(entrada);
  else
    select * into m from fan_members where token = entrada;
  end if;
  if not found then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = m.user_id;
  base := json_build_object('user_id', m.user_id, 'nombre', nombre, 'foto_path', foto, 'numero', m.numero, 'fundador', m.numero <= 100);
  select * into l from fan_encuentro_lugares where encuentro_id = eid and user_id = m.user_id;
  if found and l.llegada_at is not null then
    return (base::jsonb || jsonb_build_object('resultado', 'ya', 'llegada', l.llegada_at))::json;
  end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = m.user_id and o.status = 'aprobado') then
    return (base::jsonb || jsonb_build_object('resultado', 'sin_boleto'))::json;
  end if;
  if l.user_id is null then
    if e.requiere_registro then return (base::jsonb || jsonb_build_object('resultado', 'sin_lugar'))::json; end if;
    select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
    if usados >= e.cupo then return (base::jsonb || jsonb_build_object('resultado', 'lleno'))::json; end if;
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at, marcado_por) values (eid, m.user_id, now(), auth.uid());
  else
    update fan_encuentro_lugares set llegada_at = now(), marcado_por = auth.uid() where encuentro_id = eid and user_id = m.user_id;
  end if;
  return (base::jsonb || jsonb_build_object('resultado', 'ok', 'llegada', now()))::json;
end $$;
revoke execute on function fan_checkin(uuid, text) from public, anon;
grant execute on function fan_checkin(uuid, text) to authenticated;

commit;
