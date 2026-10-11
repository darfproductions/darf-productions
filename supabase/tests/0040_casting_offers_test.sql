-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0040 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (aud uuid, app1 uuid, walk uuid, o1 uuid, o2 uuid, o3 uuid);
grant all on ctx to authenticated, anon;

do $$ declare a uuid; r json; w json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_juez@test.local', 'juez');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into auditions (production_id, titulo, estado) values ('showman', 'Showman', 'abierta') returning id into a;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(a, jsonb_build_object('nombre', 'Ana Actriz', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  w := audition_walk_in(a, jsonb_build_object('nombre', 'Sin Cuenta', 'telefono', '55', 'fecha_nacimiento', '1990-01-01'));
  insert into ctx (aud, app1, walk) values (a, (r->>'application_id')::uuid,
    (select id from audition_applications where audition_id = a and walk_in));
  reset role;
end $$;

-- T1: mandar ofertas (desde la audición y por correo); un juez no puede; sin cuenta, no
do $$ declare o uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  begin
    perform casting_offer_send(jsonb_build_object('production_id', 'showman', 'application_id', (select app1 from ctx), 'tipo', 'reparto', 'papel', 'Barnum'));
    raise exception 'FALLO T1: un juez mandó una oferta';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T1a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  o := casting_offer_send(jsonb_build_object('production_id', 'showman', 'application_id', (select app1 from ctx), 'tipo', 'reparto', 'papel', 'Jenny Lind', 'mensaje', '¡Felicidades!'));
  update ctx set o1 = o;
  begin
    perform casting_offer_send(jsonb_build_object('production_id', 'showman', 'application_id', (select app1 from ctx), 'tipo', 'reparto', 'papel', 'Jenny Lind'));
    raise exception 'FALLO T1: oferta repetida';
  exception when raise_exception then
    if sqlerrm not like 'Ya tiene esa misma oferta%' then raise exception 'FALLO T1b: %', sqlerrm; end if;
  end;
  begin
    perform casting_offer_send(jsonb_build_object('production_id', 'showman', 'application_id', (select walk from ctx), 'tipo', 'ensamble'));
    raise exception 'FALLO T1: oferta a alguien sin cuenta';
  exception when raise_exception then
    if sqlerrm not like '%no tiene cuenta%' then raise exception 'FALLO T1c: %', sqlerrm; end if;
  end;
  o := casting_offer_send(jsonb_build_object('production_id', 'showman', 'email', 'T_FAN2@test.local', 'tipo', 'tecnico', 'papel', 'Luces'));
  update ctx set o2 = o;
  o := casting_offer_send(jsonb_build_object('production_id', 'showman', 'email', 't_fan2@test.local', 'tipo', 'ensamble'));
  update ctx set o3 = o;
  reset role;
end $$;

-- T2: cada quien ve solo sus ofertas; aceptar crea persona, crédito e Integrante
do $$ declare n int; r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from my_casting_offers();
  if n <> 2 then raise exception 'FALLO T2a: fan2 ve % ofertas', n; end if;
  select count(*) into n from casting_offers where id = (select o1 from ctx);
  if n <> 0 then raise exception 'FALLO T2b: fan2 ve la oferta de otra persona'; end if;
  begin
    perform casting_offer_respond((select o1 from ctx), true);
    raise exception 'FALLO T2: aceptó la oferta de otra persona';
  exception when raise_exception then
    if sqlerrm not like 'No se encontró%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := casting_offer_respond((select o1 from ctx), true);
  if r->>'estado' <> 'aceptada' then raise exception 'FALLO T2d: %', r; end if;
  reset role;
  select count(*) into n from production_credits c join people p on p.id = c.person_id
   where c.production_id = 'showman' and c.tipo = 'reparto' and c.papel = 'Jenny Lind'
     and p.profile_id = '00000000-0000-0000-0000-0000000000c1' and p.nombre = 'Ana Actriz';
  if n <> 1 then raise exception 'FALLO T2e: no se creó el crédito con su nombre'; end if;
  select count(*) into n from production_members where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000000c1' and role_id = 'integrante';
  if n <> 1 then raise exception 'FALLO T2f: no quedó como Integrante'; end if;
  if (select estado from audition_applications where id = (select app1 from ctx)) <> 'seleccionado' then raise exception 'FALLO T2g: la solicitud no quedó seleccionada'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform casting_offer_respond((select o1 from ctx), true);
    raise exception 'FALLO T2: aceptó dos veces';
  exception when raise_exception then
    if sqlerrm not like 'Esta oferta ya no está disponible%' then raise exception 'FALLO T2h: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T3: declinar, retirar; un integrante no es "equipo" ni entra al panel
do $$ declare n int; r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  r := casting_offer_respond((select o2 from ctx), false);
  if r->>'estado' <> 'declinada' then raise exception 'FALLO T3a: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform casting_offer_withdraw((select o3 from ctx));
  select count(*) into n from casting_offer_list('showman') where nombre is not null and email is not null;
  if n <> 3 then raise exception 'FALLO T3g: la lista de ofertas tiene % filas', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform casting_offer_respond((select o3 from ctx), true);
    raise exception 'FALLO T3: aceptó una oferta retirada';
  exception when raise_exception then
    if sqlerrm not like 'Esta oferta ya no está disponible%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if in_production_team('showman') then raise exception 'FALLO T3c: el Integrante cuenta como equipo'; end if;
  select count(*) into n from my_panel_access();
  if n <> 0 then raise exception 'FALLO T3d: el Integrante tiene permisos de panel'; end if;
  begin
    perform casting_offer_list('showman');
    raise exception 'FALLO T3: el Integrante vio la lista de ofertas';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T3h: %', sqlerrm; end if;
  end;
  select count(*) into n from casting_offers where production_id = 'showman' and user_id <> auth.uid();
  if n <> 0 then raise exception 'FALLO T3e: el Integrante ve ofertas de otros'; end if;
  reset role;
  select count(*) into n from audit_log where tabla = 'casting_offers';
  if n < 3 then raise exception 'FALLO T3f: la bitácora no registró las ofertas'; end if;
end $$;

do $$ begin raise exception 'OK: 0040 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
