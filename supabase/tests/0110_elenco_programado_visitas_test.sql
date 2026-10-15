-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0110 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't110_admin@test.local'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't110_socio@test.local'),
  ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't110_cuenta@test.local'),
  ('00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't110_acomp@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000a01';
update profiles set nombre = 'Sofi Socia' where id = '00000000-0000-0000-0000-000000000a02';
insert into fan_members (user_id) values ('00000000-0000-0000-0000-000000000a02');

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
create temp table t110 (k text primary key, v uuid);
grant all on t110 to public;

-- Obra visible (sin tocar la guarda de la plantilla) con dos personas en el reparto.
insert into productions (id, nombre, estado) values ('t110_obra', 'Obra 110', 'borrador');
do $$ begin
  alter table productions disable trigger user;
  update productions set estado = 'publicada' where id = 't110_obra';
  alter table productions enable trigger user;
end $$;
insert into people (id, nombre) values
  ('00000000-0000-0000-0000-00000000a101', 'Ana Programada'),
  ('00000000-0000-0000-0000-00000000a102', 'Beto Inmediato');
insert into production_credits (production_id, person_id, tipo, papel) values
  ('t110_obra', '00000000-0000-0000-0000-00000000a101', 'reparto', 'Brady'),
  ('t110_obra', '00000000-0000-0000-0000-00000000a102', 'reparto', 'Troy');

-- T1: programado en el pasado sale con elenco_publicar_programado; en el futuro no.
do $$ declare n int; begin
  update production_credits set publicar_at = now() - interval '1 minute', avisar_club = true
   where person_id = '00000000-0000-0000-0000-00000000a101';
  update production_credits set publicar_at = now() + interval '1 day'
   where person_id = '00000000-0000-0000-0000-00000000a102';
  n := elenco_publicar_programado();
  if n <> 1 then raise exception 'FALLO T1: publicó %', n; end if;
  if not (select publicado and publicar_at is null from production_credits where person_id = '00000000-0000-0000-0000-00000000a101') then
    raise exception 'FALLO T1: no quedó publicado';
  end if;
  if (select publicado from production_credits where person_id = '00000000-0000-0000-0000-00000000a102') then
    raise exception 'FALLO T1: el futuro salió antes';
  end if;
end $$;

-- T2: el aviso llegó solo a la socia, una vez, con el personaje; avisar_club se apaga.
do $$ begin
  if (select count(*) from notifications where tipo = 'fanzone' and production_id = 't110_obra') <> 1 then
    raise exception 'FALLO T2: % avisos', (select count(*) from notifications where tipo = 'fanzone' and production_id = 't110_obra');
  end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000a02' and titulo = 'Conoce a quien será Brady en Obra 110') then
    raise exception 'FALLO T2: texto';
  end if;
  if (select avisar_club from production_credits where person_id = '00000000-0000-0000-0000-00000000a101') then raise exception 'FALLO T2: avisar_club'; end if;
end $$;

-- T3: publicar a mano limpia lo programado y, sin aviso, no notifica.
do $$ begin
  update production_credits set publicado = true where person_id = '00000000-0000-0000-0000-00000000a102';
  if (select publicar_at from production_credits where person_id = '00000000-0000-0000-0000-00000000a102') is not null then raise exception 'FALLO T3: programado'; end if;
  if (select count(*) from notifications where production_id = 't110_obra' and tipo = 'fanzone') <> 1 then raise exception 'FALLO T3: avisó sin pedirlo'; end if;
end $$;

-- T4: "Publicar todo" con aviso: una sola notificación por obra.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
  perform elenco_avisar_club('t110_obra');
  perform pg_temp.as_root();
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000a02' and titulo = 'Ya se reveló el elenco de Obra 110') then
    raise exception 'FALLO T4';
  end if;
end $$;

-- T5: visitas en la puerta. 2 boletos de la cuenta, entra 1: solo cabe 1 visita.
do $$ declare pf uuid; o uuid; t1 uuid; t2 uuid; r json; b1 text; b2 text; begin
  insert into performances (production_id, starts_at, on_sale) values ('t110_obra', now() - interval '1 hour', false) returning id into pf;
  insert into t110 values ('pf', pf);
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T110A', pf, 'aprobado', 'Cuenta', '5512345678', '00000000-0000-0000-0000-000000000a03', 200) returning id into o;
  insert into tickets (order_id, performance_id, unit_price, checked_in_at) values (o, pf, 100, now()) returning id into t1;
  insert into tickets (order_id, performance_id, unit_price) values (o, pf, 100) returning id into t2;
  insert into t110 values ('t2', t2);
  -- La compradora ya no suma con solo entrar.
  if fan_visitas('00000000-0000-0000-0000-000000000a03') <> 0 then raise exception 'FALLO T5: cuenta sin pase'; end if;
  insert into badges (user_id, token, codigo) values
    ('00000000-0000-0000-0000-000000000a02', badge_nuevo_token(), badge_nuevo_codigo()),
    ('00000000-0000-0000-0000-000000000a04', badge_nuevo_token(), badge_nuevo_codigo()) on conflict do nothing;
  select token into b1 from badges where user_id = '00000000-0000-0000-0000-000000000a02';
  select codigo into b2 from badges where user_id = '00000000-0000-0000-0000-000000000a04';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
  r := puerta_visita(pf, 'https://darfproductions.com/g/' || b1);
  if r->>'resultado' <> 'ok' or r->>'nombre' <> 'Sofi Socia' or (r->>'visitas')::int <> 1 then raise exception 'FALLO T5: %', r; end if;
  r := puerta_visita(pf, b1);
  if r->>'resultado' <> 'ya' then raise exception 'FALLO T5 ya: %', r; end if;
  r := puerta_visita(pf, b2);
  if r->>'resultado' <> 'sin_boleto' then raise exception 'FALLO T5 tope: %', r; end if;
  r := puerta_visita(pf, 'nada');
  if r->>'resultado' <> 'no_encontrado' then raise exception 'FALLO T5 no encontrado: %', r; end if;
  perform pg_temp.as_root();
  -- Entra el segundo boleto: ya cabe la acompañante.
  update tickets set checked_in_at = now() where id = (select v from t110 where k = 't2');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
  r := puerta_visita(pf, b2);
  perform pg_temp.as_root();
  if r->>'resultado' <> 'ok' then raise exception 'FALLO T5 acompañante: %', r; end if;
end $$;

-- T6: sin permiso de puerta no se puede.
do $$ declare ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a03');
  begin perform puerta_visita((select v from t110 where k = 'pf'), 'DRF-AAAA'); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T6'; end if;
end $$;

-- T7: el ranking de vendedores trae boletos.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
  perform boletos from director_sellers();
  perform pg_temp.as_root();
end $$;
