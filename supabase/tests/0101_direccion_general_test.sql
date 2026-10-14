-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0101 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_admin@test.local'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_dg@test.local'),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_prod@test.local'),
  ('00000000-0000-0000-0000-000000000c04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_art@test.local'),
  ('00000000-0000-0000-0000-000000000c05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_vocal@test.local'),
  ('00000000-0000-0000-0000-000000000c06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't101_alumna@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000c01';

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
create or replace function pg_temp.falla(q text) returns boolean language plpgsql as $$
begin
  execute q; return false;
exception when others then return true;
end $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

do $$ declare per uuid; canto uuid; actitud uuid; ev uuid; begin
  insert into rubric_settings (production_id, activa) values ('showman', true) on conflict (production_id) do update set activa = true;
  insert into production_members (production_id, user_id, role_id) values
    ('showman', '00000000-0000-0000-0000-000000000c02', 'direccion_general'),
    ('showman', '00000000-0000-0000-0000-000000000c03', 'productor'),
    ('showman', '00000000-0000-0000-0000-000000000c04', 'direccion'),
    ('showman', '00000000-0000-0000-0000-000000000c05', 'maestro'),
    ('showman', '00000000-0000-0000-0000-000000000c06', 'integrante');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform rubric_seed('showman');
  perform pg_temp.as_root();
  select id into canto from rubric_criteria where production_id = 'showman' and nombre = 'Canto';
  select id into actitud from rubric_criteria where production_id = 'showman' and compartido limit 1;
  insert into rubric_teachers values ('showman', '00000000-0000-0000-0000-000000000c05', canto);
  insert into rubric_periods (production_id, nombre) values ('showman', 'Bimestre 1') returning id into per;
  insert into rubric_evaluations (production_id, period_id, user_id) values ('showman', per, '00000000-0000-0000-0000-000000000c06') returning id into ev;
  insert into ctx values ('per', per), ('canto', canto), ('actitud', actitud), ('ev', ev);
end $$;

-- T1: Dirección general puede todo (también permisos nuevos), lidera ensayos y tiene su franja.
do $$ begin
  insert into permissions (id, grupo, descripcion, orden) values ('t101.nuevo', 'Otro', 'Permiso de prueba', 999);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  if not has_perm('showman', 't101.nuevo') or not has_perm('showman', 'permisos.gestionar') or not has_perm('showman', 'ventas.operar') then raise exception 'FALLO T1: permisos'; end if;
  if not exists (select 1 from my_panel_access() where production_id = 'showman' and permission_id = 't101.nuevo') then raise exception 'FALLO T1: my_panel_access'; end if;
  if has_perm('hsm', 'obra.ver') and not exists (select 1 from production_members where production_id = 'hsm' and user_id = auth.uid()) then raise exception 'FALLO T1: otra obra'; end if;
  perform pg_temp.as_root();
  if not lider_ensayos('showman', '00000000-0000-0000-0000-000000000c02') then raise exception 'FALLO T1: ensayos'; end if;
  if badge_papel('00000000-0000-0000-0000-000000000c02')->>'franja' <> 'direccion_general' then raise exception 'FALLO T1: franja %', badge_papel('00000000-0000-0000-0000-000000000c02'); end if;
  if badge_papel('00000000-0000-0000-0000-000000000c03')->>'franja' <> 'produccion' then raise exception 'FALLO T1: franja producción'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  if has_perm('showman', 'rubrica.aprobar') then raise exception 'FALLO T1: artística aprueba'; end if;
  -- Producción: operación, sin papeles, permisos, publicar la obra, juzgar ni rúbrica.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  if has_perm('showman', 'elenco.gestionar') or has_perm('showman', 'permisos.gestionar') or has_perm('showman', 'obra.publicar')
     or has_perm('showman', 'audiciones.evaluar') or has_perm('showman', 'rubrica.gestionar') then raise exception 'FALLO T1: Producción conserva permisos quitados'; end if;
  if not (has_perm('showman', 'obra.editar') and has_perm('showman', 'audiciones.gestionar') and has_perm('showman', 'expedientes.ver')
     and has_perm('showman', 'ventas.operar') and has_perm('showman', 'equipo.gestionar') and has_perm('showman', 'funciones.gestionar')) then
    raise exception 'FALLO T1: Producción perdió permisos que conserva';
  end if;
  if (select nombre from panel_roles where id = 'maquillaje') <> 'Estilismo' then raise exception 'FALLO T1: Estilismo'; end if;
  if (select count(*) from role_permissions where role_id = 'productor') <> 20 then raise exception 'FALLO T1: Producción tiene % permisos', (select count(*) from role_permissions where role_id = 'productor'); end if;
  perform pg_temp.as_root();
end $$;

-- T2: la maestra califica y entrega; se bloquea; avisa a quienes revisan (no a Producción); la coordinación corrige.
do $$ declare ev uuid := (select v from ctx where k = 'ev'); canto uuid := (select v from ctx where k = 'canto'); per uuid := (select v from ctx where k = 'per'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c05');
  insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, canto, 7);
  if not pg_temp.falla(format('select rubric_regresar(%L, %L)', per, '00000000-0000-0000-0000-000000000c05')) then raise exception 'FALLO T2: la maestra se regresa sola'; end if;
  perform rubric_entregar(per);
  if not pg_temp.falla(format('update rubric_scores set numero = 8 where evaluation_id = %L', ev)) then raise exception 'FALLO T2: cambió tras entregar'; end if;
  perform pg_temp.as_root();
  if (select count(*) from notifications where titulo = 'Calificaciones entregadas'
        and user_id in ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-000000000c04')) <> 2 then
    raise exception 'FALLO T2: avisos a revisores';
  end if;
  if exists (select 1 from notifications where titulo = 'Calificaciones entregadas' and user_id = '00000000-0000-0000-0000-000000000c03') then raise exception 'FALLO T2: aviso a Producción'; end if;
  if exists (select 1 from notifications where titulo = 'Calificaciones entregadas' and user_id = '00000000-0000-0000-0000-000000000c05') then raise exception 'FALLO T2: se avisó a sí misma'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  if exists (select 1 from panel_pendientes() where tipo = 'entregas') then raise exception 'FALLO T2: Producción ve la entrega'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  if (select n from panel_pendientes() where tipo = 'entregas' and production_id = 'showman') <> 1 then raise exception 'FALLO T2: pendiente'; end if;
  update rubric_scores set numero = 7.5 where evaluation_id = ev;
  perform pg_temp.as_root();
  if (select numero from rubric_scores where evaluation_id = ev) <> 7.5 then raise exception 'FALLO T2: la coordinación no corrigió'; end if;
end $$;

-- T3: regresar desbloquea y avisa a la maestra con la nota.
do $$ declare ev uuid := (select v from ctx where k = 'ev'); per uuid := (select v from ctx where k = 'per'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  perform rubric_regresar(per, '00000000-0000-0000-0000-000000000c05', 'Revisa a Ana en Canto');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c05');
  update rubric_scores set numero = 8 where evaluation_id = ev;
  perform pg_temp.as_root();
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000c05' and titulo = 'Te regresaron tus calificaciones' and detalle like '%Revisa a Ana%') then
    raise exception 'FALLO T3: aviso a la maestra';
  end if;
end $$;

-- T4: publicar: con Dirección general en la obra, solo ella; sin ella, la coordinación (no Producción).
do $$ declare per uuid := (select v from ctx where k = 'per'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  if not pg_temp.falla(format('select rubric_publicar(%L, true)', per)) then raise exception 'FALLO T4: artística publicó (rpc)'; end if;
  if not pg_temp.falla(format('update rubric_periods set publicado_at = now() where id = %L', per)) then raise exception 'FALLO T4: artística publicó (directo)'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  if not pg_temp.falla(format('select rubric_publicar(%L, true)', per)) then raise exception 'FALLO T4: Producción publicó con DG'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  perform rubric_publicar(per, true);
  perform pg_temp.as_root();
  if (select publicado_at from rubric_periods where id = per) is null then raise exception 'FALLO T4: no publicó'; end if;
  delete from production_members where production_id = 'showman' and role_id = 'direccion_general';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  if not pg_temp.falla(format('select rubric_publicar(%L, false)', per)) then raise exception 'FALLO T4: Producción sin DG publicó'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  perform rubric_publicar(per, false);
  perform pg_temp.as_root();
  if (select publicado_at from rubric_periods where id = per) is not null then raise exception 'FALLO T4: la coordinación sin DG no pudo'; end if;
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-000000000c02', 'direccion_general');
end $$;

-- T5: Dirección general corrige la parte compartida y el comentario de otro maestro.
do $$ declare ev uuid := (select v from ctx where k = 'ev'); act uuid := (select v from ctx where k = 'actitud'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c05');
  insert into rubric_shared_scores (evaluation_id, criterion_id, teacher_id, numero) values (ev, act, auth.uid(), 6);
  insert into rubric_notes (evaluation_id, teacher_id, comentario) values (ev, auth.uid(), 'Bien');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  update rubric_shared_scores set numero = 9 where evaluation_id = ev and teacher_id = '00000000-0000-0000-0000-000000000c05';
  update rubric_notes set comentario = 'Muy bien' where evaluation_id = ev and teacher_id = '00000000-0000-0000-0000-000000000c05';
  perform pg_temp.as_root();
  if (select numero from rubric_shared_scores where evaluation_id = ev) <> 9 then raise exception 'FALLO T5: compartida'; end if;
  if (select comentario from rubric_notes where evaluation_id = ev) <> 'Muy bien' then raise exception 'FALLO T5: comentario'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  update rubric_notes set comentario = 'X' where evaluation_id = ev and teacher_id = '00000000-0000-0000-0000-000000000c05';
  perform pg_temp.as_root();
  if (select comentario from rubric_notes where evaluation_id = ev) <> 'Muy bien' then raise exception 'FALLO T5: artística cambió el comentario de otro'; end if;
end $$;

select 'OK 0101';
