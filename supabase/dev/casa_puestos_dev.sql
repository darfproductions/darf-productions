-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Crea los 6 puestos de Casa DARF con sus permisos (Diego 2026-10-15). No asigna personas: eso se hace en
-- Panel → Ajustes → Casa DARF → 2 · Personas. Varias personas pueden tener el mismo puesto.
-- Se puede correr más de una vez: si un puesto ya existe, solo le agrega los permisos que le falten.
-- Requiere 0102. Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.casa_members') is null then
    raise exception 'ABORTADO: primero corre apply_0102_dev.sql.';
  end if;
end $$;

insert into panel_roles (id, nombre, descripcion, categoria, alcance, orden) values
  ('casa_direccion_general',        'Dirección General',        'Ve y maneja todo.', 'casa', 'casa', 1),
  ('casa_produccion_ejecutiva',     'Producción Ejecutiva',     'Arma las obras, nombra a su Dirección general y lleva la operación.', 'casa', 'casa', 2),
  ('casa_direccion_artistica',      'Dirección Artística',      'Entra a todas las obras y a las audiciones generales.', 'casa', 'casa', 3),
  ('casa_administracion_finanzas',  'Administración y Finanzas', 'El dinero de todas las obras y las estadísticas del club.', 'casa', 'casa', 4),
  ('casa_comunicacion_marketing',   'Comunicación y Marketing', 'Franja y anuncios del sitio, eventos, socios y mensajes.', 'casa', 'casa', 5),
  ('casa_talento_comunidad',        'Talento y Comunidad',      'Audiciones generales, fichas de personas y el equipo DARF.', 'casa', 'casa', 6)
on conflict (id) do nothing;

insert into role_permissions (role_id, permission_id)
select 'casa_direccion_general', id from permissions where id like 'casa.%'
union all select 'casa_produccion_ejecutiva', unnest(array['casa.producciones', 'casa.eventos', 'casa.audiciones', 'casa.personas', 'casa.equipo', 'casa.roles', 'casa.reportes', 'casa.bitacora'])
union all select 'casa_direccion_artistica', unnest(array['casa.producciones', 'casa.audiciones'])
union all select 'casa_administracion_finanzas', unnest(array['casa.reportes', 'casa.club', 'casa.bitacora'])
union all select 'casa_comunicacion_marketing', unnest(array['casa.sitio', 'casa.eventos', 'casa.club', 'casa.contacto'])
union all select 'casa_talento_comunidad', unnest(array['casa.audiciones', 'casa.personas', 'casa.equipo'])
on conflict do nothing;

commit;
select r.nombre as puesto, count(rp.permission_id) as permisos
from panel_roles r left join role_permissions rp on rp.role_id = r.id
where r.alcance = 'casa' group by r.nombre, r.orden order by r.orden;
