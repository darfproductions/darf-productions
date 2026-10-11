-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0039 (cancelar o borrar convocatorias, pedido de Diego). Se corre a
-- mano en Supabase → SQL Editor. Si la base no es DEV, aborta sin hacer nada. No borra datos:
-- solo cambia la regla de estados y agrega permisos.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table auditions drop constraint auditions_estado_check;
alter table auditions add constraint auditions_estado_check
  check (estado in ('borrador', 'abierta', 'cerrada', 'finalizada', 'cancelada'));

-- La página de una cancelada sigue visible por enlace (para avisar a los inscritos).
create or replace function audition_is_public(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auditions where id = aid and estado in ('abierta', 'cerrada', 'finalizada', 'cancelada'))
$$;
alter policy auditions_public_read on auditions
  using (estado in ('abierta', 'cerrada', 'finalizada', 'cancelada') or audition_row_team(id, production_id));

-- Borrar con inscritos: solo quien arma el equipo de la convocatoria.
create or replace function auditions_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from audition_applications where audition_id = old.id)
     and not has_perm(old.production_id, 'permisos.gestionar') then
    raise exception 'Esta convocatoria ya tiene inscritos: solo % puede borrarla. Puedes cancelarla.',
      case when old.production_id is null then 'el Director' else 'quien da permisos en la obra' end;
  end if;
  return old;
end $$;
create trigger auditions_delete_guard before delete on auditions
  for each row execute function auditions_delete_guard();

-- Quitar fotos de aspirantes (bucket privado 'audiciones', <audición>/<usuario>/…).
create or replace function can_manage_audition_object(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare aid uuid;
begin
  begin aid := split_part(path, '/', 1)::uuid; exception when others then return false; end;
  return audition_perm(aid, 'audiciones.gestionar');
end $$;
create policy audiciones_team_remove on storage.objects for delete to authenticated
  using (bucket_id = 'audiciones' and can_manage_audition_object(name));

revoke execute on function auditions_delete_guard() from public, anon;
revoke execute on function can_manage_audition_object(text) from public, anon;
grant execute on function can_manage_audition_object(text) to authenticated;


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012020000', '0039_audition_cancel_delete') on conflict do nothing;
commit;
select 'OK: 0039 aplicada en DARF 2.0 DEV' as resultado;
