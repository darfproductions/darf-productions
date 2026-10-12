-- 0064: Registro permanente de talento (decisiones de Diego, 2026-10-12).
--   * Es un FORMATO de audición: una convocatoria general (sin obra), en línea (con video),
--     siempre abierta y sin fecha de cierre. Solo puede haber una.
--   * Quién la ve: el Director y quien gestiona audiciones en ALGUNA obra (para armar
--     repartos): leen solicitudes, videos y fotos, cambian su estado y califican.
--     La configuración (datos, preguntas, borrarla) es solo del Director.
--   * Los datos se guardan hasta que la persona se da de baja (Mi cuenta → cancelar
--     inscripción, como en cualquier audición; puede volver a registrarse).
-- Precede: 0063.

begin;

alter table auditions add column permanente boolean not null default false,
  add constraint auditions_permanente check (not permanente or (production_id is null and modalidad = 'en_linea' and inscripcion_cierra is null));
create unique index uq_auditions_permanente on auditions(permanente) where permanente;

-- ¿Gestiona audiciones en alguna obra? (sin contar equipos propios de convocatorias)
create or replace function manages_production_auditions() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar'))
$$;

-- Configurar una convocatoria: la regla de siempre (obra o equipo propio; general = Director).
create or replace function audition_config_perm(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(audition_production(aid), 'audiciones.gestionar') or audition_member_perm(aid, 'audiciones.gestionar')
$$;

-- Permiso sobre una convocatoria: además, en el Registro permanente, quien gestiona
-- audiciones en alguna obra puede gestionar las solicitudes y calificar.
create or replace function audition_perm(aid uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(audition_production(aid), perm) or audition_member_perm(aid, perm)
      or (perm in ('audiciones.gestionar', 'audiciones.evaluar')
          and exists (select 1 from auditions where id = aid and permanente)
          and manages_production_auditions())
$$;

-- La configuración queda con la regla de siempre (en el permanente: solo el Director).
alter policy auditions_team_write on auditions
  using (audition_config_perm(id))
  with check (audition_row_perm(id, production_id, 'audiciones.gestionar'));
alter policy audition_roles_write on audition_roles
  using (audition_config_perm(audition_id)) with check (audition_config_perm(audition_id));
alter policy audition_slots_write on audition_slots
  using (audition_config_perm(audition_id)) with check (audition_config_perm(audition_id));
alter policy audition_fields_write on audition_fields
  using (audition_config_perm(audition_id)) with check (audition_config_perm(audition_id));
alter policy audition_invites_team on audition_invites
  using (audition_config_perm(audition_id)) with check (audition_config_perm(audition_id));

-- El permanente lo ven en la lista quienes pueden trabajarlo.
alter policy auditions_public_read on auditions
  using (estado in ('abierta', 'cerrada', 'finalizada', 'cancelada') or audition_row_team(id, production_id)
         or (permanente and manages_production_auditions()));

-- La lectura pública de convocatorias pasa por estas reglas: también las usa el visitante (dan falso).
revoke execute on function manages_production_auditions(), audition_config_perm(uuid) from public;
grant execute on function manages_production_auditions(), audition_config_perm(uuid) to anon, authenticated;

commit;
