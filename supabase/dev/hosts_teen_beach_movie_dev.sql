-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Teen Beach Movie (Diego 2026-11-23): agrega como Host de audición, en las audiciones de la obra que no han terminado,
-- a Ana Fernanda Ramírez, Regina Cedillo, Diego Romero, Jaime Hernández, Sandra López y Camila Cedillo.
-- Busca cada cuenta por su nombre (sin importar acentos ni mayúsculas). Si un nombre no tiene cuenta o hay más de una
-- con ese nombre, no lo agrega y lo avisa en la lista final. No quita a nadie. Se puede correr más de una vez.
-- Si la base no es DEV, aborta sin cambiar nada.
create temp table _hosts (nombre text, resultado text);

do $$
declare n text; uids uuid[]; aids uuid[]; aid uuid;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  select array_agg(a.id) into aids from auditions a join productions p on p.id = a.production_id
   where (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie') and a.estado not in ('finalizada', 'cancelada');
  if aids is null then raise exception 'ABORTADO: no encontré audiciones activas de Teen Beach Movie.'; end if;

  foreach n in array array['Ana Fernanda Ramírez', 'Regina Cedillo', 'Diego Romero', 'Jaime Hernández', 'Sandra López', 'Camila Cedillo'] loop
    select array_agg(id) into uids from profiles where unaccent_lower(btrim(coalesce(nombre, ''))) = unaccent_lower(n);
    if uids is null then
      insert into _hosts values (n, 'NO SE AGREGÓ: no encontré una cuenta con ese nombre');
    elsif cardinality(uids) > 1 then
      insert into _hosts values (n, format('NO SE AGREGÓ: hay %s cuentas con ese nombre', cardinality(uids)));
    else
      foreach aid in array aids loop
        insert into audition_members (audition_id, user_id, role_id) values (aid, uids[1], 'host')
        on conflict (audition_id, user_id, role_id) do nothing;
      end loop;
      insert into _hosts values (n, 'Host');
    end if;
  end loop;
end $$;

-- Resultado: quién quedó como host y en qué audición.
select h.nombre, h.resultado,
       (select string_agg(a.titulo, ' | ') from audition_members m join auditions a on a.id = m.audition_id
          join profiles pr on pr.id = m.user_id join productions p on p.id = a.production_id
         where m.role_id = 'host' and unaccent_lower(btrim(coalesce(pr.nombre, ''))) = unaccent_lower(h.nombre)
           and (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie')) as audiciones
  from _hosts h;
