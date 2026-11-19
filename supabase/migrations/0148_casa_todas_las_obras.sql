-- 0148 (Diego 2026-11-19): todo Casa DARF entra a todas las obras; borrar una obra, solo el Director.
--   * Quien esté en Casa DARF (con cualquier rol) tiene todos los permisos de obra en todas las producciones, sin ser
--     parte de su equipo. Antes era solo para los roles con casa.producciones. Aplica también a quien se agregue después.
--   * casa.producciones sigue sirviendo para crear y duplicar obras y destacar en portada.
--   * Borrar una obra para siempre: solo el Director (profiles.rol = 'admin'). Antes, cualquiera con casa.producciones.
--   * Lo de Honorarios (cuentas bancarias, pagos al equipo) NO va a colgar de permisos de obra: tendrá su propio permiso.
-- Precede: 0147. No borra datos.

begin;

-- ¿Soy de Casa DARF? (el Director también cuenta).
create or replace function casa_obras() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and es_casa(auth.uid())
$$;
revoke execute on function casa_obras() from public;
grant execute on function casa_obras() to anon, authenticated;

-- ──────── has_perm: Casa DARF = todos los permisos de obra ────────
create or replace function has_perm(pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or (pid is not null and perm not like 'casa.%' and (
         exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                  where m.user_id = auth.uid() and m.production_id = pid and rp.permission_id = perm)
         or es_direccion_general(pid)
         or casa_obras()
         or (perm = 'ensayos.gestionar' and lider_ensayos(pid, auth.uid()))))
    or (perm in ('obra.ver', 'ventas.ver', 'puerta.validar') and exists (select 1 from profiles where id = auth.uid() and rol = 'staff'))
    or (pid is null and perm like 'audiciones.%' and has_casa('casa.audiciones'))
  )
$$;

-- ──────── my_panel_access: lo mismo para armar el panel ────────
create or replace function my_panel_access()
returns table (production_id text, permission_id text)
language sql stable security definer set search_path = public as $$
  select m.production_id, rp.permission_id
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid() and rp.permission_id not like 'casa.%'
  union
  select p.id, x.perm
    from productions p
    cross join unnest(array['obra.ver', 'ventas.ver', 'puerta.validar']) as x(perm)
   where exists (select 1 from profiles where id = auth.uid() and rol = 'staff')
  union
  -- Admin y todo Casa DARF (0148): todas las obras con todos los permisos de obra.
  select p.id, pe.id
    from productions p cross join permissions pe
   where pe.id not like 'casa.%' and casa_obras()
  union
  -- Dirección general: todos los permisos de obra de su obra.
  select m.production_id, pe.id
    from production_members m cross join permissions pe
   where m.user_id = auth.uid() and m.role_id = 'direccion_general' and pe.id not like 'casa.%'
  union
  -- Producción, dirección y maestros: ensayos y asistencia siempre (y ver la obra para entrar al panel).
  select m.production_id, x.perm
    from production_members m join panel_roles pr on pr.id = m.role_id
    cross join unnest(array['ensayos.gestionar', 'obra.ver']) as x(perm)
   where m.user_id = auth.uid() and pr.categoria in ('direccion_general', 'produccion', 'direccion')
$$;

-- Funciones y teatros de cualquier obra.
create or replace function maneja_funciones() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or casa_obras()
      or exists (select 1 from my_panel_access() where permission_id = 'funciones.gestionar')
$$;

-- ──────── Borrar una obra: solo el Director ────────
-- La función que borra (0135) se queda igual, con otro nombre y sin acceso directo; la de siempre revisa primero.
do $$ begin
  if to_regprocedure('_borrar_produccion(text, text)') is null then
    alter function panel_borrar_produccion(text, text) rename to _borrar_produccion;
  end if;
end $$;
revoke all on function _borrar_produccion(text, text) from public, anon, authenticated;

create or replace function panel_borrar_produccion(pid text, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director puede borrar una obra.'; end if;
  return _borrar_produccion(pid, p_confirmacion);
end $$;
revoke all on function panel_borrar_produccion(text, text) from public, anon;
grant execute on function panel_borrar_produccion(text, text) to authenticated;

update permissions set descripcion = 'Crear y duplicar producciones y destacar en portada (todo Casa DARF ya entra a todas las obras)'
 where id = 'casa.producciones';

commit;
