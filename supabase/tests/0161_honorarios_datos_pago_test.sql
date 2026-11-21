-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0161 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000161a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't161_crea@test.local'),
  ('00000000-0000-0000-0000-000000161a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't161_actor@test.local'),
  ('00000000-0000-0000-0000-000000161a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't161_taller@test.local');
insert into productions (id, nombre, estado, tipo) values ('t161_pro', 'Pro 161', 'borrador', 'profesional'), ('t161_tal', 'Taller 161', 'borrador', 'taller');
insert into people (id, nombre, profile_id) values
  ('00000000-0000-0000-0000-000000161b01', 'Crea', '00000000-0000-0000-0000-000000161a01'),
  ('00000000-0000-0000-0000-000000161b02', 'Actor', '00000000-0000-0000-0000-000000161a02'),
  ('00000000-0000-0000-0000-000000161b03', 'Alumno', '00000000-0000-0000-0000-000000161a03');
insert into production_credits (production_id, person_id, tipo, papel) values
  ('t161_tal', '00000000-0000-0000-0000-000000161b01', 'creativo', 'Dirección'),
  ('t161_pro', '00000000-0000-0000-0000-000000161b02', 'reparto', 'Barnum'),
  ('t161_tal', '00000000-0000-0000-0000-000000161b03', 'reparto', 'Alumno');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare ok boolean; begin
  -- CLABE: válida (BBVA de ejemplo) e inválida.
  if not clabe_valida('012180001234567899') then raise exception 'FALLO T0a: CLABE válida'; end if;
  if clabe_valida('012180001234567890') or clabe_valida('12345') then raise exception 'FALLO T0b: CLABE inválida'; end if;
  -- A quién le sale Mis honorarios.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a01');
  if not mis_honorarios_aplica() then raise exception 'FALLO T1a: creativo'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a02');
  if not mis_honorarios_aplica() then raise exception 'FALLO T1b: actor profesional'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a03');
  if mis_honorarios_aplica() then raise exception 'FALLO T1c: elenco de taller'; end if;
  -- Aviso: le falta (todavía no pone nada); al del taller no le toca.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a02');
  if mi_datos_pago_falta() is distinct from true then raise exception 'FALLO T1d: aviso'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a03');
  if mi_datos_pago_falta() is not null then raise exception 'FALLO T1e: aviso a quien no le toca'; end if;
  -- Guardar: sin CLABE no (ni en efectivo); CLABE mala no; buena sí.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a02');
  begin perform hon_mis_datos_pago_guardar('transferencia', 'Actor', 'BBVA', null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2a'; end if;
  begin perform hon_mis_datos_pago_guardar('transferencia', 'Actor', 'BBVA', '012180001234567890'); ok := false; exception when others then ok := sqlerrm like '%no es válida%'; end;
  if not ok then raise exception 'FALLO T2b'; end if;
  perform hon_mis_datos_pago_guardar('transferencia', 'Actor Pérez', 'BBVA', '0121 8000 1234 5678 99');
  if (select clabe from hon_datos_pago where person_id = '00000000-0000-0000-0000-000000161b02') <> '012180001234567899' then raise exception 'FALLO T2c'; end if;
  if mi_datos_pago_falta() then raise exception 'FALLO T2d: sigue el aviso'; end if;
  -- Cada quien ve solo lo suyo.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000161a01');
  if exists (select 1 from hon_datos_pago) then raise exception 'FALLO T3a: ve datos ajenos'; end if;
  begin perform hon_mis_datos_pago_guardar('efectivo', 'Crea', null, null); ok := false; exception when others then ok := sqlerrm like '%aunque prefieras efectivo%'; end;
  if not ok then raise exception 'FALLO T3b: efectivo sin CLABE'; end if;
  perform hon_mis_datos_pago_guardar('efectivo', 'Crea López', null, '012180001234567899');
  if (select count(*) from hon_datos_pago) <> 1 then raise exception 'FALLO T3c: no ve lo suyo'; end if;
end $$;

do $$ begin raise notice '0161 OK'; end $$;
