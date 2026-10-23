-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0125 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c51', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't125_admin@test.local'),
  ('00000000-0000-0000-0000-000000000c52', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't125_comprador@test.local'),
  ('00000000-0000-0000-0000-000000000c53', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't125_nadie@test.local');
update profiles set rol = 'admin', nombre = 'Admin 125' where id = '00000000-0000-0000-0000-000000000c51';

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

insert into productions (id, nombre, estado) values ('t125_obra', 'Obra 125', 'borrador');

do $$
declare vip uuid; pf uuid; s1 uuid; s2 uuid; o1 uuid; o2 uuid; t1 uuid; t2 uuid; q1 text;
        poster uuid; foto uuid; antes uuid; acc uuid; r record; j json; ok boolean; n int;
        adm uuid := '00000000-0000-0000-0000-000000000c51';
begin
  -- T0: fechas límite en hora de México (función el 10 de marzo a las 20:00).
  r := beneficio_limite('2027-03-10 20:00-06', 'antes', 3);
  if r.desde <> '2027-03-07 00:00-06' or r.limite <> '2027-03-10 20:00-06' then raise exception 'FALLO T0 antes: %', r; end if;
  r := beneficio_limite('2027-03-10 20:00-06', 'dia_antes', null);
  if r.desde <> '2027-03-10 00:00-06' or r.limite <> '2027-03-10 20:00-06' then raise exception 'FALLO T0 dia_antes: %', r; end if;
  r := beneficio_limite('2027-03-10 20:00-06', 'dia_despues', null);
  if r.desde <> '2027-03-10 20:00-06' or r.limite <> '2027-03-11 00:00-06' then raise exception 'FALLO T0 dia_despues: %', r; end if;
  r := beneficio_limite('2027-03-10 20:00-06', 'despues', 7);
  if r.desde <> '2027-03-11 00:00-06' or r.limite <> '2027-03-18 00:00-06' then raise exception 'FALLO T0 despues: %', r; end if;

  insert into price_categories (production_id, nombre) values ('t125_obra', 'VIP') returning id into vip;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t125_obra', 'A', 1, 'VIP-A-1', vip) returning id into s1;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t125_obra', 'A', 2, 'VIP-A-2', vip) returning id into s2;
  -- Función hace 2 horas: el póster (al terminar) ya se puede entregar; el acceso (antes) ya venció.
  insert into performances (production_id, starts_at, on_sale) values ('t125_obra', now() - interval '2 hours', true) returning id into pf;

  -- T1: momento por omisión y validación de días.
  insert into zona_beneficios (production_id, tipo, nombre, orden) values ('t125_obra', 'souvenir', 'Póster firmado', 1) returning id into poster;
  insert into zona_beneficios (production_id, tipo, nombre, minutos_antes, orden) values ('t125_obra', 'acceso', 'Acceso anticipado', 15, 2) returning id into acc;
  insert into zona_beneficios (production_id, tipo, nombre, entrega, entrega_dias, orden) values ('t125_obra', 'experiencia', 'Foto con el elenco', 'despues', 3, 3) returning id into foto;
  insert into zona_beneficios (production_id, tipo, nombre, entrega, entrega_dias, orden, activo) values ('t125_obra', 'souvenir', 'Kit previo', 'antes', 5, 4, true) returning id into antes;
  if (select entrega from zona_beneficios where id = poster) <> 'dia_despues' or (select entrega from zona_beneficios where id = acc) <> 'dia_antes' then
    raise exception 'FALLO T1: momento por omisión';
  end if;
  begin insert into zona_beneficios (production_id, nombre, entrega) values ('t125_obra', 'Sin días', 'despues'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: despues sin días'; end if;
  insert into zona_beneficio_zonas values (poster, vip), (acc, vip), (foto, vip), (antes, vip);

  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, approved_at)
    values ('T125A', pf, 'aprobado', 'Ana', '5512345678', '00000000-0000-0000-0000-000000000c52', 100, now() - interval '3 days') returning id into o1;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total)
    values ('T125B', pf, 'pendiente', 'Beto', '5512345679', 100) returning id into o2;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o1, pf, s1, 100) returning id, qr_token::text into t1, q1;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o2, pf, s2, 100) returning id into t2;

  -- T2: estados del boleto pagado.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c52');
  j := beneficios_boleto(t1);
  perform pg_temp.as_root();
  if (j->0->>'estado') <> 'hoy' then raise exception 'FALLO T2 póster: %', j->0; end if;
  if (j->1->>'estado') <> 'vencido' then raise exception 'FALLO T2 acceso: %', j->1; end if;
  if (j->2->>'estado') <> 'pendiente' then raise exception 'FALLO T2 foto: %', j->2; end if;
  if (j->3->>'estado') <> 'vencido' then raise exception 'FALLO T2 kit previo: %', j->3; end if;
  if (j->2->>'entrega') <> 'despues' or (j->2->>'entrega_dias')::int <> 3 then raise exception 'FALLO T2 momento: %', j->2; end if;

  -- T3: orden sin pagar: estado por_pagar, fuera de la lista y no se puede entregar.
  perform pg_temp.as_user(adm);
  j := beneficios_boleto(t2);
  if (j->0->>'estado') <> 'por_pagar' then raise exception 'FALLO T3: %', j->0; end if;
  begin perform beneficio_entregar_boleto(t2, poster, true, null); ok := false; exception when others then ok := sqlerrm like '%pagada%'; end;
  if not ok then raise exception 'FALLO T3: entregó sin pagar'; end if;
  select count(*) into n from beneficios_entregas(pf);
  if n <> 4 then raise exception 'FALLO T3: la lista trae % filas', n; end if;

  -- T4: marcar desde la lista con nota; desde la puerta (QR) sin nota no borra la nota; desmarcar.
  j := beneficio_entregar_boleto(t1, foto, true, '  Enviada por correo  ');
  select * into r from beneficios_entregas(pf) x where x.beneficio_id = foto;
  if r.estado <> 'entregado' or r.nota <> 'Enviada por correo' or r.entregado_por <> 'Admin 125' then raise exception 'FALLO T4 lista: %', r; end if;
  perform beneficio_entregar(q1, foto, true);
  if (select nota from beneficio_entregas where ticket_id = t1 and beneficio_id = foto) <> 'Enviada por correo' then raise exception 'FALLO T4: se borró la nota'; end if;
  perform beneficio_entregar(q1, poster, true, 'En el lobby');
  begin perform beneficio_entregar_boleto(t1, poster, true, repeat('x', 201)); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: nota larga'; end if;
  if (select count(*) from audit_log where tabla = 'beneficio_entregas' and production_id = 't125_obra') < 3 then raise exception 'FALLO T4: bitácora'; end if;

  -- T5: pendientes de la obra y reporte por función.
  r := beneficios_pendientes('t125_obra');
  if r.vencidos <> 2 or r.hoy <> 0 or r.pendientes <> 2 then raise exception 'FALLO T5 pendientes: %', r; end if;
  select * into r from beneficios_reporte(pf) x where x.beneficio_id = acc;
  if r.con_derecho <> 1 or r.entregados <> 0 or r.vencidos <> 1 or r.pendientes <> 1 then raise exception 'FALLO T5 reporte: %', r; end if;
  perform beneficio_entregar_boleto(t1, poster, false, null);
  r := beneficios_pendientes('t125_obra');
  if r.hoy <> 1 or r.pendientes <> 3 then raise exception 'FALLO T5 desmarcar: %', r; end if;

  -- T6: quien no es del equipo no ve ni marca.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c53');
  begin perform beneficios_entregas(pf); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T6: lista'; end if;
  begin perform beneficios_pendientes('t125_obra'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T6: pendientes'; end if;
  begin perform beneficio_entregar_boleto(t1, poster, true, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T6: marcar'; end if;

  -- T7: el WhatsApp de la orden trae el momento.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c52');
  j := orden_beneficios(o1);
  if (j->0->'beneficios'->2->>'entrega') <> 'despues' then raise exception 'FALLO T7: %', j; end if;
  perform pg_temp.as_root();
end $$;

select 'TODO OK' as resultado;
