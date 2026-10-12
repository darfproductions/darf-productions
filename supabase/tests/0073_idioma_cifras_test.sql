-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0073 aplicadas.

do $$ declare s json; antes int; pf uuid; o uuid; begin
  -- T1: idioma se guarda y tiene tope.
  update productions set idioma = 'Español' where id = 'showman';
  begin
    update productions set idioma = repeat('x', 61) where id = 'showman';
    raise exception 'FALLO T1: aceptó idioma larguísimo';
  exception when check_violation then null;
  end;

  -- T2: cifras: solo obras públicas, funciones pasadas y boletos aprobados.
  s := public_stats();
  antes := (s->>'funciones')::int;
  insert into performances (production_id, starts_at) values ('showman', now() - interval '1 day');
  insert into performances (production_id, starts_at) values ('showman', now() + interval '9 days') returning id into pf;
  if (public_stats()->>'funciones')::int <> antes + 1 then raise exception 'FALLO T2: funciones'; end if;
  antes := (public_stats()->>'boletos')::int;
  insert into orders (performance_id, buyer_nombre, buyer_telefono, total) values (pf, 'Ana', '55', 100) returning id into o;
  insert into tickets (order_id, performance_id, unit_price) values (o, pf, 100);
  if (public_stats()->>'boletos')::int <> antes then raise exception 'FALLO T2: contó boleto pendiente'; end if;
  update orders set status = 'aprobado' where id = o;
  if (public_stats()->>'boletos')::int <> antes + 1 then raise exception 'FALLO T2: no contó aprobado'; end if;
  antes := (public_stats()->>'producciones')::int;
  update productions set estado = 'borrador' where id = 'showman';
  if (public_stats()->>'producciones')::int <> antes - 1 then raise exception 'FALLO T2: contó borrador'; end if;

  -- T3: cualquiera puede leer las cifras.
  set local role anon;
  perform public_stats();
  reset role;

  -- T4: cuenta de Google: el nombre llega como full_name.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_google@test.local', '{"full_name":"Ana Google"}');
  if (select nombre from profiles where id = '00000000-0000-0000-0000-0000000000d1') is distinct from 'Ana Google' then raise exception 'FALLO T4: nombre de Google'; end if;

  raise exception 'OK: TODAS LAS PRUEBAS PASARON (0073)';
end $$;
