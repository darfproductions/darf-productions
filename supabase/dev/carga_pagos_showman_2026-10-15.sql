-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Pagos del taller de Showman (hoja de Diego, 2026-10-15). Requiere apply_0111_dev.sql.
--   * Cuotas: inscripción $600 (se pagó el 22 de agosto) y mensualidad $600 de septiembre a diciembre.
--     Se paga el primer sábado del mes con una semana de tolerancia: vence el segundo sábado.
--   * Cobro activo: recordatorios y adeudos en la página.
--   * Quien ya tiene cuenta recibe sus pagos enseguida (sin aviso); quien no, los recibe al ligar su cuenta.
--   * Bajas: Iris, Mario y Carlos sin adeudo; Camila Cano debe septiembre. Jose María Favela: beca.
-- Se puede correr más de una vez: no duplica nada.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.member_payments_ficha') is null then
    raise exception 'ABORTADO: primero corre apply_0111_dev.sql.';
  end if;
end $$;
begin;

insert into production_fees (production_id, monto, desde, hasta, dia_limite, cobrar, inscripcion, vence_sabado)
values ('showman', 600, '2026-09-01', '2026-12-01', 10, true, 600, true)
on conflict (production_id) do update set monto = excluded.monto, desde = excluded.desde, hasta = excluded.hasta,
  cobrar = true, inscripcion = excluded.inscripcion, vence_sabado = true;

do $$
declare
  -- Nombres (como está la ficha y como viene en la hoja) · pagos (I = inscripción, S = septiembre, O = octubre)
  -- · ingreso · baja · beca
  lista text[][] := array[
    ['emiliano castellanos', '', 'ISO', '2026-08-22', '', 'no'],
    ['ericka torres', 'ericka yolanda torres nieto', 'IS', '2026-08-22', '', 'no'],
    ['esbeidy felix', 'esbeidy felix echauri', 'ISO', '2026-08-22', '', 'no'],
    ['maria haro', 'maria haro maya', 'IS', '2026-08-22', '', 'no'],
    ['tea aflecht', '', 'ISO', '2026-08-22', '', 'no'],
    ['andrea llorens', 'andrea llorens noriega', 'ISO', '2026-09-12', '', 'no'],
    ['maria fernanda morales', 'maria fernanda morales herrera', 'ISO', '2026-08-22', '', 'no'],
    ['bibiana arriaga', 'bibiana arriaga manzanarez', 'ISO', '2026-08-22', '', 'no'],
    ['berenice velazquez', 'berenice velazquez figueroa', 'ISO', '2026-08-22', '', 'no'],
    ['aylin murillo', 'aylin murillo curiel', 'ISO', '2026-08-22', '', 'no'],
    ['adamaris navarro', 'leslie adamaris hurtado navarro', 'ISO', '2026-08-22', '', 'no'],
    ['rita arenas', 'rita ximena arenas martinez', 'ISO', '2026-08-22', '', 'no'],
    ['zoe martinez', 'zoe fernanda martinez mireles', 'ISO', '2026-08-22', '', 'no'],
    ['fanny guardado', '', 'ISO', '2026-08-29', '', 'no'],
    ['jose maria favela', '', '', '2026-09-19', '', 'si'],
    ['iris itzel rodriguez', 'iris itzel rodriguez garces', 'IS', '2026-08-22', '2026-09-12', 'no'],
    ['carlos valderrama', 'carlos valderrama n', 'I', '2026-08-22', '2026-09-01', 'no'],
    ['mario hernandez', '', 'IS', '2026-08-22', '2026-09-12', 'no'],
    ['camila cano', 'camila cano medina', 'I', '2026-08-22', '2026-09-30', 'no']];
  i int; k int; pid uuid; letra text; n_fichas int := 0; n_pagos int := 0; n_pasa int := 0;
begin
  for i in 1 .. array_length(lista, 1) loop
    pid := null;
    select pe.id into pid from people pe
     where regexp_replace(lower(translate(btrim(pe.nombre), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuAEIOUUnN')), '\s+', ' ', 'g')
             in (lista[i][1], lista[i][2])
       and exists (select 1 from production_credits c where c.person_id = pe.id and c.production_id = 'showman'
                    and c.tipo in ('reparto', 'ensamble'))
     order by pe.created_at limit 1;
    if pid is null then raise exception 'No encontré la ficha de % en Showman', lista[i][1]; end if;
    n_fichas := n_fichas + 1;

    insert into ficha_cuotas (production_id, person_id, ingreso, baja_at, beca, sin_inscripcion)
    values ('showman', pid, lista[i][4]::date, nullif(lista[i][5], '')::date, lista[i][6] = 'si', lista[i][6] = 'si')
    on conflict (production_id, person_id) do update
      set ingreso = excluded.ingreso, baja_at = excluded.baja_at, beca = excluded.beca, sin_inscripcion = excluded.sin_inscripcion;

    for k in 1 .. length(lista[i][3]) loop
      letra := substr(lista[i][3], k, 1);
      insert into member_payments_ficha (production_id, person_id, concepto, periodo, monto, metodo, nota, pagado_at)
      values ('showman', pid,
              case letra when 'I' then 'inscripcion' else 'mensualidad' end,
              case letra when 'I' then date '2026-08-01' when 'S' then date '2026-09-01' else date '2026-10-01' end,
              600, 'otro', 'Hoja de pagos de Diego (2026-10-15)',
              (case letra when 'I' then date '2026-08-22' when 'S' then date '2026-09-05' else date '2026-10-03' end + time '09:00')
                at time zone 'America/Mexico_City')
      on conflict (production_id, person_id, concepto, periodo) do nothing;
      if found then n_pagos := n_pagos + 1; end if;
    end loop;

    -- Si ya tiene cuenta, pasa enseguida (sin aviso).
    n_pasa := n_pasa + pagos_ficha_pasar(pid);
  end loop;
  raise notice 'Fichas: %, pagos nuevos: % (ya en cuentas: %)', n_fichas, n_pagos, n_pasa;
end $$;

commit;

select 'Listo. Pagos de Showman en cuentas: ' || (select count(*) from member_payments where production_id = 'showman' and anulado_at is null)
    || ' · esperando que se registren: ' || (select count(*) from member_payments_ficha where production_id = 'showman')
    || ' · fichas sin cuenta con cuotas: ' || (select count(*) from ficha_cuotas where production_id = 'showman') as resultado;
