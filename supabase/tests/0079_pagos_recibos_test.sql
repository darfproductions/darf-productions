-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0079 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_debe@test.local'),
       ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_beca@test.local'),
       ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_pagado@test.local'),
       ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_baja@test.local'),
       ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000d5';
update profiles set nombre = 'Dana Debe', telefono = '4425550000' where id = '00000000-0000-0000-0000-0000000000d1';
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-0000000000d1', 'integrante'),
  ('showman', '00000000-0000-0000-0000-0000000000d2', 'integrante'),
  ('showman', '00000000-0000-0000-0000-0000000000d3', 'integrante'),
  ('showman', '00000000-0000-0000-0000-0000000000d4', 'integrante');
update member_enrollment set ingreso = '2027-01-01' where production_id = 'showman' and user_id::text like '00000000-0000-0000-0000-0000000000d%';
update member_enrollment set baja_at = '2027-02-15', baja_motivo = 'Prueba' where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000000d4';
insert into member_fee_terms (production_id, user_id, beca) values ('showman', '00000000-0000-0000-0000-0000000000d2', true);
insert into production_fees (production_id, monto, desde, hasta, dia_limite, cobrar)
values ('showman', 800, '2027-01-01', '2027-06-01', 10, true)
on conflict (production_id) do update set monto = 800, desde = '2027-01-01', hasta = '2027-06-01', dia_limite = 10, cobrar = true;

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

create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- T1: folio consecutivo por año y aviso al integrante con la liga a su recibo.
do $$ declare a uuid; b uuid; fa text; fb text; y text := extract(year from (now() at time zone 'America/Mexico_City'))::text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  insert into member_payments (production_id, user_id, periodo, monto, metodo) values ('showman', '00000000-0000-0000-0000-0000000000d1', '2027-01-01', 800, 'efectivo') returning id, folio into a, fa;
  insert into member_payments (production_id, user_id, periodo, monto, metodo, folio) values ('showman', '00000000-0000-0000-0000-0000000000d3', '2027-03-01', 800, 'transferencia', 'DARF-1999-0001') returning id, folio into b, fb;
  perform pg_temp.as_root();
  if fa !~ ('^DARF-' || y || '-[0-9]{4}$') then raise exception 'FALLO T1: folio (%)', fa; end if;
  if split_part(fb, '-', 3)::int <> split_part(fa, '-', 3)::int + 1 or split_part(fb, '-', 2) <> y then raise exception 'FALLO T1: no es consecutivo o se pudo elegir el folio (% / %)', fa, fb; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and tipo = 'pago'
                  and titulo = 'Recibo ' || fa || ': mensualidad de enero 2027, $800' and href = '/cuenta/produccion/showman#cuotas') then
    raise exception 'FALLO T1: aviso (%)', (select titulo from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' order by id desc limit 1);
  end if;
  if exists (select 1 from member_payments where folio is null) then raise exception 'FALLO T1: pagos sin folio'; end if;
  insert into ctx values ('a', a), ('b', b);
end $$;

-- T2: quién ve y quién registra.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if (select count(*) from member_payments) <> 1 then raise exception 'FALLO T2: el integrante ve pagos ajenos'; end if;
  begin
    insert into member_payments (production_id, user_id, periodo, monto) values ('showman', '00000000-0000-0000-0000-0000000000d1', '2027-02-01', 800);
    raise exception 'FALLO T2: el integrante registró su propio pago';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select payment_receipt((select v::uuid from ctx where k = 'b'))) is not null then raise exception 'FALLO T2: ve el recibo de otra persona'; end if;
  if (select payment_receipt((select v::uuid from ctx where k = 'a'))->>'telefono') is not null then raise exception 'FALLO T2: el recibo propio trae el teléfono'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  if (select payment_receipt((select v::uuid from ctx where k = 'a'))->>'telefono') <> '4425550000' then raise exception 'FALLO T2: el equipo no ve el teléfono para WhatsApp'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: borrar solo en los primeros 10 minutos; anular deja el folio, avisa y no cuenta en lo cobrado.
