-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0131 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000131a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't131_recep@test.local'),
  ('00000000-0000-0000-0000-000000131a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't131_host@test.local'),
  ('00000000-0000-0000-0000-000000131a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't131_juez@test.local'),
  ('00000000-0000-0000-0000-000000131a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't131_ana@test.local');

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

insert into productions (id, nombre, estado) values ('t131_obra', 'Obra 131', 'borrador');

do $$
declare aid uuid; lela uuid; brady uuid; ap uuid[]; x uuid; j json; ok boolean; n int; r text;
        recep uuid := '00000000-0000-0000-0000-000000131a01'; host uuid := '00000000-0000-0000-0000-000000131a02';
        juez uuid := '00000000-0000-0000-0000-000000131a03';
begin
  insert into auditions (production_id, titulo, estado, numeracion) values ('t131_obra', 'Audición 131', 'abierta', 'llegada') returning id into aid;
  insert into audition_members (audition_id, user_id, role_id) values (aid, recep, 'registro'), (aid, host, 'host'), (aid, juez, 'juez');
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Lela', 1) returning id into lela;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Brady', 2) returning id into brady;
  -- Cinco aspirantes: inscritos en este orden; personajes Brady, Lela, Lela, (ninguno), Brady.
  ap := array[]::uuid[];
  for i in 1..5 loop
    insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, roles, created_at)
      values (aid, true, 'P' || i, '2004-01-01', '55' || i,
              case i when 1 then array[brady] when 2 then array[lela] when 3 then array[lela] when 5 then array[brady] else '{}' end,
              now() - make_interval(hours => 10 - i))
      returning id into x;
    ap := ap || x;
  end loop;

  -- T1: recepción registra por llegada (P3, P1, P2, P5; P4 no llega) y da Siguiente.
  perform pg_temp.as_user(recep);
  foreach x in array array[ap[3], ap[1], ap[2], ap[5]] loop
    j := audition_checkin(aid, x::text);
    if j->>'result' <> 'ok' then raise exception 'FALLO T1a: %', j; end if;
  end loop;
  if (j->'personajes'->>0) <> 'Brady' then raise exception 'FALLO T1b: personajes en el check-in %', j; end if;
  j := audition_siguiente(aid);
  if (j->>'app')::uuid <> ap[3] then raise exception 'FALLO T1c: el primero que llegó %', j; end if;

  -- T2: el juez no mueve la fila.
  perform pg_temp.as_user(juez);
  begin perform audition_siguiente(aid); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2a: el juez dio siguiente'; end if;
  begin perform audition_reordenar(aid, 'personaje'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2b: el juez reordenó'; end if;

  -- T3: ordenar por personaje a quienes esperan (P1 Brady, P2 Lela, P5 Brady): P2, P1, P5. P3 (en escena) no se mueve.
  perform pg_temp.as_user(host);
  n := audition_reordenar(aid, 'personaje');
  perform pg_temp.as_root();
  if n <> 3 then raise exception 'FALLO T3a: % movidos', n; end if;
  if (select array_agg(id order by numero) from audition_applications where audition_id = aid and entered_at is null and numero is not null)
     <> array[ap[2], ap[1], ap[5]] then raise exception 'FALLO T3b: orden por personaje'; end if;
  if (select numero from audition_applications where id = ap[3]) <> 1 then raise exception 'FALLO T3c: el de escena cambió'; end if;

  -- T4: por registro: P1, P2, P5. "Al final": P1 se va al final.
  perform pg_temp.as_user(recep);
  perform audition_reordenar(aid, 'registro');
  perform audition_al_final(aid, ap[1]);
  perform pg_temp.as_root();
  if (select array_agg(id order by numero) from audition_applications where audition_id = aid and entered_at is null and numero is not null)
     <> array[ap[2], ap[5], ap[1]] then raise exception 'FALLO T4a: al final'; end if;
  perform pg_temp.as_user(recep);
  begin perform audition_al_final(aid, ap[3]); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4b: movió al que está en escena'; end if;

  -- T5: el host y recepción presionan Siguiente: avanza en orden, sin saltar. P4 (no llegó) nunca sale.
  perform pg_temp.as_user(host);
  if (audition_siguiente(aid)->>'app')::uuid <> ap[2] then raise exception 'FALLO T5a'; end if;
  perform pg_temp.as_user(recep);
  if (audition_siguiente(aid)->>'app')::uuid <> ap[5] then raise exception 'FALLO T5b'; end if;
  if (audition_siguiente(aid)->>'app')::uuid <> ap[1] then raise exception 'FALLO T5c'; end if;
  if audition_siguiente(aid)->>'app' is not null then raise exception 'FALLO T5d: debía quedar vacío'; end if;

  -- T6: el juez marca opciones (ronda 1) y califica.
  perform pg_temp.as_user(juez);
  perform audition_picks_set(ap[2], 1, jsonb_build_array(jsonb_build_object('opcion', 1, 'role_id', lela)));
  perform audition_picks_set(ap[1], 1, jsonb_build_array(jsonb_build_object('opcion', 1, 'role_id', brady)));
  insert into audition_scores (application_id, judge_id, ronda, puntos) values (ap[2], juez, 1, '{"canto": 5, "baile": 4}');

  -- T7: los datos para decidir: P2 con marca de Lela y promedio 4.5; P4 (no llegó) no aparece.
  perform pg_temp.as_user(host);
  j := audition_cierre_datos(aid);
  if json_array_length(j->'personas') <> 4 then raise exception 'FALLO T7a: % personas', json_array_length(j->'personas'); end if;
  if (select (p->>'promedio')::numeric from json_array_elements(j->'personas') p where (p->>'id')::uuid = ap[2]) <> 4.5
     or (select (p->'marcas'->>lela::text)::int from json_array_elements(j->'personas') p where (p->>'id')::uuid = ap[2]) <> 1 then
    raise exception 'FALLO T7b: %', j;
  end if;
  perform pg_temp.as_user(juez);
  begin perform audition_cierre_datos(aid); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T7c: el juez vio el cierre'; end if;
  begin perform audition_cerrar_ronda(aid, 'votacion'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T7d: el juez cerró la ronda'; end if;

  -- T8: callback en otra fecha con P2 y P1: conservan número, guardan la ronda 1, vuelven a escanear el mismo QR.
  perform pg_temp.as_user(host);
  begin perform audition_cerrar_ronda(aid, 'callback', array[ap[2]], 'otra_fecha', now() - interval '1 day'); ok := false;
  exception when others then ok := sqlerrm like '%fecha%'; end;
  if not ok then raise exception 'FALLO T8a: fecha pasada'; end if;
  r := audition_cerrar_ronda(aid, 'callback', array[ap[2], ap[1]], 'otra_fecha', now() + interval '3 days', 'Foro DARF');
  perform pg_temp.as_root();
  if r <> 'callback' or (select fase || con_callback::text || callback_cuando from auditions where id = aid) <> 'callbacktrueotra_fecha' then
    raise exception 'FALLO T8b: %', (select row_to_json(a) from auditions a where id = aid);
  end if;
  if exists (select 1 from audition_applications where id in (ap[1], ap[2])
              and (estado <> 'callback' or ronda <> 2 or checked_in_at is not null or entered_at is not null
                   or jsonb_array_length(rondas_previas) <> 1 or (rondas_previas->0->>'entered_at') is null)) then
    raise exception 'FALLO T8c: la fila del callback no quedó limpia';
  end if;
  if (select count(*) from audition_picks where ronda = 2 and application_id = ap[2]) <> 1 then raise exception 'FALLO T8d: opciones a ronda 2'; end if;
  if not exists (select 1 from audit_log where tabla = 'auditions' and accion = 'cerrar_ronda' and production_id = 't131_obra') then
    raise exception 'FALLO T8e: bitácora';
  end if;

  -- T9: ese día: P5 (no llamado) no entra; P1 y P2 sí, con su mismo número; Siguiente solo toma llamados.
  select numero, qr_token::text into n, r from audition_applications where id = ap[1];
  perform pg_temp.as_user(recep);
  if audition_checkin(aid, ap[5]::text)->>'result' <> 'no_callback' then raise exception 'FALLO T9a: entró alguien no llamado'; end if;
  j := audition_checkin(aid, r);
  if j->>'result' <> 'ok' or (j->>'numero')::int <> n or not (j->>'callback')::boolean then raise exception 'FALLO T9b: %', j; end if;
  perform audition_checkin(aid, ap[2]::text);
  perform pg_temp.as_root();
  update audition_applications set finished_at = null where id = ap[3];   -- alguien de la ronda 1 que quedó "a medias"
  perform pg_temp.as_user(recep);
  if (audition_siguiente(aid)->>'app')::uuid <> ap[2] then raise exception 'FALLO T9c: el menor número llamado primero'; end if;
  if (audition_siguiente(aid)->>'app')::uuid <> ap[1] then raise exception 'FALLO T9d'; end if;
  if audition_siguiente(aid)->>'app' is not null then raise exception 'FALLO T9e: tomó a alguien no llamado'; end if;
  begin perform audition_en_escena(aid, ap[3]); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T9f: puso en escena a alguien no llamado'; end if;

  -- T10: terminado el callback, a votación.
  perform pg_temp.as_user(host);
  if audition_cerrar_ronda(aid, 'votacion') <> 'votacion' then raise exception 'FALLO T10a'; end if;
  perform pg_temp.as_root();
  if (select fase from auditions where id = aid) <> 'votacion' or not (select con_callback from auditions where id = aid) then raise exception 'FALLO T10b'; end if;

  -- T11: otra audición, directo a votación sin callback: con_callback queda en falso (se vota con la ronda 1).
  update auditions set fase = 'audicion', con_callback = true, callback_cuando = null where id = aid;
  update audition_applications set estado = 'callback' where id = ap[5];
  perform pg_temp.as_user(host);
  perform audition_cerrar_ronda(aid, 'votacion');
  perform pg_temp.as_root();
  if (select con_callback from auditions where id = aid) or exists (select 1 from audition_applications where audition_id = aid and estado = 'callback') then
    raise exception 'FALLO T11';
  end if;

  -- T12: callback hoy: siguen registrados.
  update auditions set fase = 'audicion' where id = aid;
  perform pg_temp.as_user(host);
  perform audition_cerrar_ronda(aid, 'callback', array[ap[5]], 'hoy');
  perform pg_temp.as_root();
  if (select checked_in_at is null or entered_at is not null from audition_applications where id = ap[5]) then raise exception 'FALLO T12'; end if;

  -- T13: el recordatorio corre sin fallar (sin correo configurado, no hace nada visible).
  perform auditions_recordatorios_qr();

  raise notice '0131 OK';
end $$;
