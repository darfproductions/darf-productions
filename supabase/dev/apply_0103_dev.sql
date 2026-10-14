-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base oficial de la 2.0).
-- 0103: DARF Loyalty (medalla por número de producciones). Requiere 0102.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.casa_members') is null then
    raise exception 'ABORTADO: primero corre apply_0102_dev.sql.';
  end if;
end $$;

create or replace function lealtad_producciones(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct x.pid)::int from (
    select pm.production_id as pid from production_members pm where pm.user_id = uid
    union
    select pc.production_id from production_credits pc join people pe on pe.id = pc.person_id
     where pe.profile_id = uid and pc.activo
  ) x join productions p on p.id = x.pid
  where uid is not null and p.estado <> 'cancelada';
$$;
revoke all on function lealtad_producciones(uuid) from public, anon, authenticated;

-- La credencial lleva el número ('lealtad').
CREATE OR REPLACE FUNCTION public.credencial_de(uid uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; m fan_members; nivel text; papel json;
begin
  select * into b from badges where user_id = uid;
  if not found then return null; end if;
  select * into m from fan_members where user_id = uid;
  nivel := credencial_nivel(uid);
  papel := case when nivel = 'equipo' then badge_papel(uid) end;
  return json_build_object(
    'token', b.token, 'codigo', b.codigo, 'nivel', nivel, 'desde', (select created_at from profiles where id = uid),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(uid),
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil);
end $function$;

CREATE OR REPLACE FUNCTION public.badge_publico(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; pr profiles; persona people; pro pro_profiles; papel json; menor boolean; correo text; m fan_members; nivel text; corto text;
begin
  select * into b from badges where token = p_token;
  if not found then return null; end if;
  select * into pr from profiles where id = b.user_id;
  select * into m from fan_members where user_id = b.user_id;
  nivel := credencial_nivel(b.user_id);
  corto := btrim(coalesce(nullif(btrim(pr.nombres), ''), split_part(btrim(coalesce(pr.nombre, '')), ' ', 1)) || ' ' ||
           coalesce(left(nullif(btrim(coalesce(nullif(btrim(pr.apellidos), ''), nullif(split_part(btrim(coalesce(pr.nombre, '')), ' ', 2), ''))), ''), 1) || '.', ''));
  if nivel <> 'equipo' then
    return json_build_object('nivel', nivel, 'nombre', corto, 'lealtad', lealtad_producciones(b.user_id),
      'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end);
  end if;
  papel := badge_papel(b.user_id);
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (hoy_mx() - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nivel', 'equipo', 'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(b.user_id),
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'retrato_path', case when pro.person_id is not null and pro_is_public(pro.person_id) then pro.retrato_path end,
    'telefono', case when b.compartir_telefono and not menor then pr.telefono end,
    'correo', case when b.compartir_correo and not menor then correo end,
    'instagram', case when b.compartir_instagram then pro.instagram end,
    'perfil', case when b.compartir_perfil and pro.person_id is not null and pro_is_public(pro.person_id) then pro.slug end);
end $function$;

CREATE OR REPLACE FUNCTION public.badge_mio()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(auth.uid()));
end $function$;

-- Las credenciales de Wallet de quien ya tiene medalla se vuelven a dibujar con ella.
select wallet_marcar_cuentas(array(select user_id from badges where lealtad_producciones(user_id) >= 3));
commit;
select 'Listo 0103. DARF Loyalty: ' || count(*) filter (where lealtad_producciones(id) >= 3) || ' personas ya tienen medalla' as resultado
from profiles;
