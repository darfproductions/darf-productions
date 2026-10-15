-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0106: sección Staff en Elenco y equipos, y acceso de integrante al agregar al elenco. Requiere 0104.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.fan_visitas(uuid)') is null then
    raise exception 'ABORTADO: primero corre apply_0104_dev.sql.';
  end if;
end $$;
begin;

alter table production_credits drop constraint production_credits_tipo_check;
alter table production_credits add constraint production_credits_tipo_check check (tipo = any (array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico', 'staff']));
alter table production_credits drop constraint production_credits_check;
alter table production_credits add constraint production_credits_check check (tipo in ('ensamble', 'staff') or coalesce(btrim(papel), '') <> '');
alter table casting_offers drop constraint casting_offers_tipo_check;
alter table casting_offers add constraint casting_offers_tipo_check check (tipo = any (array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico', 'staff']));
alter table casting_offers drop constraint casting_offers_check;
alter table casting_offers add constraint casting_offers_check check (tipo in ('ensamble', 'staff') or coalesce(btrim(papel), '') <> '');
alter table member_doc_types drop constraint member_doc_types_grupo_check;
alter table member_doc_types add constraint member_doc_types_grupo_check check (grupo = any (array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico', 'staff']));
alter table rehearsals drop constraint rehearsals_grupos_check;
alter table rehearsals add constraint rehearsals_grupos_check check (grupos <@ array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico', 'staff']);

-- ════════ Elenco con cuenta = integrante de la obra ════════
create or replace function elenco_dar_acceso(p_credit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c production_credits; uid uuid;
begin
  select * into c from production_credits where id = p_credit;
  if not found or not c.activo or c.tipo not in ('reparto', 'ensamble') then return; end if;
  select profile_id into uid from people where id = c.person_id;
  if uid is null then return; end if;
  if not exists (select 1 from productions where id = c.production_id
                  and estado in ('borrador', 'publicada') and not coalesce(concluded, false)) then return; end if;
  insert into production_members (production_id, user_id, role_id)
  values (c.production_id, uid, 'integrante') on conflict do nothing;
end $$;
revoke all on function elenco_dar_acceso(uuid) from public, anon, authenticated;

create or replace function elenco_acceso_credito() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform elenco_dar_acceso(new.id);
  return null;
end $$;
drop trigger if exists elenco_acceso on production_credits;
create trigger elenco_acceso after insert or update of tipo, person_id, activo on production_credits
  for each row execute function elenco_acceso_credito();

create or replace function elenco_acceso_ficha() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if new.profile_id is null or new.profile_id is not distinct from old.profile_id then return null; end if;
  for cid in select id from production_credits where person_id = new.id loop
    perform elenco_dar_acceso(cid);
  end loop;
  return null;
end $$;
drop trigger if exists elenco_acceso_ficha on people;
create trigger elenco_acceso_ficha after update of profile_id on people
  for each row execute function elenco_acceso_ficha();
revoke all on function elenco_acceso_credito(), elenco_acceso_ficha() from public, anon, authenticated;

-- Lo que ya existe: elenco con cuenta en obras vivas.
do $$ begin
  perform elenco_dar_acceso(id) from production_credits where tipo in ('reparto', 'ensamble') and activo;
end $$;

-- Gafete: staff cuenta como Staff. Duplicar una obra también copia su staff.
CREATE OR REPLACE FUNCTION public.badge_papel(uid uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rol_app text; v_cargo text; v_nivel int; v_papel text; v_casa text; v_desde int;
begin
  select rol into rol_app from profiles where id = uid;
  -- Casa DARF: su puesto (CEO, CFO…); si no tiene, su cargo en Nosotros (el admin: Dirección DARF).
  if rol_app = 'admin' or exists (select 1 from casa_members where user_id = uid) then
    select tm.cargo into v_cargo
      from team_members tm join people pe on pe.id = tm.person_id
     where pe.profile_id = uid order by tm.orden, tm.created_at limit 1;
    select r.nombre into v_casa from casa_members m join panel_roles r on r.id = m.role_id
     where m.user_id = uid order by r.orden limit 1;
    select extract(year from coalesce(min(m.desde), (select created_at from profiles where id = uid)::date))::int into v_desde
      from casa_members m where m.user_id = uid;
    return json_build_object('franja', 'casa', 'papel', coalesce(v_casa, v_cargo, 'Dirección DARF'), 'casa_desde', v_desde);
  end if;

  -- Niveles: 1 dirección general · 2 producción · 3 dirección · 4 elenco · 5 crew · 6 staff.
  select x.nivel, x.papel into v_nivel, v_papel from (
    select case when m.role_id = 'integrante' then 4
                else case r.categoria when 'direccion_general' then 1 when 'produccion' then 2 when 'direccion' then 3 when 'crew' then 5 else 6 end end as nivel,
           case when m.role_id = 'integrante' then 'Elenco' else r.nombre end as papel,
           r.orden as sub, p.concluded, p.created_at
      from production_members m
      join panel_roles r on r.id = m.role_id
      join productions p on p.id = m.production_id
     where m.user_id = uid
    union all
    select case c.tipo when 'produccion' then 2 when 'creativo' then 3 when 'reparto' then 4 when 'ensamble' then 4 when 'staff' then 6 else 5 end,
           case when c.tipo in ('reparto', 'ensamble') then 'Elenco' when c.tipo = 'staff' then 'Staff' else coalesce(nullif(btrim(c.papel), ''), 'Equipo') end,
           c.orden, p.concluded, p.created_at
      from production_credits c
      join people pe on pe.id = c.person_id
      join productions p on p.id = c.production_id
     where pe.profile_id = uid and c.activo
  ) x
  order by x.nivel, x.concluded, x.created_at desc, x.sub
  limit 1;

  -- Staff general de DARF: al menos Staff.
  if rol_app = 'staff' and (v_nivel is null or v_nivel > 6) then
    return json_build_object('franja', 'staff', 'papel', 'Staff DARF');
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case v_nivel when 1 then 'direccion_general' when 2 then 'produccion' when 3 then 'direccion' when 6 then 'staff' else 'crew' end, 'papel', v_papel);
end $function$;

CREATE OR REPLACE FUNCTION public.panel_duplicate_production(src text, p_id text, p_nombre text, p_temporada text, copiar_canciones boolean DEFAULT true, copiar_equipos boolean DEFAULT true, copiar_permisos boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record; new_act uuid;
begin
  if not has_casa('casa.producciones') then raise exception 'Solo Casa DARF (Producciones) puede duplicar obras.'; end if;
  if not exists (select 1 from productions where id = src) then raise exception 'La obra original no existe.'; end if;
  if exists (select 1 from productions where id = p_id) then raise exception 'Ya existe una obra con ese identificador.'; end if;

  insert into productions (id, nombre, venue, price, estado, frase, sinopsis, temporada, duracion, clasificacion, basada_en,
                           color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path)
  select p_id, p_nombre, venue, price, 'borrador', frase, sinopsis, p_temporada, duracion, clasificacion, basada_en,
         color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path
    from productions where id = src;

  insert into production_facts (production_id, etiqueta, valor, orden)
  select p_id, etiqueta, valor, orden from production_facts where production_id = src;

  if copiar_canciones then
    for a in select * from production_acts where production_id = src order by orden loop
      insert into production_acts (production_id, nombre, orden) values (p_id, a.nombre, a.orden) returning id into new_act;
      insert into production_songs (production_id, act_id, titulo, orden)
      select p_id, new_act, titulo, orden from production_songs where act_id = a.id;
    end loop;
    insert into production_songs (production_id, act_id, titulo, orden)
    select p_id, null, titulo, orden from production_songs where production_id = src and act_id is null;
  end if;

  if copiar_equipos then
    insert into production_credits (production_id, person_id, tipo, papel, orden)
    select p_id, person_id, tipo, papel, orden from production_credits
     where production_id = src and tipo in ('creativo', 'produccion', 'crew', 'tecnico', 'staff');
  end if;

  if copiar_permisos then
    insert into production_members (production_id, user_id, role_id, created_by)
    select p_id, user_id, role_id, auth.uid() from production_members where production_id = src;
  end if;

  return p_id;
end $function$;

commit;
select 'Listo 0106. Integrantes del elenco con acceso en obras vivas: ' || count(*) as resultado
from production_members m join productions p on p.id = m.production_id
where m.role_id = 'integrante' and p.estado in ('borrador', 'publicada') and not coalesce(p.concluded, false);
