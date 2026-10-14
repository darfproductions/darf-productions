-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base oficial de la 2.0).
-- 0104: medalla de fans (funciones + eventos a los que entró). Requiere 0103.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.lealtad_producciones(uuid)') is null then
    raise exception 'ABORTADO: primero corre apply_0103_dev.sql.';
  end if;
end $$;
create or replace function fan_visitas(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct v.clave)::int from (
    -- Funciones: algún boleto de sus órdenes aprobadas entró por la puerta.
    select 'f:' || t.performance_id::text as clave
      from tickets t join orders o on o.id = t.order_id
     where o.buyer_user_id = uid and o.status = 'aprobado' and t.checked_in_at is not null
    union all
    -- Eventos a los que llegó: los de una función cuentan como esa función.
    select case when e.tipo = 'funcion' and e.performance_id is not null then 'f:' || e.performance_id::text
                else 'e:' || e.id::text end
      from fan_encuentro_lugares l join fan_encuentros e on e.id = l.encuentro_id
     where l.user_id = uid and l.llegada_at is not null
  ) v where uid is not null;
$$;
revoke all on function fan_visitas(uuid) from public, anon, authenticated;

-- Wallet: entrar a una función o llegar a un evento cambia el número de la credencial.
create or replace function wallet_trg_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'tickets' then
    perform wallet_marcar_cuentas(array(select o.buyer_user_id from orders o where o.id = new.order_id and o.buyer_user_id is not null));
  else
    perform wallet_marcar_cuentas(array[new.user_id]);
  end if;
  return null;
end $$;
revoke execute on function wallet_trg_visita() from public, anon, authenticated;
drop trigger if exists wallet_visita_ticket on tickets;
create trigger wallet_visita_ticket after update of checked_in_at on tickets
  for each row when (old.checked_in_at is distinct from new.checked_in_at)
  execute function wallet_trg_visita();
drop trigger if exists wallet_visita_evento on fan_encuentro_lugares;
create trigger wallet_visita_evento after update of llegada_at on fan_encuentro_lugares
  for each row when (old.llegada_at is distinct from new.llegada_at)
  execute function wallet_trg_visita();

-- La credencial lleva el número ('fan_visitas').
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
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(uid), 'fan_visitas', fan_visitas(uid),
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
    return json_build_object('nivel', nivel, 'nombre', corto, 'lealtad', lealtad_producciones(b.user_id), 'fan_visitas', fan_visitas(b.user_id),
      'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end);
  end if;
  papel := badge_papel(b.user_id);
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (hoy_mx() - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nivel', 'equipo', 'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(b.user_id), 'fan_visitas', fan_visitas(b.user_id),
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
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int, 'lealtad', lealtad_producciones(auth.uid()), 'fan_visitas', fan_visitas(auth.uid()));
end $function$;

-- Las credenciales de Wallet de socios que ya tienen medalla de fan se vuelven a dibujar con ella.
select wallet_marcar_cuentas(array(select user_id from fan_members where fan_visitas(user_id) >= 3));
commit;
select 'Listo 0104. Medalla de fans: ' || count(*) filter (where fan_visitas(id) >= 1) || ' cuentas con al menos una visita' as resultado
from profiles;