do $$ declare a uuid := (select v::uuid from ctx where k = 'a'); b uuid := (select v::uuid from ctx where k = 'b'); n int; antes numeric; j json; begin
  update member_payments set registrado_at = now() - interval '11 minutes' where id = a;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  delete from member_payments where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T3: se borró un pago viejo'; end if;
  delete from member_payments where id = b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T3: no se pudo borrar un pago recién capturado'; end if;
  antes := (season_summary('showman')->'taller'->>'cobrado')::numeric;
  begin perform payment_annul(a, '  '); raise exception 'FALLO T3: anuló sin motivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform payment_annul(a, 'Se capturó dos veces');
  begin perform payment_annul(a, 'otra vez'); raise exception 'FALLO T3: anuló dos veces';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (season_summary('showman')->'taller'->>'cobrado')::numeric <> antes - 800 then raise exception 'FALLO T3: lo cobrado cuenta el anulado'; end if;
  -- El equipo no puede cambiar el monto directo.
  update member_payments set monto = 1 where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T3: se editó un pago'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin perform payment_annul(a, 'yo'); raise exception 'FALLO T3: el integrante anuló';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  j := payment_receipt(a);
  if j->>'anulado_at' is null or j->>'motivo_anulacion' <> 'Se capturó dos veces' or j->>'folio' is null then raise exception 'FALLO T3: recibo anulado (%)', j; end if;
  perform pg_temp.as_root();
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and titulo like 'Recibo % anulado') then raise exception 'FALLO T3: aviso de anulación'; end if;
end $$;

-- T4: recordatorios: 3 días antes y al día siguiente del límite, una vez cada uno; respeta beca, pago y baja.
do $$ declare n int; begin
  insert into member_payments (production_id, user_id, periodo, monto) values ('showman', '00000000-0000-0000-0000-0000000000d3', '2027-03-01', 800);
  delete from notifications where tipo = 'pago';
  if notify_pagos('2027-03-05') <> 0 then raise exception 'FALLO T4: avisó antes de tiempo'; end if;
  n := notify_pagos('2027-03-07');
  if n <> 1 then raise exception 'FALLO T4: antes (%)', n; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and titulo = 'Tu mensualidad de marzo 2027 vence el 10') then
    raise exception 'FALLO T4: texto (%)', (select titulo from notifications where tipo = 'pago' limit 1);
  end if;
  if notify_pagos('2027-03-08') <> 0 then raise exception 'FALLO T4: repitió el aviso'; end if;
  if notify_pagos('2027-03-10') <> 0 then raise exception 'FALLO T4: avisó el día límite'; end if;
  if notify_pagos('2027-03-11') <> 1 then raise exception 'FALLO T4: vencido'; end if;
  if notify_pagos('2027-03-12') <> 0 then raise exception 'FALLO T4: repitió vencido'; end if;
  if exists (select 1 from notifications where tipo = 'pago' and user_id <> '00000000-0000-0000-0000-0000000000d1'
              and user_id::text like '00000000-0000-0000-0000-0000000000d%') then raise exception 'FALLO T4: avisó a beca, pagado o baja'; end if;
  -- Un pago anulado no cuenta como pagado.
  update member_payments set anulado_at = now() where user_id = '00000000-0000-0000-0000-0000000000d3' and periodo = '2027-03-01';
  if notify_pagos('2027-04-07') <> 2 then raise exception 'FALLO T4: abril (debe y el del pago anulado de marzo no cuenta en abril)'; end if;
  if notify_pagos('2027-03-13') <> 1 then raise exception 'FALLO T4: el pago anulado se tomó como pagado'; end if;
  -- Taller sin pagos: no avisa.
  update production_fees set cobrar = false where production_id = 'showman';
  if notify_pagos('2027-05-07') <> 0 then raise exception 'FALLO T4: taller sin pagos'; end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0079)'; end $$;
