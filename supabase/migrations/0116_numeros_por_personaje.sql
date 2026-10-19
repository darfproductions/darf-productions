-- 0116 (Diego 2026-10-19): números de audición por personaje.
--   * Nueva opción en "Números del día": por personaje. Al inscribirse nadie tiene número todavía.
--   * Al cerrar las inscripciones (al pasar la convocatoria a "cerrada" o al llegar la fecha de cierre) se reparten:
--     primero el grupo del personaje más importante (orden de los personajes de la convocatoria), luego los demás;
--     quien elige varios va con el más importante que eligió; quien no eligió personaje, al final.
--     Dentro de cada grupo, por orden de inscripción. A cada quien le llega su número a su cuenta.
--   * Quien se registra en la entrada el día de la audición pasa al último (ya pasaba: número siguiente al llegar).
--   * Después se puede seguir moviendo a alguien con las flechas, como en la asignación previa.

alter table auditions drop constraint if exists auditions_numeracion_check;
alter table auditions add constraint auditions_numeracion_check check (numeracion in ('llegada', 'previa', 'personaje'));
alter table auditions add column if not exists numeros_asignados_at timestamptz;

-- Repartir los números por personaje (una sola vez; volver a correrla no cambia nada).
create or replace function audition_numerar_personaje(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; n int := 0; r record; tit text;
begin
  select * into au from auditions where id = aid for update;
  if not found or au.numeracion <> 'personaje' or au.numeros_asignados_at is not null then return 0; end if;
  tit := coalesce(nullif(btrim(au.titulo), ''), 'tu audición');
  for r in
    select a.id, a.user_id,
           row_number() over (order by
             (select min(ro.orden) from audition_roles ro where ro.id = any(a.roles)) nulls last,
             a.created_at, a.id) as num
      from audition_applications a
     where a.audition_id = aid and not a.walk_in and a.checked_in_at is null
       and a.estado not in ('cancelado', 'no_cumple')
  loop
    update audition_applications set numero = r.num, updated_at = now() where id = r.id;
    n := n + 1;
    if r.user_id is not null then
      begin
        perform notify(array[r.user_id], 'audicion', 'Ya tienes tu lugar: Nº ' || r.num,
          'Cerraron las inscripciones de ' || tit || '. Audicionas en el lugar ' || r.num || '.',
          '/audiciones/' || aid, au.production_id);
      exception when others then null;
      end;
    end if;
  end loop;
  -- Quien ya estaba registrado en la entrada (raro antes del cierre) queda después.
  update audition_applications a set numero = n + q.k, updated_at = now()
    from (select id, row_number() over (order by checked_in_at, created_at) as k from audition_applications
           where audition_id = aid and (walk_in or checked_in_at is not null) and estado not in ('cancelado', 'no_cumple')) q
   where a.id = q.id;
  update auditions set numeros_asignados_at = now() where id = aid;
  return n;
end $$;
revoke all on function audition_numerar_personaje(uuid) from public, anon, authenticated;

-- Desde el panel: "Asignar números ahora" (quien gestiona), por si quieren hacerlo antes del cierre.
create or replace function audition_numerar_ahora(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  if (select numeracion from auditions where id = aid) <> 'personaje' then raise exception 'Esta convocatoria no numera por personaje.'; end if;
  if (select numeros_asignados_at from auditions where id = aid) is not null then raise exception 'Los números ya se asignaron.'; end if;
  return audition_numerar_personaje(aid);
end $$;
revoke all on function audition_numerar_ahora(uuid) from public, anon;
grant execute on function audition_numerar_ahora(uuid) to authenticated;

-- Al cerrar la convocatoria, se reparten solos.
create or replace function auditions_numerar_al_cerrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numeracion = 'personaje' and new.numeros_asignados_at is null
     and new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
    perform audition_numerar_personaje(new.id);
  end if;
  return new;
end $$;
drop trigger if exists auditions_numerar_al_cerrar on auditions;
create trigger auditions_numerar_al_cerrar after update of estado on auditions
  for each row execute function auditions_numerar_al_cerrar();

-- Y al llegar la fecha de cierre de inscripciones (cada 15 min).
create or replace function auditions_numerar_vencidas() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from auditions
            where numeracion = 'personaje' and numeros_asignados_at is null
              and estado in ('abierta', 'cerrada') and inscripcion_cierra is not null and inscripcion_cierra <= now()
  loop
    perform audition_numerar_personaje(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function auditions_numerar_vencidas() from public, anon, authenticated;

do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname = 'darf_numeros_audicion';
  perform cron.schedule('darf_numeros_audicion', '*/15 * * * *', 'select public.auditions_numerar_vencidas()');
end if; end $$;
