-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0109 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e91', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't109_a@test.local');
insert into productions (id, nombre, estado) values ('t109_obra', 'Obra 109', 'borrador');
insert into people (id, nombre) values ('00000000-0000-0000-0000-00000000e901', 'Ana Historia');
insert into production_credits (production_id, person_id, tipo, papel) values ('t109_obra', '00000000-0000-0000-0000-00000000e901', 'reparto', 'Brady');
insert into rehearsals (id, production_id, titulo, inicia, convocatoria, grupos) values
  ('00000000-0000-0000-0000-00000000e911', 't109_obra', 'Ensayo 1', '2026-09-06 16:00+00', 'grupos', '{reparto}'),
  ('00000000-0000-0000-0000-00000000e912', 't109_obra', 'Ensayo 2', '2026-09-13 16:00+00', 'grupos', '{reparto}'),
  ('00000000-0000-0000-0000-00000000e913', 't109_obra', 'Ensayo 3', '2026-09-20 16:00+00', 'grupos', '{reparto}');
insert into rehearsal_attendance_ficha (rehearsal_id, person_id, estado) values
  ('00000000-0000-0000-0000-00000000e911', '00000000-0000-0000-0000-00000000e901', 'falta'),
  ('00000000-0000-0000-0000-00000000e912', '00000000-0000-0000-0000-00000000e901', 'falta'),
  ('00000000-0000-0000-0000-00000000e913', '00000000-0000-0000-0000-00000000e901', 'retardo');

-- T1: al ligar la cuenta, la asistencia pasa sola, marcada como histórica, sin advertencias, y su ingreso se recorre.
do $$ begin
  update people set profile_id = '00000000-0000-0000-0000-000000000e91' where id = '00000000-0000-0000-0000-00000000e901';
  if (select count(*) from rehearsal_attendance where user_id = '00000000-0000-0000-0000-000000000e91' and historico) <> 3 then
    raise exception 'FALLO T1: no pasó';
  end if;
  if exists (select 1 from rehearsal_attendance_ficha where person_id = '00000000-0000-0000-0000-00000000e901') then
    raise exception 'FALLO T1: quedó pendiente';
  end if;
  if exists (select 1 from member_incidents where production_id = 't109_obra') then raise exception 'FALLO T1: generó advertencias'; end if;
  if (select ingreso from member_enrollment where production_id = 't109_obra' and user_id = '00000000-0000-0000-0000-000000000e91') <> '2026-09-06' then
    raise exception 'FALLO T1: ingreso %', (select ingreso from member_enrollment where production_id = 't109_obra' and user_id = '00000000-0000-0000-0000-000000000e91');
  end if;
end $$;

-- T2: una falta nueva (no histórica) cuenta sola: con 1 falta nueva no hay advertencia aunque haya 2 históricas.
do $$ begin
  insert into rehearsals (id, production_id, titulo, inicia, convocatoria, grupos) values
    ('00000000-0000-0000-0000-00000000e914', 't109_obra', 'Ensayo 4', now() - interval '1 day', 'grupos', '{reparto}');
  insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ('00000000-0000-0000-0000-00000000e914', '00000000-0000-0000-0000-000000000e91', 'falta');
  if exists (select 1 from member_incidents where production_id = 't109_obra') then raise exception 'FALLO T2'; end if;
end $$;

-- T3: "Solo crédito" quita el rol integrante; al quitarlo, lo devuelve.
do $$ declare cid uuid; begin
  select id into cid from production_credits where production_id = 't109_obra' and person_id = '00000000-0000-0000-0000-00000000e901';
  update production_credits set solo_credito = true where id = cid;
  if exists (select 1 from production_members where production_id = 't109_obra' and user_id = '00000000-0000-0000-0000-000000000e91' and role_id = 'integrante') then
    raise exception 'FALLO T3: sigue integrante';
  end if;
  update production_credits set solo_credito = false where id = cid;
  if not exists (select 1 from production_members where production_id = 't109_obra' and user_id = '00000000-0000-0000-0000-000000000e91' and role_id = 'integrante') then
    raise exception 'FALLO T3: no volvió';
  end if;
end $$;

-- T4: una ficha nueva marcada como solo crédito no se vuelve integrante al ligar su cuenta.
do $$ begin
  insert into auth.users (id, instance_id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000e92', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't109_b@test.local');
  insert into people (id, nombre) values ('00000000-0000-0000-0000-00000000e902', 'Beto Producción');
  insert into production_credits (production_id, person_id, tipo, papel, solo_credito) values ('t109_obra', '00000000-0000-0000-0000-00000000e902', 'reparto', 'Cameo', true);
  update people set profile_id = '00000000-0000-0000-0000-000000000e92' where id = '00000000-0000-0000-0000-00000000e902';
  if exists (select 1 from production_members where production_id = 't109_obra' and user_id = '00000000-0000-0000-0000-000000000e92') then
    raise exception 'FALLO T4';
  end if;
end $$;
