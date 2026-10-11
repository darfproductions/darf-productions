-- 0039: cancelar o borrar una convocatoria (pedido de Diego, 2026-10-11).
--   * Cancelar: estado nuevo 'cancelada'. Se conserva todo; ya nadie se inscribe y quien
--     estaba inscrito ve "Convocatoria cancelada" en su página y en Mi cuenta.
--   * Borrar (para la que quedó mal hecha): definitivo; se van con ella sus inscripciones,
--     calificaciones, horarios, preguntas, invitaciones y videos (enlaces).
--     - Sin inscritos: la borra quien la gestiona.
--     - Con inscritos: solo quien arma su equipo (obra: quien da permisos en ella;
--       general: el Director). Así un juez invitado o un gestor propio no borra datos ajenos.
--   * Fotos de aspirantes: quien gestiona puede quitarlas del almacenamiento (la web
--     las quita antes de borrar la convocatoria).
-- Precede: 0038.

begin;

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

commit;
