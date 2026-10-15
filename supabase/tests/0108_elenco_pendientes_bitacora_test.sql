-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0108 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't108_admin@test.local'),
  ('00000000-0000-0000-0000-000000000e82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't108_puerta@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000e81';
insert into productions (id, nombre, estado) values ('t108_obra', 'Obra 108', 'borrador');
insert into production_members (production_id, user_id, role_id) values ('t108_obra', '00000000-0000-0000-0000-000000000e82', 'puerta');
insert into people (id, nombre) values
  ('00000000-0000-0000-0000-00000000e801', 'Ana Reparto 108'),
  ('00000000-0000-0000-0000-00000000e802', 'Beto Ensamble 108');
insert into production_credits (production_id, person_id, tipo, papel) values
  ('t108_obra', '00000000-0000-0000-0000-00000000e801', 'reparto', 'Brady'),
  ('t108_obra', '00000000-0000-0000-0000-00000000e802', 'ensamble', null);

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

-- T1: quien arma el elenco ve "2 personas del elenco sin publicar"; Puerta no.
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e81');
  select p.n into n from panel_pendientes() p where p.tipo = 'elenco_sin_publicar' and p.production_id = 't108_obra';
  perform pg_temp.as_root();
  if n is distinct from 2 then raise exception 'FALLO T1: admin ve %', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e82');
  if exists (select 1 from panel_pendientes() p where p.tipo = 'elenco_sin_publicar') then raise exception 'FALLO T1: puerta lo ve'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: publicar queda en la bitácora con nombre y papel, y baja el pendiente; despublicar también se registra.
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e81');
  update production_credits set publicado = true where person_id = '00000000-0000-0000-0000-00000000e801';
  update production_credits set papel = 'Brady M.' where person_id = '00000000-0000-0000-0000-00000000e801';
  select p.n into n from panel_pendientes() p where p.tipo = 'elenco_sin_publicar' and p.production_id = 't108_obra';
  perform pg_temp.as_root();
  if n is distinct from 1 then raise exception 'FALLO T2: pendiente %', n; end if;
  if not exists (select 1 from audit_log where tabla = 'production_credits' and accion = 'publicar' and production_id = 't108_obra'
                  and actor = '00000000-0000-0000-0000-000000000e81' and despues->>'persona' = 'Ana Reparto 108' and despues->>'papel' = 'Brady') then
    raise exception 'FALLO T2: sin bitácora';
  end if;
  if (select count(*) from audit_log where tabla = 'production_credits' and production_id = 't108_obra') <> 1 then
    raise exception 'FALLO T2: cambiar el papel no debe registrar publicar';
  end if;
  update production_credits set publicado = false where person_id = '00000000-0000-0000-0000-00000000e801';
  if not exists (select 1 from audit_log where tabla = 'production_credits' and accion = 'despublicar' and production_id = 't108_obra') then
    raise exception 'FALLO T2: despublicar';
  end if;
end $$;

-- T3: obra concluida o cancelada no avisa.
do $$ begin
  alter table productions disable trigger user;
  update productions set estado = 'cancelada' where id = 't108_obra';
  alter table productions enable trigger user;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e81');
  if exists (select 1 from panel_pendientes() p where p.tipo = 'elenco_sin_publicar' and p.production_id = 't108_obra') then
    perform pg_temp.as_root(); raise exception 'FALLO T3';
  end if;
  perform pg_temp.as_root();
end $$;
