-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029–0069 aplicadas y el contenido de DEV cargado.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('hsm', 't_cont@test.local', 'contenido');
  perform panel_add_member('hsm', 't_juez@test.local', 'juez');
  reset role;
end $$;

do $$ declare n int; ok boolean; v_estilo text; v_color text; begin
  if not production_is_visible('hsm') then raise exception 'FALLO: hsm debería ser pública para esta prueba'; end if;

  -- T1: Contenido guarda la franja; los avisos vacíos no se guardan; el orden se respeta.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform panel_set_banner('hsm', 'fija', '#ff3366', true,
    '[{"texto":"¡Últimas funciones!","enlace":"/producciones/hsm#funciones","boton":"Comprar"},
      {"texto":"  "},
      {"texto":"2x1 los jueves","inicia":"2026-01-01T00:00:00-06:00","termina":"2026-12-31T23:59:00-06:00"}]'::jsonb);
  select count(*) into n from production_banner_items where production_id = 'hsm';
  if n <> 2 then raise exception 'FALLO T1: % avisos', n; end if;
  if (select texto from production_banner_items where production_id = 'hsm' order by orden limit 1) <> '¡Últimas funciones!' then
    raise exception 'FALLO T1: orden'; end if;
  select estilo, color into v_estilo, v_color from production_banner where production_id = 'hsm';
  if v_estilo <> 'fija' or v_color <> '#ff3366' then raise exception 'FALLO T1: config % %', v_estilo, v_color; end if;

  -- T2: volver a guardar reemplaza (no duplica) y el color vacío vuelve al de la obra.
  perform panel_set_banner('hsm', 'corre', '', true, '[{"texto":"Solo uno"}]'::jsonb);
  select count(*) into n from production_banner_items where production_id = 'hsm';
  if n <> 1 then raise exception 'FALLO T2: % avisos', n; end if;
  if (select color from production_banner where production_id = 'hsm') is not null then raise exception 'FALLO T2: color'; end if;

  -- T3: ligas peligrosas, fechas al revés, color inválido y más de 10 avisos se rechazan.
  foreach v_estilo in array array['//evil.com', 'javascript:alert(1)', 'http://inseguro.com', '/\evil.com'] loop
    ok := false;
    begin perform panel_set_banner('hsm', 'corre', null, true, jsonb_build_array(jsonb_build_object('texto', 'x', 'enlace', v_estilo)));
    exception when check_violation then ok := true; end;
    if not ok then raise exception 'FALLO T3: aceptó la liga %', v_estilo; end if;
  end loop;
  ok := false;
  begin perform panel_set_banner('hsm', 'corre', null, true, '[{"texto":"x","inicia":"2026-05-02T00:00:00Z","termina":"2026-05-01T00:00:00Z"}]'::jsonb);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T3: fechas al revés'; end if;
  ok := false;
  begin perform panel_set_banner('hsm', 'corre', 'rojo', true, '[]'::jsonb); exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T3: color inválido'; end if;
  ok := false;
  begin perform panel_set_banner('hsm', 'corre', null, true, (select jsonb_agg(jsonb_build_object('texto', 'a' || g)) from generate_series(1, 11) g));
  exception when raise_exception then ok := true; end;
  if not ok then raise exception 'FALLO T3: más de 10 avisos'; end if;
  -- Lo anterior sigue ahí.
  if (select count(*) from production_banner_items where production_id = 'hsm') <> 1 then raise exception 'FALLO T3: se perdió la franja'; end if;

  -- T4: un juez (sin obra.editar) no puede, ni por RPC ni directo.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  ok := false;
  begin perform panel_set_banner('hsm', 'corre', null, true, '[{"texto":"hack"}]'::jsonb); exception when raise_exception then ok := true; end;
  if not ok then raise exception 'FALLO T4: juez editó'; end if;
  update production_banner_items set texto = 'hack' where production_id = 'hsm';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T4: juez editó directo'; end if;

  -- T5: el público la lee (obra visible); nadie escribe sin permiso.
  perform pg_temp.as_anon();
  select count(*) into n from production_banner_items where production_id = 'hsm';
  if n <> 1 then raise exception 'FALLO T5: anon no ve la franja'; end if;
  ok := false;
  begin insert into production_banner_items (production_id, texto) values ('hsm', 'spam'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T5: anon escribió'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from production_banner where production_id = 'hsm';
  if n <> 1 then raise exception 'FALLO T5: fan no ve la franja'; end if;
  reset role;

  -- T6: obra no visible → el público no ve su franja.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  update productions set estado = 'borrador' where id = 'hsm';
  perform pg_temp.as_anon();
  select count(*) into n from production_banner_items where production_id = 'hsm';
  if n <> 0 then raise exception 'FALLO T6: franja de obra oculta visible'; end if;
  reset role;

  raise exception 'OK: 0069 franja de avisos';
end $$;
