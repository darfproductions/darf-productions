-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0097 aplicadas.

insert into productions (id, nombre, estado, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase)
values ('t97-privada', 'Obra Privada 97', 'borrador', '#000000', '#111111', '#ffffff', '#ff0000', 't97/logo.png', 't97/amb.jpg', 'Frase 97');
insert into auditions (id, production_id, titulo, estado) values
  ('00000000-0000-0000-0000-000000000971', 't97-privada', 'Convocatoria 97', 'abierta'),
  ('00000000-0000-0000-0000-000000000972', 't97-privada', 'Borrador 97', 'borrador');

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- T1: el público no ve la obra privada pero sí su convocatoria con nombre y kit (sin liga).
do $$ declare o json; begin
  perform pg_temp.as_anon();
  if exists (select 1 from productions where id = 't97-privada') then raise exception 'FALLO T1: se ve la obra'; end if;
  if not exists (select 1 from auditions where id = '00000000-0000-0000-0000-000000000971') then raise exception 'FALLO T1: no se ve la convocatoria'; end if;
  o := audition_obra('00000000-0000-0000-0000-000000000971');
  if o->>'nombre' <> 'Obra Privada 97' or (o->>'publica')::boolean or o->>'color_acento' <> '#ff0000' then raise exception 'FALLO T1: %', o; end if;
  perform pg_temp.as_root();
end $$;

-- T2: una convocatoria en borrador no deja ver la obra.
do $$ begin
  perform pg_temp.as_anon();
  if audition_obra('00000000-0000-0000-0000-000000000972') is not null then raise exception 'FALLO T2: borrador'; end if;
  if audition_obra('00000000-0000-0000-0000-000000000979') is not null then raise exception 'FALLO T2: inexistente'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: si la obra se publica, "publica" es verdadero.
update productions set estado = 'archivada' where id = 't97-privada';
do $$ begin
  perform pg_temp.as_anon();
  if not (audition_obra('00000000-0000-0000-0000-000000000971')->>'publica')::boolean then raise exception 'FALLO T3'; end if;
  perform pg_temp.as_root();
end $$;

select 'OK 0097';
