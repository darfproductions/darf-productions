-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0162: Día de la audición: opción "Todos llegan, marca solo a quien faltó" (por audición, apagada por omisión).
-- Correr DESPUÉS de apply_0161_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.hon_datos_pago') is null then
    raise exception 'ABORTADO: primero corre apply_0161_dev.sql.';
  end if;
end $$;
-- 0162 · Día de la audición: "Todos llegan, marca solo a quien faltó" (Diego 2026-11-23).
--   Opción por audición (apagada por omisión), útil en escuelas: al encenderla, todos los de la lista quedan como
--   llegados (con su turno) y en lugar de "Llegó" se marca "Faltó": quien faltó sale de la fila. "Sí vino" lo regresa.
-- Precede: 0161. No borra datos.


alter table auditions add column if not exists asumir_llegada boolean not null default false;
alter table audition_applications add column if not exists falto_at timestamptz;

-- Si alguien registra su llegada (QR o botón), deja de contar como falta.
create or replace function audition_app_llego_quita_falta() returns trigger
language plpgsql as $$
begin
  if new.checked_in_at is not null and old.checked_in_at is null then new.falto_at := null; end if;
  return new;
end $$;
drop trigger if exists audition_app_llego_quita_falta on audition_applications;
create trigger audition_app_llego_quita_falta before update of checked_in_at on audition_applications
  for each row execute function audition_app_llego_quita_falta();

-- Registra la llegada de todos los que faltan por llegar (no a quien ya se marcó como falta ni a las solicitudes sin
-- aprobar), en orden de turno.
create or replace function audition_todos_llegaron(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; au auditions;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  for r in
    select a.id from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.checked_in_at is null and a.falto_at is null
       and a.estado not in ('cancelado', 'no_cumple') and (au.fase <> 'callback' or a.estado = 'callback')
       and not (a.estado = 'inscrito' and not a.walk_in)   -- las solicitudes sin aprobar no se dan por llegadas
     order by a.numero nulls last, s.inicia nulls last, a.created_at
  loop
    perform audition_checkin(aid, r.id::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function audition_todos_llegaron(uuid) from public, anon;
grant execute on function audition_todos_llegaron(uuid) to authenticated;

-- Encender o apagar el modo. Al encenderlo, todos quedan como llegados.
create or replace function audition_asumir_llegada(aid uuid, p_on boolean) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then raise exception 'No autorizado'; end if;
  update auditions set asumir_llegada = coalesce(p_on, false) where id = aid;
  return case when p_on then audition_todos_llegaron(aid) else 0 end;
end $$;
revoke all on function audition_asumir_llegada(uuid, boolean) from public, anon;
grant execute on function audition_asumir_llegada(uuid, boolean) to authenticated;

-- "Faltó" (sale de la fila, conserva su número) o "Sí vino" (vuelve a la fila).
create or replace function audition_falto(aid uuid, app uuid, p_falto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v audition_applications; au auditions;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then raise exception 'No autorizado'; end if;
  select * into v from audition_applications where id = app and audition_id = aid for update;
  if not found then raise exception 'No encontrado'; end if;
  select * into au from auditions where id = aid;
  if p_falto then
    if v.entered_at is not null then raise exception 'Ya pasó a audicionar: no se puede marcar como falta.'; end if;
    if au.en_escena = app then raise exception 'Está en escena: primero pasa al siguiente.'; end if;
    update audition_applications set falto_at = now(), checked_in_at = null, checked_in_by = null, updated_at = now() where id = app;
  else
    update audition_applications set falto_at = null, updated_at = now() where id = app;
    perform audition_checkin(aid, app::text);
  end if;
end $$;
revoke all on function audition_falto(uuid, uuid, boolean) from public, anon;
grant execute on function audition_falto(uuid, uuid, boolean) to authenticated;

-- Quiénes faltaron (para marcarlos en la lista).
create or replace function audition_faltaron(aid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')
    or audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.evaluar')
    then coalesce((select array_agg(id) from audition_applications where audition_id = aid and falto_at is not null), '{}') end
$$;
revoke all on function audition_faltaron(uuid) from public, anon;
grant execute on function audition_faltaron(uuid) to authenticated;

select 'Listo: 0162 aplicada (todos llegan, marca solo a quien faltó).' as resultado;
