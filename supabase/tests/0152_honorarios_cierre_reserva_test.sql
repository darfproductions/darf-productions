-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0152 aplicadas.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001520c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t152c@test.local'),
  ('00000000-0000-0000-0000-0000001520e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t152p@test.local');
insert into panel_roles (id, nombre, alcance, categoria) values ('t152_x','X','casa','casa');
insert into casa_members (user_id, role_id) values ('00000000-0000-0000-0000-0000001520c1','t152_x');
insert into casa_cargos (user_id, directivo) values ('00000000-0000-0000-0000-0000001520c1', true);
insert into productions (id, nombre, estado) values ('t152_e','Encanto 152','borrador');
insert into hon_obras (production_id, mensual) values ('t152_e', true);
insert into people (id, nombre, profile_id) values ('00000000-0000-0000-0000-0000001520f1','Profe 152','00000000-0000-0000-0000-0000001520e2');
create function pg_temp.yo(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); perform set_config('role','authenticated',true); end $$;
create function pg_temp.root() returns void language plpgsql as $$ begin perform set_config('role','postgres',true); perform set_config('request.jwt.claims','',true); end $$;
do $$ declare c uuid; f1 text; f2 text; n int; begin
  perform pg_temp.yo('00000000-0000-0000-0000-0000001520c1');
  -- Préstamo de la reserva a la obra.
  insert into hon_reserva_movs (tipo, production_id, monto, concepto) values ('prestamo', 't152_e', 3000, 'Vestuario');
  insert into hon_cierres (production_id, nombre, prestamos) values ('t152_e', 'Temporada 2027', 3000) returning id into c;
  insert into hon_cierre_partidas (cierre_id, tipo, concepto, monto) values (c, 'patrocinio', 'Patrocinio X', 5000), (c, 'costo', 'Teatro', 20000);
  if hon_boletos_obra('t152_e') <> 0 then raise exception 'FALLO: boletos'; end if;
  perform hon_cierre_cerrar(c, 50000, 100, 4.5, '{"x":1}', '[{"person_id":"00000000-0000-0000-0000-0000001520f1","nombre":"Profe 152","pago":100,"bruto":104.5,"partes":[]}]');
  -- Cerrado: ya no se edita ni se vuelve a cerrar.
  begin perform hon_cierre_cerrar(c, 1, 1, 0, '{}', '[]'); raise exception 'FALLO: doble cierre'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin insert into hon_cierre_partidas (cierre_id, tipo, concepto, monto) values (c, 'costo', 'Tarde', 1); raise exception 'FALLO: partida tras cerrar'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- La reserva: préstamo devuelto y sobrante sumado.
  select count(*) into n from hon_reserva_movs where cierre_id = c;
  if n <> 2 then raise exception 'FALLO: movimientos del cierre (%)', n; end if;
  -- Marcar pagado: folio consecutivo; la persona confirma.
  perform hon_cierre_marcar_pagado(c, '00000000-0000-0000-0000-0000001520f1', null);
  select folio into f1 from hon_cierre_personas where cierre_id = c;
  if f1 !~ '^H-\d{4}-\d{4}$' then raise exception 'FALLO: folio %', f1; end if;
  perform hon_cierre_marcar_pagado(c, '00000000-0000-0000-0000-0000001520f1', 'cierre-' || c || '/00000000-0000-0000-0000-0000001520f1/a.webp');
  select folio into f2 from hon_cierre_personas where cierre_id = c;
  if f2 <> f1 then raise exception 'FALLO: el folio cambió'; end if;
  perform pg_temp.yo('00000000-0000-0000-0000-0000001520e2');
  if (select count(*) from hon_cierre_personas) <> 1 then raise exception 'FALLO: no ve lo suyo'; end if;
  if not hon_puede_ver_comprobante('cierre-' || c || '/00000000-0000-0000-0000-0000001520f1/a.webp') then raise exception 'FALLO: no ve su comprobante'; end if;
  if exists (select 1 from hon_reserva_movs) or exists (select 1 from hon_cierres) then raise exception 'FALLO: ve la reserva o los cierres'; end if;
  if hon_boletos_obra('t152_e') is not null then raise exception 'FALLO: ve boletos'; end if;
  perform hon_cierre_me_llego(c);
  perform pg_temp.root();
  raise notice '0152 OK';
end $$;
rollback;
