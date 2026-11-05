-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0139: tipo de producción (profesional, showcase, taller, escuela) y si la obra vende boletos por DARF.
-- Deja a Teen Beach Movie como ESCUELA sin boletería (decisión de Diego); todo lo demás queda como profesional con
-- boletería, así que Showman no cambia. No borra ni mueve ningún dato: solo cambia qué se ve en el panel.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.audition_avisar_turnos(uuid)') is null then
    raise exception 'ABORTADO: primero corre el script de 0136.';
  end if;
end $$;
-- 0139 (Diego 2026-11-05, fase 4 del panel): tipo de producción.
--   * productions.tipo: 'profesional' (Showman), 'showcase', 'taller' o 'escuela' (Teen Beach Movie). Enciende y apaga
--     pestañas y textos del panel de la obra; no borra ni mueve ningún dato. Lo que no aplica queda en "Más".
--   * productions.con_boleteria: si la obra vende boletos por DARF. Se prende o apaga por obra (en una escuela a veces
--     vende DARF y a veces la escuela reparte). Con el tipo escuela, la web lo propone apagado.
--   * Las obras que ya existen quedan como 'profesional' con boletería: nada cambia para Showman.
-- Precede: 0136.

alter table productions
  add column if not exists tipo text not null default 'profesional',
  add column if not exists con_boleteria boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'productions_tipo_valido') then
    alter table productions add constraint productions_tipo_valido check (tipo in ('profesional', 'showcase', 'taller', 'escuela'));
  end if;
end $$;

comment on column productions.tipo is 'Tipo de producción (0139): profesional, showcase, taller o escuela. Solo cambia qué se ve en el panel.';
comment on column productions.con_boleteria is 'Vende boletos por DARF (0139). Apagado: el panel esconde Boletos y no pide "Listo para vender".';

-- Teen Beach Movie: taller de ESCUELA sin boletería por DARF (se puede prender después en Ficha de la producción).
do $$
declare r record; n int := 0;
begin
  for r in select id, nombre from productions where lower(nombre) like 'teen beach%' loop
    update productions set tipo = 'escuela', con_boleteria = false where id = r.id;
    n := n + 1;
    raise notice 'Obra "%" (%): escuela, sin boletería por DARF.', r.nombre, r.id;
  end loop;
  if n = 0 then raise notice 'No encontré ninguna obra que empiece con "Teen Beach": el tipo se cambia desde Ficha de la producción.'; end if;
end $$;

select 'Listo 0139: ' || string_agg(nombre || ' = ' || tipo || case when con_boleteria then '' else ' (sin boletería)' end, ' · ' order by nombre) as resultado
  from productions where estado <> 'archivada';
