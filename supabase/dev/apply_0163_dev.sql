-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0163: "Todos llegan": sin hora de llegada falsa (dice "Se dio por llegado").
-- Correr DESPUÉS de apply_0162_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'audition_applications' and column_name = 'falto_at') then
    raise exception 'ABORTADO: primero corre apply_0162_dev.sql.';
  end if;
end $$;
-- 0163 · "Todos llegan": sin hora de llegada falsa (Diego 2026-11-23).
--   Con la opción "Todos llegan, marca solo a quien faltó" (0162), quien se dio por llegado queda marcado como
--   llegada_asumida: la lista y su ficha dicen "Se dio por llegado" en lugar de una hora que no es real. Si después
--   escanea su QR o se marca "Sí vino", vuelve a ser una llegada real, con su hora.
-- Precede: 0162. No borra datos.


alter table audition_applications add column if not exists llegada_asumida boolean not null default false;

-- Una llegada normal (QR o botón) es real; al marcar falta, ya no hay llegada.
create or replace function audition_app_llego_quita_falta() returns trigger
language plpgsql as $$
begin
  if new.checked_in_at is not null and old.checked_in_at is null then new.falto_at := null; new.llegada_asumida := false; end if;
  if new.checked_in_at is null then new.llegada_asumida := false; end if;
  return new;
end $$;

-- Dar por llegados: igual que 0162, pero la llegada queda como asumida (sin hora real).
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
       and not (a.estado = 'inscrito' and not a.walk_in)
     order by a.numero nulls last, s.inicia nulls last, a.created_at
  loop
    perform audition_checkin(aid, r.id::text);
    update audition_applications set llegada_asumida = true where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Para la lista del día: a quién se dio por llegado.
create or replace function audition_llegadas_asumidas(aid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')
    or audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.evaluar')
    then coalesce((select array_agg(id) from audition_applications where audition_id = aid and llegada_asumida), '{}') end
$$;
revoke all on function audition_llegadas_asumidas(uuid) from public, anon;
grant execute on function audition_llegadas_asumidas(uuid) to authenticated;

select 'Listo: 0163 aplicada (sin hora de llegada falsa).' as resultado;
