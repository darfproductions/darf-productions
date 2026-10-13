-- 0087: categorías del gafete (Diego 2026-10-13). Cada rol del panel pertenece a una categoría y
-- el gafete toma la más alta de la persona (se recalcula solo si le cambian los roles):
--   Manager (degradado)     Equipo DARF y Director.
--   Producción (rojo)       rol Producción; créditos de equipo de producción.
--   Dirección (azul)        Dirección artística, Maestro; créditos creativos.
--   Crew (lila)             Elenco (integrantes, reparto, ensamble) y luego Juez, Taquilla, Contenido,
--                           Maquillaje; créditos de crew y técnicos.
--   Staff (rosa)            Puerta, Staff, Mesa de registro; staff general de DARF.
-- Después vienen Fan (dorado, socio del Club Fan) y Cuenta (gris), que ya calcula credencial_nivel.
-- Precede: 0086.

begin;

-- Categoría de cada rol del panel (al crear uno nuevo se elige).
alter table panel_roles add column categoria text not null default 'crew'
  check (categoria in ('produccion', 'direccion', 'crew', 'staff'));
-- Los roles de sistema están protegidos (0031); solo esta migración les pone su categoría.
alter table panel_roles disable trigger panel_roles_protect;
update panel_roles set categoria = case id
  when 'productor' then 'produccion'
  when 'direccion' then 'direccion'
  when 'maestro' then 'direccion'
  when 'puerta' then 'staff'
  when 'staff' then 'staff'
  when 'registro' then 'staff'
  else 'crew' end;
alter table panel_roles enable trigger panel_roles_protect;

-- Papel y categoría del gafete: el más alto. franja = manager | produccion | direccion | crew | staff.
create or replace function badge_papel(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare rol_app text; v_cargo text; v_nivel int; v_papel text;
begin
  select rol into rol_app from profiles where id = uid;
  -- Manager: Equipo DARF (su cargo) …
  select tm.cargo into v_cargo
    from team_members tm join people pe on pe.id = tm.person_id
   where pe.profile_id = uid
   order by tm.orden, tm.created_at limit 1;
  if v_cargo is not null then return json_build_object('franja', 'manager', 'papel', v_cargo); end if;

  -- Niveles: 2 producción · 3 dirección · 4 elenco · 5 crew · 6 staff.
  select x.nivel, x.papel into v_nivel, v_papel from (
    select case when m.role_id = 'integrante' then 4
                else case r.categoria when 'produccion' then 2 when 'direccion' then 3 when 'crew' then 5 else 6 end end as nivel,
           case when m.role_id = 'integrante' then 'Elenco' else r.nombre end as papel,
           r.orden as sub, p.concluded, p.created_at
      from production_members m
      join panel_roles r on r.id = m.role_id
      join productions p on p.id = m.production_id
     where m.user_id = uid
    union all
    select case c.tipo when 'produccion' then 2 when 'creativo' then 3 when 'reparto' then 4 when 'ensamble' then 4 else 5 end,
           case when c.tipo in ('reparto', 'ensamble') then 'Elenco' else coalesce(nullif(btrim(c.papel), ''), 'Equipo') end,
           c.orden, p.concluded, p.created_at
      from production_credits c
      join people pe on pe.id = c.person_id
      join productions p on p.id = c.production_id
     where pe.profile_id = uid and c.activo
  ) x
  order by x.nivel, x.concluded, x.created_at desc, x.sub
  limit 1;

  -- … y el Director (administrador del panel).
  if rol_app = 'admin' then
    return json_build_object('franja', 'manager', 'papel', case when v_nivel between 2 and 3 then v_papel else 'Dirección general' end);
  end if;
  -- Staff general de DARF: al menos Staff.
  if rol_app = 'staff' and (v_nivel is null or v_nivel > 6) then
    return json_build_object('franja', 'staff', 'papel', 'Staff DARF');
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case v_nivel when 2 then 'produccion' when 3 then 'direccion' when 6 then 'staff' else 'crew' end, 'papel', v_papel);
end $$;

commit;
