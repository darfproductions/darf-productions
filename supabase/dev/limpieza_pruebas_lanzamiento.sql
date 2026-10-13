-- DARF 2.0 — SOLO PARA LA BASE OFICIAL "DARF 2.0 DEV". ⚠️ BORRA DATOS (no se puede deshacer).
-- Quita lo que se probó el día del lanzamiento (13 oct 2026) y la obra Teen Beach Movie (aún no anunciada).
-- Se corre completa en Supabase → SQL Editor. Si algo no cuadra, se detiene y no borra nada.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if (select count(*) from profiles p join auth.users u on u.id = p.id
       where p.rol = 'admin' and lower(u.email) = 'darfproductions@gmail.com') <> 1
     or (select count(*) from profiles where rol = 'admin') <> 1 then
    raise exception 'ABORTADO: la única cuenta de Director debe ser darfproductions@gmail.com. No se ejecutó nada.';
  end if;
  if exists (select 1 from orders) or exists (select 1 from performances) or exists (select 1 from auditions) then
    raise exception 'ABORTADO: ya hay funciones, órdenes o audiciones registradas; revisar con Claude. No se ejecutó nada.';
  end if;
end $$;

-- Pruebas del día: mensajes de Contacto, invitaciones al equipo, socios del Club Fan (vuelve a empezar en #0001).
truncate table contact_messages, production_invites, fan_members restart identity;

-- Cuentas: solo se queda darfproductions@gmail.com (lo demás de esas cuentas se borra con ellas).
delete from auth.users where id not in (select id from profiles where rol = 'admin');

-- Teen Beach Movie: la obra y todo lo suyo (créditos, actos, etc. se borran con ella).
create temp table solo_tbm on commit drop as
  select p.id from people p
   where p.profile_id is null
     and exists (select 1 from production_credits c where c.person_id = p.id and c.production_id = 'teen-beach-movie-2027')
     and not exists (select 1 from production_credits c where c.person_id = p.id and c.production_id <> 'teen-beach-movie-2027');
delete from productions where id = 'teen-beach-movie-2027';
-- Fichas de personas que solo estaban en Teen Beach Movie.
delete from people where id in (select id from solo_tbm);

-- La bitácora y los avisos arrancan en blanco.
truncate table audit_log, notifications restart identity;

-- Resumen de lo que quedó.
select 'Obras: ' || (select string_agg(nombre || ' (' || estado || ')', ', ' order by created_at) from productions)
       || ' · Cuentas: ' || (select string_agg(email, ', ') from auth.users)
       || ' · Fichas de personas: ' || (select count(*) from people)
       || ' · Créditos: ' || (select count(*) from production_credits)
       || ' · Socios Club Fan: ' || (select count(*) from fan_members)
       || ' · Contacto: ' || (select count(*) from contact_messages) as resultado;

commit;
