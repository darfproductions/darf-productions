-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0100 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't100_admin@test.local'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't100_vocal@test.local'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't100_baile@test.local'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't100_asist@test.local'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't100_alumna@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000b01';

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

do $$ declare per uuid; canto uuid; baile uuid; lvl uuid; begin
  insert into rubric_settings (production_id, activa) values ('showman', true) on conflict (production_id) do update set activa = true;
  insert into production_members (production_id, user_id, role_id) values
    ('showman', '00000000-0000-0000-0000-000000000b02', 'maestro'),
    ('showman', '00000000-0000-0000-0000-000000000b03', 'maestro'),
    ('showman', '00000000-0000-0000-0000-000000000b04', 'asistente'),
    ('showman', '00000000-0000-0000-0000-000000000b05', 'integrante');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b01');
  perform rubric_seed('showman');
  perform pg_temp.as_root();
  select id into canto from rubric_criteria where production_id = 'showman' and nombre = 'Canto';
  select id into baile from rubric_criteria where production_id = 'showman' and nombre = 'Baile';
  select id into lvl from rubric_levels where production_id = 'showman' order by orden limit 1;
  insert into rubric_teachers values ('showman', '00000000-0000-0000-0000-000000000b02', canto), ('showman', '00000000-0000-0000-0000-000000000b03', baile);
  insert into rubric_assistants values ('showman', '00000000-0000-0000-0000-000000000b04', canto);
  insert into rubric_periods (production_id, nombre, desde, hasta) values ('showman', 'Bimestre 1', hoy_mx() - 30, hoy_mx()) returning id into per;
  insert into ctx values ('per', per), ('canto', canto), ('baile', baile), ('lvl', lvl);
end $$;

-- T1: el rol: categoría dirección, ensayos siempre, audiciones; NO gestiona la rúbrica.
do $$ begin
  if (select categoria from panel_roles where id = 'asistente') <> 'direccion' then raise exception 'FALLO T1: categoría'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  if not has_perm('showman', 'ensayos.gestionar') then raise exception 'FALLO T1: ensayos'; end if;
  if not has_perm('showman', 'audiciones.evaluar') or not has_perm('showman', 'audiciones.registro') then raise exception 'FALLO T1: audiciones'; end if;
  if has_perm('showman', 'rubrica.gestionar') then raise exception 'FALLO T1: gestiona rúbrica'; end if;
  if has_perm('showman', 'expedientes.ver') then raise exception 'FALLO T1: expedientes'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: el asistente no califica directo, no publica ni crea criterios; propone en su materia y no en otra.
do $$ declare per text := (select v from ctx where k = 'per'); canto text := (select v from ctx where k = 'canto'); baile text := (select v from ctx where k = 'baile'); n int; q uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  if not pg_temp.falla(format($q$insert into rubric_evaluations (production_id, period_id, user_id) values ('showman', %L, %L)$q$, per, '00000000-0000-0000-0000-000000000b05')) then raise exception 'FALLO T2: evaluación directa'; end if;
  if not pg_temp.falla($q$insert into rubric_criteria (production_id, nombre) values ('showman', 'X')$q$) then raise exception 'FALLO T2: crea criterio'; end if;
  update rubric_periods set publicado_at = now() where id = per::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T2: publicó'; end if;
  q := rubric_proponer(per::uuid, '00000000-0000-0000-0000-000000000b05', canto::uuid, null, 8.5, 'Afinada, falta proyección');
  insert into ctx values ('q', q);
  if not pg_temp.falla(format('select rubric_proponer(%L, %L, %L, null, 7)', per, '00000000-0000-0000-0000-000000000b05', baile)) then raise exception 'FALLO T2: propuso en otra materia'; end if;
  perform pg_temp.as_root();
  if exists (select 1 from rubric_scores) then raise exception 'FALLO T2: la propuesta ya cuenta'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000b02' and titulo = 'Nueva propuesta de calificación') then raise exception 'FALLO T2: aviso a la maestra'; end if;
end $$;

