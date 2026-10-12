-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0065 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_maestro@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_otro@test.local');
update productions set estado = 'borrador' where id = 'hsm';
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare mat uuid; av uuid; nota uuid; junta uuid; n int; h jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('showman', 't_maestro@test.local', 'maestro');
  perform panel_add_member('showman', 't_staff@test.local', 'staff');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('hsm', 't_otro@test.local', 'staff');

  -- T1: Producción maneja el portal de su obra
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  insert into team_materials (production_id, titulo, url, audiencia, roles) values ('showman', 'Material de maestros', 'https://drive.example/x', 'roles', array['maestro']) returning id into mat;
  insert into team_announcements (production_id, titulo, cuerpo) values ('showman', 'Junta general', 'El lunes a las 10') returning id into av;
  insert into team_notes (production_id, contexto, cuerpo, para_roles) values ('showman', 'Ensayo general', 'Revisar luces del acto 2', array['staff']) returning id into nota;
  insert into team_meetings (production_id, titulo, inicia, audiencia, personas) values ('showman', 'Junta de producción', now() + interval '1 day', 'personas', array['00000000-0000-0000-0000-0000000000d1'::uuid]) returning id into junta;
  begin insert into team_notes (production_id, cuerpo) values ('showman', 'Sin destinatario'); raise exception 'FALLO T1a';
  exception when check_violation then null; end;
  begin insert into team_materials (production_id, titulo, url) values ('hsm', 'Otra obra', 'https://x.example'); raise exception 'FALLO T1b: escribió en otra obra';
  exception when insufficient_privilege then null; end;

  -- T2: el maestro ve su material, el aviso y su junta; no la nota de staff
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if (select count(*) from team_materials) <> 1 or (select count(*) from team_announcements) <> 1 or (select count(*) from team_meetings) <> 1 then raise exception 'FALLO T2a'; end if;
  if (select count(*) from team_notes) <> 0 then raise exception 'FALLO T2b: ve nota ajena'; end if;
  insert into team_announcement_reads (announcement_id, user_id) values (av, '00000000-0000-0000-0000-0000000000d1');
  -- Desde 0066 cualquiera del equipo sube material propio, pero no a nombre de otro ni en otra obra.
  begin insert into team_materials (production_id, titulo, url, created_by) values ('showman', 'x', 'https://x.example', '00000000-0000-0000-0000-0000000000b1'); raise exception 'FALLO T2c: subió a nombre de otro';
  exception when insufficient_privilege then null; end;

  -- T3: staff ve la nota, la atiende y responde, pero no cambia el texto
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  if (select count(*) from team_materials) <> 0 then raise exception 'FALLO T3a: staff ve material de maestros'; end if;
  select notas into n from my_team_unread() where production_id = 'showman';
  if n is distinct from 1 then raise exception 'FALLO T3b: % notas pendientes', n; end if;
  h := panel_home();
  if not exists (select 1 from jsonb_array_elements(h->'pendientes') x where x->>'tipo' = 'notas_equipo') then raise exception 'FALLO T3c: sin pendiente en el inicio'; end if;
  update team_notes set atendida_at = now(), respuesta = 'Listo', cuerpo = 'cambiado' where id = nota;
  perform set_config('role', 'postgres', true);
  if (select cuerpo from team_notes where id = nota) <> 'Revisar luces del acto 2' then raise exception 'FALLO T3d: cambió el texto'; end if;
  if (select atendida_por from team_notes where id = nota) <> '00000000-0000-0000-0000-0000000000d2' or (select respuesta from team_notes where id = nota) <> 'Listo' then raise exception 'FALLO T3e'; end if;

  -- T4: el integrante y alguien de otra obra no ven nada de showman
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  if (select count(*) from team_announcements) + (select count(*) from team_notes) + (select count(*) from team_meetings) <> 0 then raise exception 'FALLO T4a: integrante ve el portal'; end if;
  if exists (select 1 from my_team_productions()) then raise exception 'FALLO T4b'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if (select count(*) from team_announcements where production_id = 'showman') <> 0 then raise exception 'FALLO T4c: otra obra ve showman'; end if;

  -- T5: espacio general: solo el Director lo maneja; lo ve el equipo de cualquier obra
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin insert into team_announcements (production_id, titulo, cuerpo) values (null, 'General', 'x'); raise exception 'FALLO T5a';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into team_announcements (production_id, titulo, cuerpo) values (null, 'Aviso DARF', 'Bienvenidos');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if (select count(*) from team_announcements where production_id is null) <> 1 then raise exception 'FALLO T5b: staff de hsm no ve el general'; end if;
  if not exists (select 1 from my_team_productions() where production_id is null) then raise exception 'FALLO T5c'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  if (select count(*) from team_announcements where production_id is null) <> 0 then raise exception 'FALLO T5d: integrante ve el general'; end if;

  -- T6: quién leyó, cierre de junta y archivos
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  select count(*) into n from team_announcement_read_status(av) where leido_at is not null;
  if n <> 1 then raise exception 'FALLO T6a: %', n; end if;
  update team_meetings set estado = 'realizada', resumen = 'Se acordó…', acuerdos = '[{"texto":"Rider","responsable":"Staff"}]', transcript_path = 'showman/juntas/t.txt' where id = junta;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if not can_read_team_object('showman/juntas/t.txt') then raise exception 'FALLO T6b: el invitado no lee el transcript'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  if can_read_team_object('showman/juntas/t.txt') then raise exception 'FALLO T6c: lee transcript ajeno'; end if;
  begin perform team_roster('showman'); raise exception 'FALLO T6d';
  exception when raise_exception then if sqlerrm not like '%No autorizado%' then raise; end if; end;

  raise exception 'OK: 0065 portal del equipo';
end $$;
