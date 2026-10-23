-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0121b: el permiso "Showcases" para los roles de Casa DARF Dirección General y Producción Ejecutiva
-- (0121 creó el permiso, pero no lo agregó a los roles que ya existían). No necesita despliegue.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.showcase_planes') is null then
    raise exception 'ABORTADO: primero corre el script de 0121.';
  end if;
end $$;
begin;

insert into role_permissions (role_id, permission_id)
select r.id, 'casa.showcases' from panel_roles r
where r.id in ('casa_direccion_general', 'casa_produccion_ejecutiva') and r.alcance = 'casa' and not r.es_sistema
on conflict do nothing;

commit;

select 'Listo 0121b. Roles con Showcases: ' || coalesce((select string_agg(r.nombre, ', ' order by r.nombre)
  from role_permissions rp join panel_roles r on r.id = rp.role_id where rp.permission_id = 'casa.showcases'), 'NINGUNO (revisar)') as resultado;
