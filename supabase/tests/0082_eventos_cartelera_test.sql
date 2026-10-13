-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0082 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000f9';
insert into fan_encuentros (production_id, tipo, titulo, inicia, liga, acceso, requiere_registro, requiere_boleto)
values ('showman', 'en_linea', 'Transmisión del club', now() + interval '2 days', 'https://secreto.example/live', 'club', false, false),
       (null, 'presencial', 'Meet público', now() + interval '1 day', null, 'publico', false, false),
       ('showman', 'presencial', 'Ya pasó', now() - interval '2 days', null, 'publico', false, false);

-- T1: sin sesión se ven en el escaparate también los del club (sin liga) y no los pasados.
do $$ declare n int; t text; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  select count(*) into n from eventos_cartelera(10) where titulo in ('Transmisión del club', 'Meet público', 'Ya pasó');
  if n <> 2 then raise exception 'FALLO T1: escaparate (%)', n; end if;
  select string_agg(row_to_json(x)::text, '') into t from eventos_cartelera(10) x;
  if t like '%secreto.example%' then raise exception 'FALLO T1: expuso la liga'; end if;
  if (select titulo from eventos_cartelera(1)) <> 'Meet público' then raise exception 'FALLO T1: orden o límite'; end if;
  perform set_config('role', 'postgres', true);
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0082)'; end $$;
