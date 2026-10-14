-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0103 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't103_ana@test.local'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't103_beto@test.local');
insert into productions (id, nombre, estado) values
  ('t103_a', 'Obra A', 'borrador'), ('t103_b', 'Obra B', 'borrador'), ('t103_c', 'Obra C', 'borrador'),
  ('t103_d', 'Obra D', 'cancelada'), ('t103_e', 'Obra E', 'borrador');
insert into people (id, nombre, profile_id) values
  ('00000000-0000-0000-0000-00000000e101', 'Ana', '00000000-0000-0000-0000-000000000e01');

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

-- T1: sin obras, cero.
do $$ begin
  if lealtad_producciones('00000000-0000-0000-0000-000000000e01') <> 0 then raise exception 'FALLO T1'; end if;
  if lealtad_producciones(null) <> 0 then raise exception 'FALLO T1: null'; end if;
end $$;

-- T2: equipo y elenco cuentan; la misma obra por los dos lados cuenta una vez; cancelada y baja no.
do $$ declare r text := (select min(id) from panel_roles where coalesce(alcance, 'obra') = 'obra'); begin
  insert into production_members (production_id, user_id, role_id) values
    ('t103_a', '00000000-0000-0000-0000-000000000e01', r),
    ('t103_c', '00000000-0000-0000-0000-000000000e01', r),
    ('t103_d', '00000000-0000-0000-0000-000000000e01', r);
  insert into production_credits (production_id, person_id, tipo, papel) values
    ('t103_a', '00000000-0000-0000-0000-00000000e101', 'reparto', 'Brady'),
    ('t103_b', '00000000-0000-0000-0000-00000000e101', 'reparto', 'Ensamble');
  insert into production_credits (production_id, person_id, tipo, papel, activo) values
    ('t103_e', '00000000-0000-0000-0000-00000000e101', 'reparto', 'Baja', false);
  if lealtad_producciones('00000000-0000-0000-0000-000000000e01') <> 3 then
    raise exception 'FALLO T2: % (esperaba 3: A, B, C)', lealtad_producciones('00000000-0000-0000-0000-000000000e01');
  end if;
end $$;

-- T3: el conteo interno no se llama desde fuera.
do $$ declare ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e02');
  begin perform lealtad_producciones('00000000-0000-0000-0000-000000000e01'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO T3: lealtad_producciones abierta'; end if;
  perform pg_temp.as_root();
end $$;

-- T4: la credencial lleva el número (credencial_de y credencial_mia, badge_publico, badge_mio).
do $$ declare t text; j json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e01');
  j := badge_mio();
  if (credencial_mia()->>'lealtad')::int <> 3 then raise exception 'FALLO T4: credencial_mia'; end if;
  perform pg_temp.as_root();
  if j is null or (j->>'lealtad')::int <> 3 then raise exception 'FALLO T4: badge_mio %', j; end if;
  if (credencial_de('00000000-0000-0000-0000-000000000e01')->>'lealtad')::int <> 3 then raise exception 'FALLO T4: credencial_de'; end if;
  select token into t from badges where user_id = '00000000-0000-0000-0000-000000000e01';
  if (badge_publico(t)->>'lealtad')::int <> 3 then raise exception 'FALLO T4: badge_publico'; end if;
end $$;

-- T5: entrar a otra obra cambia el número.
do $$ begin
  insert into production_credits (production_id, person_id, tipo, papel) values
    ('t103_e', '00000000-0000-0000-0000-00000000e101', 'reparto', 'Regresa');
  if lealtad_producciones('00000000-0000-0000-0000-000000000e01') <> 4 then raise exception 'FALLO T5'; end if;
end $$;

select 'OK 0103 lealtad' as resultado;
