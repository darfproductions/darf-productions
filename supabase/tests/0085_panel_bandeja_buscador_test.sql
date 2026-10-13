-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0085 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_puerta@test.local'),
       ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taquilla@test.local'),
       ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cobros_ev@test.local'),
       ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set nombre = 'Ximena Fan Ávila' where id = '00000000-0000-0000-0000-0000000000b5';
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-0000000000b2', 'puerta'),
  ('showman', '00000000-0000-0000-0000-0000000000b3', 'taquilla');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- Datos: un evento de DARF con pago pendiente y equipo propio de cobros; una convocatoria general
-- con su juez por equipo propio y una solicitud; una orden de boletos pendiente en showman.
do $$ declare e uuid; o uuid; a uuid; pf uuid; oc text; begin
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio)
  values ('presencial', 'Gala de prueba', now() + interval '2 days', 'Foro', 'cuenta', true, false, 90) returning id into e;
  insert into fan_encuentro_lugares (encuentro_id, user_id) values (e, '00000000-0000-0000-0000-0000000000b5');
  insert into evento_ordenes (encuentro_id, user_id, codigo, monto, expires_at) values (e, '00000000-0000-0000-0000-0000000000b5', 'EV-ABC123', 90, now() + interval '1 day');
  insert into evento_equipo (encuentro_id, user_id, papel) values (e, '00000000-0000-0000-0000-0000000000b4', 'cobros');
  insert into auditions (titulo, estado, production_id) values ('Convocatoria General de Prueba', 'abierta', null) returning id into a;
  insert into audition_members (audition_id, user_id, role_id)
    select a, '00000000-0000-0000-0000-0000000000b6', r.role_id from role_permissions r where r.permission_id = 'audiciones.gestionar' limit 1;
  insert into audition_applications (audition_id, user_id, estado, nombre, fecha_nacimiento, telefono) values (a, '00000000-0000-0000-0000-0000000000b5', 'inscrito', 'Ximena', '2005-01-01', '4420000000');
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '3 days', true) returning id into pf;
  insert into orders (performance_id, status, buyer_nombre, buyer_telefono, total) values (pf, 'pendiente', 'Comprador Prueba', '4420000000', 100) returning order_code into oc;
  insert into ctx values ('e', e), ('a', a), ('oc', oc);
end $$;

-- T1: la bandeja.
do $$ declare e text := (select v from ctx where k = 'e'); a text := (select v from ctx where k = 'a'); cnt int; begin
  -- Director: pago de evento (con su evento) y solicitud de la convocatoria (con su id).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  if not exists (select 1 from panel_pendientes() where tipo = 'pagos_evento' and ref_id = e and panel_pendientes.n = 1 and ref_titulo = 'Gala de prueba') then raise exception 'FALLO T1: Director sin pago de evento'; end if;
  if not exists (select 1 from panel_pendientes() where tipo = 'solicitudes' and ref_id = a and panel_pendientes.n = 1) then raise exception 'FALLO T1: Director sin solicitud'; end if;
  if (panel_home()->'pendientes') is null or not exists (select 1 from jsonb_array_elements(panel_home()->'pendientes') x where x->>'tipo' = 'pagos_evento') then raise exception 'FALLO T1: panel_home sin pago'; end if;
  if not exists (select 1 from jsonb_array_elements(panel_home()->'eventos') x where x->>'id' = e and (x->>'cobros')::boolean) then raise exception 'FALLO T1: agenda sin evento'; end if;
  -- Equipo del evento (solo cobros): ve su pago, nada más.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
  select count(*) into cnt from panel_pendientes() x where x.n > 0;
  if cnt <> 1 or not exists (select 1 from panel_pendientes() where tipo = 'pagos_evento' and ref_id = e) then raise exception 'FALLO T1: cobros del evento ve %', cnt; end if;
  -- Juez por equipo propio de la convocatoria general: ve sus solicitudes.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  if not exists (select 1 from panel_pendientes() where tipo = 'solicitudes' and ref_id = a) then raise exception 'FALLO T1: equipo de convocatoria'; end if;
  -- Puerta de showman: nada de pagos ni solicitudes.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  if exists (select 1 from panel_pendientes() where tipo in ('pagos_evento', 'solicitudes', 'documentos', 'decision') and panel_pendientes.n > 0) then raise exception 'FALLO T1: puerta ve pendientes ajenos'; end if;
end $$;

-- T2: el buscador respeta permisos.
do $$ declare n int; oc text := (select v from ctx where k = 'oc'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  if not exists (select 1 from panel_buscar('ximena avila') where tipo = 'persona') then raise exception 'FALLO T2: persona sin acentos'; end if;
  if not exists (select 1 from panel_buscar(lower(left(oc, 8))) where tipo = 'orden' and href like '%/boletos?codigo=' || oc) then raise exception 'FALLO T2: orden'; end if;
  if not exists (select 1 from panel_buscar('EV-ABC') where tipo = 'orden_evento') then raise exception 'FALLO T2: orden de evento'; end if;
  if not exists (select 1 from panel_buscar('convocatoria general') where tipo = 'convocatoria') then raise exception 'FALLO T2: convocatoria'; end if;
  if not exists (select 1 from panel_buscar('gala') where tipo = 'evento') then raise exception 'FALLO T2: evento'; end if;
  if exists (select 1 from panel_buscar('x')) then raise exception 'FALLO T2: una letra'; end if;
  -- Taquilla de showman: encuentra la orden de boletos; no personas ni la orden del evento.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  if not exists (select 1 from panel_buscar(oc) where tipo = 'orden') then raise exception 'FALLO T2: taquilla orden'; end if;
  if exists (select 1 from panel_buscar('EV-ABC')) or exists (select 1 from panel_buscar('ximena')) then raise exception 'FALLO T2: taquilla ve de más'; end if;
  -- Puerta: no encuentra órdenes.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  if exists (select 1 from panel_buscar(oc)) then raise exception 'FALLO T2: puerta ve órdenes'; end if;
  -- Cobros del evento: su orden de evento y su evento.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
  if not exists (select 1 from panel_buscar('EV-ABC')) or not exists (select 1 from panel_buscar('gala')) then raise exception 'FALLO T2: cobros del evento'; end if;
  if exists (select 1 from panel_buscar('convocatoria')) then raise exception 'FALLO T2: cobros ve convocatorias'; end if;
end $$;

select 'OK 0085' as resultado;
