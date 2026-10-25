-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0127 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000127a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't127_admin@test.local'),
  ('00000000-0000-0000-0000-000000127d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't127_dir@test.local'),
  ('00000000-0000-0000-0000-000000127c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't127_ana@test.local'),
  ('00000000-0000-0000-0000-000000127c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't127_beto@test.local'),
  ('00000000-0000-0000-0000-000000127c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't127_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000127a01';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t127_obra', 'Obra 127', 'borrador');

do $$
declare
  adm text := '00000000-0000-0000-0000-000000127a01'; dir uuid := '00000000-0000-0000-0000-000000127d01';
  ana uuid := '00000000-0000-0000-0000-000000127c01'; beto uuid := '00000000-0000-0000-0000-000000127c02';
  pf uuid; pf2 uuid; le uuid; lp uuid; r rehearsals; n int; ok boolean; est text;
begin
  perform pg_temp.as_user(adm);
  perform panel_add_member('t127_obra', 't127_dir@test.local', 'productor');
  perform panel_add_member('t127_obra', 't127_ana@test.local', 'integrante');
  perform panel_add_member('t127_obra', 't127_beto@test.local', 'integrante');
  perform pg_temp.reset();
  update member_enrollment set ingreso = hoy_mx() - 30 where production_id = 't127_obra';
  -- Ana es del reparto; Beto del crew.
  insert into people (nombre, profile_id) values ('Ana', ana), ('Beto', beto);
  insert into production_credits (production_id, person_id, tipo, papel)
    select 't127_obra', id, case when profile_id = ana then 'reparto' else 'crew' end, case when profile_id = ana then 'Protagonista' else 'Tramoya' end
      from people where profile_id in (ana, beto);

  -- T1: logística de la obra y llamados. Función en 3 días a las 20:00 (México).
  insert into obra_logistica (production_id, puertas_min, duracion_min, intermedio_min, direccion) values ('t127_obra', 30, 130, 15, 'Av. Siempre Viva 742');
  insert into obra_llamados (production_id, nombre, minutos_antes, elenco, orden) values ('t127_obra', 'Elenco', 120, 'todos', 1) returning id into le;
  insert into obra_llamados (production_id, nombre, minutos_antes, elenco, grupos, equipo_todos, orden) values ('t127_obra', 'Producción', 180, 'grupos', array['crew'], true, 2) returning id into lp;
  insert into performances (production_id, starts_at, venue, on_sale)
    values ('t127_obra', ((hoy_mx() + 3)::timestamp + time '20:00') at time zone 'America/Mexico_City', 'Teatro 127', false) returning id into pf;
  select count(*) into n from rehearsals where performance_id = pf;
  if n <> 2 then raise exception 'FALLO T1: % llamados', n; end if;
  select * into r from rehearsals where performance_id = pf and llamado_id = le;
  if r.inicia <> (select starts_at from performances where id = pf) - interval '120 minutes' or r.lugar <> 'Teatro 127'
     or r.termina <> (select starts_at from performances where id = pf) + interval '130 minutes' then raise exception 'FALLO T1: horas %', r; end if;
  if r.titulo not like 'Llamado Elenco · función %' then raise exception 'FALLO T1: título %', r.titulo; end if;

  -- T2: citados. Elenco: Ana y Beto. Producción: solo Beto (crew) y el equipo (Dirección).
  if not rehearsal_cites(r.id, ana) or not rehearsal_cites(r.id, beto) then raise exception 'FALLO T2: elenco'; end if;
  select * into r from rehearsals where performance_id = pf and llamado_id = lp;
  if rehearsal_cites(r.id, ana) or not rehearsal_cites(r.id, beto) or not rehearsal_cites(r.id, dir) then raise exception 'FALLO T2: producción'; end if;

  -- T3: mover la función mueve los llamados; uno movido a mano o con asistencia ya no se mueve.
  update rehearsals set inicia = inicia - interval '15 minutes' where performance_id = pf and llamado_id = lp;
  if not (select llamado_fijo from rehearsals where performance_id = pf and llamado_id = lp) then raise exception 'FALLO T3: no quedó fijo'; end if;
  update performances set starts_at = starts_at + interval '1 hour' where id = pf;
  if (select inicia from rehearsals where performance_id = pf and llamado_id = le) <> (select starts_at from performances where id = pf) - interval '120 minutes' then
    raise exception 'FALLO T3: no se movió el elenco';
  end if;
  if (select inicia from rehearsals where performance_id = pf and llamado_id = lp) <> (select starts_at from performances where id = pf) - interval '1 hour' - interval '195 minutes' then
    raise exception 'FALLO T3: se movió el fijo';
  end if;

  -- T4: cambiar el llamado de la obra re-sincroniza; borrar un llamado quita los futuros sin asistencia.
  update obra_llamados set minutos_antes = 90 where id = le;
  if (select inicia from rehearsals where performance_id = pf and llamado_id = le) <> (select starts_at from performances where id = pf) - interval '90 minutes' then
    raise exception 'FALLO T4: no re-sincronizó';
  end if;
  insert into performances (production_id, starts_at, venue, on_sale) values ('t127_obra', now() + interval '10 days', 'Teatro 127', false) returning id into pf2;
  delete from obra_llamados where id = lp;
  if exists (select 1 from rehearsals where performance_id in (pf, pf2) and titulo like 'Llamado Producción%') then raise exception 'FALLO T4: quedó producción'; end if;
  if (select count(*) from rehearsals where performance_id = pf2) <> 1 then raise exception 'FALLO T4: pf2'; end if;

  -- T5: duración de la obra mueve el fin; función cancelada cancela sus llamados.
  update obra_logistica set duracion_min = 150 where production_id = 't127_obra';
  if (select termina from rehearsals where performance_id = pf2) <> (select starts_at from performances where id = pf2) + interval '150 minutes' then raise exception 'FALLO T5: duración'; end if;
  update performances set termina_at = starts_at + interval '100 minutes' where id = pf2;
  if (select termina from rehearsals where performance_id = pf2) <> (select starts_at from performances where id = pf2) + interval '100 minutes' then raise exception 'FALLO T5: fin propio'; end if;
  -- Mover la función mueve su horario propio (no rompe "puertas antes del inicio").
  update performances set puertas_at = starts_at - interval '45 minutes' where id = pf2;
  update performances set starts_at = starts_at - interval '3 hours' where id = pf2;
  if (select (starts_at - puertas_at, termina_at - starts_at) <> (interval '45 minutes', interval '100 minutes') from performances where id = pf2) then raise exception 'FALLO T5: horario no se movió'; end if;
  update performances set cancelada_at = now(), cancelada_motivo = 'Prueba' where id = pf2;
  if (select estado from rehearsals where performance_id = pf2) <> 'cancelado' then raise exception 'FALLO T5: cancelada'; end if;

  -- T6: el llamado funciona como ensayo: gafete con tolerancia (llamado empezado hace 5 min = presente).
  update performances set starts_at = now() + interval '85 minutes' where id = pf;
  select * into r from rehearsals where performance_id = pf and llamado_id = le;
  if r.inicia > now() - interval '4 minutes' then raise exception 'FALLO T6: no se movió (%)', r.inicia; end if;
  est := _llegada(r, ana, 'Gafete');
  if est <> 'presente' then raise exception 'FALLO T6: %', est; end if;
  -- Con asistencia ya no se mueve aunque se mueva la función.
  update performances set starts_at = starts_at + interval '2 hours' where id = pf;
  if (select inicia from rehearsals where id = r.id) <> r.inicia then raise exception 'FALLO T6: se movió con asistencia'; end if;

  -- T7: permisos. Un integrante no ve ni cambia los llamados; la logística la lee cualquiera.
  perform pg_temp.as_user(ana::text);
  if exists (select 1 from obra_llamados where production_id = 't127_obra') then raise exception 'FALLO T7: integrante ve llamados'; end if;
  begin update obra_logistica set puertas_min = 5 where production_id = 't127_obra'; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T7: integrante cambia logística'; end if;
  perform set_config('role', 'anon', true);
  if (select direccion from obra_logistica where production_id = 't127_obra') <> 'Av. Siempre Viva 742' then raise exception 'FALLO T7: público'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(dir::text);
  update obra_logistica set puertas_min = 45 where production_id = 't127_obra';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T7: producción no cambia logística'; end if;
  perform pg_temp.reset();
end $$;

select 'TODO OK' as resultado;
