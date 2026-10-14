-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0057 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local');
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

do $$ declare pid uuid; n int; r record; begin
  update productions set estado = 'publicada' where id = 'showman';
  update profiles set nombres = 'Ana', apellidos = 'Pérez', fecha_nacimiento = '1995-05-05' where id = '00000000-0000-0000-0000-0000000000e1';

  -- T1: la persona crea su ficha y su perfil; el slug sale solo; no puede marcar el permiso del tutor
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  pid := my_person();
  if my_person() <> pid then raise exception 'FALLO T1a: creó dos fichas'; end if;
  insert into pro_profiles (person_id, slug, semblanza, retrato_path, tutor_autorizado_at, habilidades)
  values (pid, '', 'Actriz y cantante', pid::text || '/retrato.jpg', now(), '{"canto": "Soprano", "baile": ["Jazz"]}');
  select * into r from pro_profiles where person_id = pid;
  if r.slug <> 'ana-perez' then raise exception 'FALLO T1b: slug %', r.slug; end if;
  if r.tutor_autorizado_at is not null then raise exception 'FALLO T1c: la persona marcó el permiso del tutor'; end if;
  reset role;

  -- T2: sin activar no es público; al activar sí
  perform pg_temp.as_anon();
  select count(*) into n from pro_profiles;
  if n <> 0 then raise exception 'FALLO T2a: perfil público sin activar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  update pro_profiles set publico = true where person_id = pid;
  perform pg_temp.as_anon();
  select count(*) into n from pro_profiles where slug = 'ana-perez';
  if n <> 1 then raise exception 'FALLO T2b: no se ve al activarlo'; end if;
  reset role;

  -- T3: menor de edad: hace falta el permiso del tutor, que registra el equipo
  update profiles set fecha_nacimiento = (hoy_mx() - interval '12 years')::date where id = '00000000-0000-0000-0000-0000000000e1';
  if pro_is_public(pid) then raise exception 'FALLO T3a: menor público sin permiso'; end if;
  insert into production_credits (production_id, person_id, tipo, papel, activo) values ('showman', pid, 'reparto', 'Jenny', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_cont@test.local', (select coalesce(max(id), 'productor') from panel_roles where id = 'direccion_general'));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update pro_profiles set tutor_autorizado_at = now() where person_id = pid;
  reset role;
  if not pro_is_public(pid) then raise exception 'FALLO T3b: con permiso del tutor no es público'; end if;
  if (select tutor_autorizado_por from pro_profiles where person_id = pid) <> '00000000-0000-0000-0000-0000000000d1' then raise exception 'FALLO T3c: no guardó quién autorizó'; end if;

  -- T4: otro fan no edita; Producción de la obra sí corrige
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  update pro_profiles set semblanza = 'hackeado' where person_id = pid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T4a: un fan editó otro perfil'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update pro_profiles set semblanza = 'Actriz, cantante y bailarina' where person_id = pid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T4b: Producción no pudo corregir'; end if;

  -- T5: galería de máximo 6 fotos
  for i in 1..6 loop insert into pro_photos (person_id, path, orden) values (pid, pid::text || '/g' || i || '.jpg', i); end loop;
  begin
    insert into pro_photos (person_id, path) values (pid, pid::text || '/g7.jpg');
    raise exception 'FALLO T5: 7 fotos';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- T6: en el elenco de la obra: retrato y enlace (el enlace solo si es público)
  perform pg_temp.as_anon();
  select * into r from production_pro_info('showman') where person_id = pid;
  if r.retrato_path is null or r.slug <> 'ana-perez' then raise exception 'FALLO T6a: %', row_to_json(r); end if;
  reset role;
  update pro_profiles set publico = false where person_id = pid;
  perform pg_temp.as_anon();
  select * into r from production_pro_info('showman') where person_id = pid;
  -- 0088: sin perfil público no salen ni el enlace ni el retrato.
  if r.slug is not null or r.retrato_path is not null then raise exception 'FALLO T6b: enlace o retrato sin perfil público'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0057 pruebas T1–T6 (se aborta a propósito para no persistir)'; end $$;
