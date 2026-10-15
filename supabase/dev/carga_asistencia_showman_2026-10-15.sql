-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Carga de datos de Showman (Diego, 2026-10-15). Requiere apply_0109_dev.sql y carga_creditos_2026-10-15.sql.
--   1. Producción que sale de personaje (10 personas): "Solo crédito" (no los citan a ensayos ni les cuentan faltas).
--   2. Bajas del taller (4 personas): ficha con crédito dado de baja (no sale en la página).
--   3. Ensayos: 8 que ya pasaron (sábados del 22 ago al 10 oct) y 11 siguientes (17 oct al 9 ene), de 9:00 a 14:00.
--   4. Asistencia de los 8 que ya pasaron: queda como histórica (no genera advertencias). Quien no tiene cuenta
--      la recibe en cuanto liga su cuenta; su ingreso al taller es su primer ensayo con registro.
-- Se puede correr más de una vez: no duplica nada.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.rehearsal_attendance_ficha') is null then
    raise exception 'ABORTADO: primero corre apply_0109_dev.sql.';
  end if;
  if not exists (select 1 from production_credits where production_id = 'showman' and tipo = 'reparto') then
    raise exception 'ABORTADO: primero corre carga_creditos_2026-10-15.sql.';
  end if;
end $$;
begin;

do $$
declare
  produccion text[] := array['Adriana Alarcón', 'Valeria Luna', 'Regina Cedillo', 'Camila Cedillo', 'Inés Agostinho',
                             'María José Arias', 'Santiago Rodríguez', 'Jimena Ortega', 'Juan Pablo Villalva', 'Patricio González'];
  bajas text[] := array['Camila Cano', 'Mario Hernández', 'Iris Itzel Rodríguez', 'Carlos Valderrama'];
  pasados date[] := array['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10']::date[];
  siguientes date[] := array['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28',
                             '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-09']::date[];
  -- Asistencia por ensayo pasado: P = asistió, F = falta, - = aún no entraba o ya era baja.
  lista text[][] := array[
    ['Esbeidy Felix', 'PPPPPPPP'], ['Ericka Torres', 'PPPPPPPP'], ['María Fernanda Morales', 'PPPPPPPP'],
    ['Bibiana Arriaga Manzanarez', 'PPPPPPPP'], ['Aylin Murillo Curiel', 'PPPPPPPP'], ['Camila Cano', 'PPPFF---'],
    ['Leslie Adamaris Hurtado Navarro', 'PPPPPPPP'], ['Maria Haro', 'PPFPFPFP'], ['Mario Hernández', 'PPP-----'],
    ['Iris Itzel Rodríguez', 'PPP-----'], ['Rita Ximena Arenas Martinez', 'PPPFPPPP'], ['Zoe Martínez', 'PPPPFPPF'],
    ['Berenice Velázquez Figueroa', 'PPFFPFPP'], ['Carlos Valderrama', 'PP------'], ['Tea Aflecht', 'PPPPPPPP'],
    ['Fanny Guardado', '-PPFPPPP'], ['Emiliano Castellanos', 'PPPPPPPP'], ['Andrea LLoréns Noriega', '---PPPPP'],
    ['Jose María Favela', '----PPPP']];
  i int; k int; pid uuid; rid uuid; d date; n_rep int := 0; n_asis int := 0; n_pasa int := 0;
  inicio timestamptz; fin timestamptz;
begin
  -- 1. Producción que sale de personaje: solo crédito.
  update production_credits c set solo_credito = true
    from people p
   where p.id = c.person_id and c.production_id = 'showman' and c.tipo = 'reparto' and not c.solo_credito
     and lower(p.nombre) = any (select lower(x) from unnest(produccion) x);

  -- 2. Bajas: ficha (si no existe) y crédito de ensamble dado de baja.
  for i in 1 .. array_length(bajas, 1) loop
    if not exists (select 1 from people where lower(nombre) = lower(bajas[i])) then
      insert into people (nombre) values (bajas[i]);
    end if;
    select id into pid from people where lower(nombre) = lower(bajas[i]) order by created_at limit 1;
    if not exists (select 1 from production_credits where production_id = 'showman' and person_id = pid) then
      insert into production_credits (production_id, person_id, tipo, activo, orden) values ('showman', pid, 'ensamble', false, 900 + i);
    end if;
  end loop;

  -- 3. Ensayos (sábados de 9:00 a 14:00, hora de México), a todo el elenco.
  for k in 1 .. array_length(pasados, 1) + array_length(siguientes, 1) loop
    d := case when k <= array_length(pasados, 1) then pasados[k] else siguientes[k - array_length(pasados, 1)] end;
    inicio := (d + time '09:00') at time zone 'America/Mexico_City';
    fin := (d + time '14:00') at time zone 'America/Mexico_City';
    if not exists (select 1 from rehearsals where production_id = 'showman' and inicia = inicio) then
      insert into rehearsals (production_id, titulo, inicia, termina, convocatoria, cerrado_at)
      values ('showman', 'Ensayo', inicio, fin, 'todos', case when k <= array_length(pasados, 1) then fin end);
      n_rep := n_rep + 1;
    end if;
  end loop;

  -- 4. Asistencia histórica: a la ficha y, si ya tiene cuenta, pasa enseguida.
  for i in 1 .. array_length(lista, 1) loop
    pid := null;
    select id into pid from people where lower(nombre) = lower(lista[i][1]) order by created_at limit 1;
    if pid is null then raise exception 'No encontré la ficha de %', lista[i][1]; end if;
    for k in 1 .. 8 loop
      continue when substr(lista[i][2], k, 1) = '-';
      select id into rid from rehearsals
       where production_id = 'showman' and inicia = (pasados[k] + time '09:00') at time zone 'America/Mexico_City';
      if not exists (select 1 from rehearsal_attendance_ficha where rehearsal_id = rid and person_id = pid)
         and not exists (select 1 from rehearsal_attendance a join people p on p.profile_id = a.user_id
                          where a.rehearsal_id = rid and p.id = pid) then
        insert into rehearsal_attendance_ficha (rehearsal_id, person_id, estado)
        values (rid, pid, case substr(lista[i][2], k, 1) when 'P' then 'presente' else 'falta' end);
        n_asis := n_asis + 1;
      end if;
    end loop;
    n_pasa := n_pasa + asistencia_ficha_pasar(pid);
  end loop;

  raise notice 'Ensayos nuevos: %, registros de asistencia: % (ya en cuentas: %)', n_rep, n_asis, n_pasa;
end $$;

commit;

select 'Listo. Ensayos de Showman: ' || (select count(*) from rehearsals where production_id = 'showman')
    || ' · Asistencia en cuentas: ' || (select count(*) from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id where r.production_id = 'showman' and a.historico)
    || ' · Esperando que se registren: ' || (select count(*) from rehearsal_attendance_ficha f join rehearsals r on r.id = f.rehearsal_id where r.production_id = 'showman')
    || ' · Solo crédito: ' || (select count(*) from production_credits where production_id = 'showman' and solo_credito)
    as resultado;
