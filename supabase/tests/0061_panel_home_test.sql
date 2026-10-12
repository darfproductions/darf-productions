-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0061 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local');
update profiles set rol = 'admin', nombre = 'Diego' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set nombre = 'Ana' where id = '00000000-0000-0000-0000-0000000000e1';

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

do $$ declare h jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform set_config('role', 'postgres', true);
  insert into casting_offers (production_id, user_id, tipo, papel) values ('showman', '00000000-0000-0000-0000-0000000000e1', 'reparto', 'Barnum');
  insert into performances (production_id, starts_at) values ('showman', now() + interval '2 days'), ('showman', now() + interval '20 days');
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Ensayo general', now() + interval '1 day');

  -- T1: Producción ve todo lo de su obra
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  h := panel_home();
  if not exists (select 1 from jsonb_array_elements(h->'pendientes') x where x->>'tipo' = 'ofertas' and x->>'production_id' = 'showman' and (x->>'n')::int = 1) then
    raise exception 'FALLO T1a: no ve la oferta pendiente %', h->'pendientes'; end if;
  if jsonb_array_length(h->'funciones') <> 1 then raise exception 'FALLO T1b: funciones de la semana %', h->'funciones'; end if;
  if jsonb_array_length(h->'ensayos') <> 1 then raise exception 'FALLO T1c: ensayos'; end if;
  if jsonb_array_length(h->'cambios') = 0 then raise exception 'FALLO T1d: sin cambios recientes'; end if;
  if not exists (select 1 from jsonb_array_elements(h->'cambios') x where x->>'actor_nombre' = 'Diego') then raise exception 'FALLO T1e: sin nombre del autor'; end if;
  if exists (select 1 from jsonb_array_elements(h->'funciones') x where x->>'production_id' <> 'showman') then raise exception 'FALLO T1f: ve otras obras'; end if;

  -- T2: Taquilla ve funciones, pero no ofertas, ensayos ni bitácora
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  h := panel_home();
  if jsonb_array_length(h->'funciones') <> 1 then raise exception 'FALLO T2a: taquilla sin funciones'; end if;
  if jsonb_array_length(h->'pendientes') <> 0 or jsonb_array_length(h->'ensayos') <> 0 or jsonb_array_length(h->'cambios') <> 0 then
    raise exception 'FALLO T2b: taquilla ve de más %', h; end if;

  -- T3: un integrante o un fan no ven nada
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  h := panel_home();
  if jsonb_array_length(h->'funciones') + jsonb_array_length(h->'cambios') + jsonb_array_length(h->'pendientes') <> 0 then raise exception 'FALLO T3a: fan ve datos'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  h := panel_home();
  if jsonb_array_length(h->'cambios') + jsonb_array_length(h->'pendientes') + jsonb_array_length(h->'ensayos') <> 0 then raise exception 'FALLO T3b: integrante ve datos %', h; end if;

  -- T4: el Director ve las de todas las obras
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  h := panel_home();
  if jsonb_array_length(h->'cambios') = 0 or jsonb_array_length(h->'ensayos') <> 1 then raise exception 'FALLO T4'; end if;

  -- T5: anónimo no entra
  perform pg_temp.as_anon();
  begin
    h := panel_home();
    raise exception 'FALLO T5: anónimo leyó';
  exception when insufficient_privilege then null;
  end;

  raise exception 'OK: 0061 inicio del panel';
end $$;