-- T3: la alumna no ve la propuesta; el maestro de baile no puede aprobarla; la de canto sí, corrigiendo.
do $$ declare q text := (select v from ctx where k = 'q'); est text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b05');
  if exists (select 1 from rubric_proposals) then raise exception 'FALLO T3: la alumna ve la propuesta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b03');
  if exists (select 1 from rubric_proposals) then raise exception 'FALLO T3: el de baile la ve'; end if;
  if not pg_temp.falla(format('select rubric_resolver(%L, true)', q)) then raise exception 'FALLO T3: el de baile aprobó'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  if (select count(*) from panel_pendientes() where tipo = 'propuestas') <> 1 then raise exception 'FALLO T3: pendiente en el panel'; end if;
  est := rubric_resolver(q::uuid, true, null, 9);
  if est <> 'corregida' then raise exception 'FALLO T3: estado %', est; end if;
  perform pg_temp.as_root();
  if (select numero from rubric_scores) <> 9 then raise exception 'FALLO T3: no quedó la corrección'; end if;
  if not pg_temp.falla(format('select rubric_proponer(%L, %L, %L, null, 6)', (select v from ctx where k = 'per'), '00000000-0000-0000-0000-000000000b05', (select v from ctx where k = 'canto'))) then
    null; -- como root no tiene sesión: la prueba real va abajo
  end if;
end $$;

-- T4: una propuesta revisada ya no se cambia; una nueva rechazada no toca la calificación.
do $$ declare per text := (select v from ctx where k = 'per'); canto text := (select v from ctx where k = 'canto'); q uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  if not pg_temp.falla(format('select rubric_proponer(%L, %L, %L, null, 6)', per, '00000000-0000-0000-0000-000000000b05', canto)) then raise exception 'FALLO T4: cambió una revisada'; end if;
  perform pg_temp.as_root();
  delete from rubric_proposals;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  q := rubric_proponer(per::uuid, '00000000-0000-0000-0000-000000000b05', canto::uuid, (select v from ctx where k = 'lvl')::uuid, null);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  if rubric_resolver(q, false) <> 'rechazada' then raise exception 'FALLO T4: rechazar'; end if;
  perform pg_temp.as_root();
  if (select numero from rubric_scores) <> 9 then raise exception 'FALLO T4: rechazar cambió la calificación'; end if;
  -- Apagadas las evaluaciones, no se propone.
  update rubric_settings set activa = false where production_id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  if not pg_temp.falla(format('select rubric_proponer(%L, %L, %L, null, 5)', per, '00000000-0000-0000-0000-000000000b05', canto)) then raise exception 'FALLO T4: propuso apagado'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: lecturas para las pantallas: propuestas por periodo, lista de asistentes, periodos sin publicar.
do $$ declare per uuid := (select v from ctx where k = 'per')::uuid; begin
  update rubric_settings set activa = true where production_id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  if (select count(*) from rubric_propuestas(per)) <> 1 then raise exception 'FALLO T5: el asistente no ve las suyas'; end if;
  if not exists (select 1 from rubric_periods where id = per) then raise exception 'FALLO T5: el asistente no ve el periodo'; end if;
  if not pg_temp.falla($q$select rubric_assistant_list('showman')$q$) then raise exception 'FALLO T5: el asistente lista asistentes'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b03');
  if (select count(*) from rubric_propuestas(per)) <> 0 then raise exception 'FALLO T5: el de baile ve propuestas de canto'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  if (select count(*) from rubric_propuestas(per)) <> 1 then raise exception 'FALLO T5: la de canto no las ve'; end if;
  if not exists (select 1 from rubric_assistant_list('showman') where user_id = '00000000-0000-0000-0000-000000000b04' and criterios = array[(select v from ctx where k = 'canto')::uuid]) then
    raise exception 'FALLO T5: lista de asistentes';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b05');
  if not pg_temp.falla(format('select rubric_propuestas(%L)', per)) then raise exception 'FALLO T5: la alumna lee propuestas'; end if;
  if exists (select 1 from rubric_periods where id = per) then raise exception 'FALLO T5: la alumna ve el periodo sin publicar'; end if;
  perform pg_temp.as_root();
end $$;

select 'OK 0100';
