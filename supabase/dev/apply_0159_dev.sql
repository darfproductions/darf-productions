-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0159: Personas: edad, género y expediente en la ficha de quien es del equipo (con créditos).
-- Correr DESPUÉS de apply_0158_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.audition_jornadas') is null then
    raise exception 'ABORTADO: primero corre apply_0158_dev.sql.';
  end if;
end $$;
-- 0159 · Personas: edad, género y expediente en la ficha (Diego 2026-11-21).
--   * El expediente personal guarda el género (lo llena la persona o la producción).
--   * En Personas, la ficha de alguien del equipo (con créditos en DARF) muestra su edad, su género y una liga a su
--     expediente personal (el de su obra más reciente). De quien no tiene créditos no se muestra nada de esto.
--   Lo ve quien tiene Personas en Casa DARF (o el admin).
-- Precede: 0158. No borra datos.


alter table person_files add column if not exists genero text;
alter table person_files drop constraint if exists person_files_genero;
alter table person_files add constraint person_files_genero
  check (genero is null or genero in ('mujer', 'hombre', 'no_binario', 'otro', 'prefiero_no_decir'));

create or replace function persona_datos(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare obra text; creditos boolean;
begin
  if not (has_casa('casa.personas') or is_staff()) then raise exception 'No autorizado'; end if;
  creditos := exists (select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid);
  if not creditos then return json_build_object('con_creditos', false); end if;
  -- Su obra más reciente: donde está activo; si no, la última con crédito.
  select x.pid into obra from (
    select m.production_id as pid, 0 as prio, p.created_at
      from production_members m join productions p on p.id = m.production_id
      left join member_enrollment e on e.production_id = m.production_id and e.user_id = uid
     where m.user_id = uid and m.role_id = 'integrante' and e.baja_at is null
    union all
    select c.production_id, 1, p.created_at
      from production_credits c join people pe on pe.id = c.person_id join productions p on p.id = c.production_id
     where pe.profile_id = uid
  ) x order by x.prio, x.created_at desc limit 1;
  return json_build_object(
    'con_creditos', true,
    'fecha_nacimiento', coalesce((select fecha_nacimiento from profiles where id = uid), (select fecha_nacimiento from person_files where user_id = uid)),
    'genero', (select genero from person_files where user_id = uid),
    'expediente_obra', obra);
end $$;
revoke all on function persona_datos(uuid) from public, anon;
grant execute on function persona_datos(uuid) to authenticated;

select 'Listo: 0159 aplicada (edad, género y expediente en Personas).' as resultado;
