-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0157: Ensayos sin asistencia (salen en Mi cuenta y en los calendarios, pero nadie pasa lista).
-- Correr DESPUÉS de apply_0156_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.calendario_ligas') is null then
    raise exception 'ABORTADO: primero corre apply_0156_dev.sql.';
  end if;
end $$;
-- 0157 · Ensayos sin asistencia (Diego 2026-11-20).
--   Un ensayo puede marcarse "No se toma asistencia": sale en Mi cuenta y en los calendarios (0156) como siempre, pero
--   nadie pasa lista, no se abre, no genera faltas ni retardos y no cuenta en los resúmenes de asistencia.
--   Solo se puede marcar si todavía no tiene asistencia registrada (no se borra nada).
-- Precede: 0156. No borra datos.


alter table rehearsals add column if not exists sin_asistencia boolean not null default false;

-- Sin asistencia: no se registra nada (ni a mano, ni con QR, ni al cerrar lista).
create or replace function rehearsal_attendance_sin_asistencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rehearsals r where r.id = new.rehearsal_id and r.sin_asistencia) then
    raise exception 'Este ensayo no lleva asistencia.';
  end if;
  return new;
end $$;
drop trigger if exists rehearsal_attendance_sin_asistencia on rehearsal_attendance;
create trigger rehearsal_attendance_sin_asistencia before insert or update on rehearsal_attendance
  for each row execute function rehearsal_attendance_sin_asistencia();

-- No se abre; y solo se marca "sin asistencia" si todavía no hay asistencia registrada.
create or replace function rehearsals_sin_asistencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sin_asistencia then
    if new.abierto_at is not null and new.abierto_at is distinct from old.abierto_at then
      raise exception 'Este ensayo no lleva asistencia: no se abre.';
    end if;
    if not old.sin_asistencia and exists (select 1 from rehearsal_attendance a where a.rehearsal_id = new.id) then
      raise exception 'Este ensayo ya tiene asistencia registrada: no se puede marcar como sin asistencia.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rehearsals_sin_asistencia on rehearsals;
create trigger rehearsals_sin_asistencia before update on rehearsals
  for each row execute function rehearsals_sin_asistencia();

-- Nadie pasa lista en un ensayo sin asistencia.
create or replace function puede_pasar_lista(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select sin_asistencia from rehearsals where id = rid), false)
     and (has_perm(rehearsal_production(rid), 'ensayos.gestionar') or encargado_activo(rid))
$$;

-- Mis ensayos de equipo (0099): igual, pero un ensayo sin asistencia no se puede abrir.
create or replace function mis_ensayos_equipo()
returns table (id uuid, production_id text, obra text, titulo text, inicia timestamptz, termina timestamptz, lugar text, estado text,
               encargado boolean, abierto_at timestamptz, cerrado_at timestamptz, puede_abrir boolean, puede_pasar_lista boolean, mi_estado text)
language sql stable security definer set search_path = public as $$
  select r.id, r.production_id, p.nombre, r.titulo, r.inicia, r.termina, r.lugar, r.estado,
         auth.uid() = any(r.encargados), r.abierto_at, r.cerrado_at,
         auth.uid() = any(r.encargados) and r.estado = 'programado' and r.cerrado_at is null and not r.sin_asistencia
           and (r.inicia at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date
           and now() >= r.inicia - interval '1 hour'
           and (r.abierto_at is null or r.abierto_por = auth.uid()),
         puede_pasar_lista(r.id),
         (select a.estado from rehearsal_attendance a where a.rehearsal_id = r.id and a.user_id = auth.uid())
    from rehearsals r join productions p on p.id = r.production_id
   where auth.uid() is not null
     and r.inicia >= now() - interval '1 day' and r.inicia < now() + interval '60 days'
     and (auth.uid() = any(r.encargados)
          or (rehearsal_cites(r.id, auth.uid()) and es_equipo(r.production_id, auth.uid()))
          or (lider_ensayos(r.production_id, auth.uid())
              and (r.inicia at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date))
   order by r.inicia
$$;

select 'Listo: 0157 aplicada (ensayos sin asistencia).' as resultado;
