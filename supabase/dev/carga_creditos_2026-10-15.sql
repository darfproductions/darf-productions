-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Carga de datos (Diego, 2026-10-15). No cambia la estructura de la base. Requiere 0108.
--   * Staff de High School Musical y Mamma Mia! (para que les cuente el crédito en DARF Loyalty).
--   * Personajes de Showman y su Reparto. Charity Barnum queda por definir (solo personaje).
--     El Reparto entra como "No publicado" (0107): se publica desde Panel -> Showman -> Elenco.
-- Se usa la ficha que ya existe (con su nombre como está); si no existe, se crea con el nombre de la lista.
-- Se puede correr más de una vez: no duplica fichas, créditos ni personajes.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'production_credits' and column_name = 'publicado') then
    raise exception 'ABORTADO: primero corre apply_0107_dev.sql.';
  end if;
end $$;
begin;

do $$
declare
  -- Staff: [obra, nombre de la ficha]
  staff text[][] := array[
    ['hsm', 'Raúl Linares'], ['hsm', 'Karla Urusquieta'], ['hsm', 'Maximiliano Ramírez'], ['hsm', 'Jesús Barrios'],
    ['hsm', 'Isabella Inzunza'], ['hsm', 'María José Sánchez'], ['hsm', 'Antonella Tupa'], ['hsm', 'Camila Bauer'],
    ['hsm', 'Fernanda Moreno'], ['hsm', 'María José Arias'], ['hsm', 'Mariana Noguez'], ['hsm', 'Valeria Luna'],
    ['hsm', 'Enrique Burguette'], ['hsm', 'Bruno Jiménez'], ['hsm', 'Daniel Talavera'], ['hsm', 'Patricio Rodríguez'],
    ['hsm', 'Andrea Icazbalzeta'], ['hsm', 'Marcelo Calderón'],
    ['mm', 'Constanza Hansen'], ['mm', 'Carmina Díaz'], ['mm', 'Natalia Ramírez'], ['mm', 'Pablo Caro'],
    ['mm', 'Benjamín García'], ['mm', 'Antonella Romagnoli'], ['mm', 'Emilia Garibay'], ['mm', 'Paola Maya'],
    ['mm', 'Carolina Olvera'], ['mm', 'Santiago Lima']];
  -- Reparto de Showman en orden: [personaje, nombre de la ficha ('' = por definir)]
  reparto text[][] := array[
    ['P.T. Barnum', 'Jose María Favela'],
    ['Phillip Carlyle', 'Emiliano Castellanos'],
    ['Charity Barnum', ''],
    ['Anne Wheeler', 'Adriana Alarcón'],
    ['Lettie Lutz', 'Ericka Torres'],
    ['O''Malia / Reina de Inglaterra', 'Esbeidy Felix'],
    ['Pulgarcita / Joven Barnum', 'Maria Haro'],
    ['Joven Charity / Caroline Barnum', 'Tea Aflecht'],
    ['Hellen Barnum', 'Andrea LLoréns Noriega'],
    ['W.D. Wheeler', 'Valeria Luna'],
    ['Gertrudis Stratton / Mujer de Uñas', 'María Fernanda Morales'],
    ['Mujer de Oro', 'Bibiana Arriaga Manzanarez'],
    ['Prestamista / Mujer Tatuada', 'Berenice Velázquez Figueroa'],
    ['Mujer Pájaro', 'Aylin Murillo Curiel'],
    ['Mujer Fuerte', 'Leslie Adamaris Hurtado Navarro'],
    ['Mujer Bicolor', 'Rita Ximena Arenas Martinez'],
    ['Mujer de 3 Ojos', 'Zoe Martínez'],
    ['Mujer de Pelo', 'Fanny Guardado'],
    ['Mujer Albina', 'Regina Cedillo'],
    ['Mujer Albina', 'Camila Cedillo'],
    ['Mujer Albina', 'Inés Agostinho'],
    ['Mujer de Fuego', 'María José Arias'],
    ['Papá de Phillip / Protestante', 'Santiago Rodríguez'],
    ['Mamá de Phillip', 'Jimena Ortega'],
    ['Bennet / Papá de Charity', 'Juan Pablo Villalva'],
    ['Papá de Barnum', 'Patricio González']];
  i int; pid uuid; base int; n_ficha int := 0; n_staff int := 0; n_rep int := 0; n_pers int := 0;
begin
  -- Fichas: se busca por nombre exacto (sin importar mayúsculas); si no hay, se crea.
  for i in 1 .. array_length(staff, 1) + array_length(reparto, 1) loop
    declare nom text := case when i <= array_length(staff, 1) then staff[i][2] else reparto[i - array_length(staff, 1)][2] end;
    begin
      if nom <> '' and not exists (select 1 from people where lower(nombre) = lower(nom)) then
        insert into people (nombre) values (nom);
        n_ficha := n_ficha + 1;
      end if;
    end;
  end loop;

  -- Staff de HSM y MM.
  for i in 1 .. array_length(staff, 1) loop
    select id into pid from people where lower(nombre) = lower(staff[i][2]) order by created_at limit 1;
    if not exists (select 1 from production_credits where production_id = staff[i][1] and person_id = pid and tipo = 'staff') then
      insert into production_credits (production_id, person_id, tipo, orden)
      values (staff[i][1], pid, 'staff',
              coalesce((select max(orden) from production_credits where production_id = staff[i][1] and tipo = 'staff'), 0) + 1);
      n_staff := n_staff + 1;
    end if;
  end loop;

  -- Personajes de Showman (una vez cada uno, en el orden de la lista).
  base := coalesce((select max(orden) from production_characters where production_id = 'showman'), 0);
  for i in 1 .. array_length(reparto, 1) loop
    if not exists (select 1 from production_characters where production_id = 'showman' and lower(nombre) = lower(reparto[i][1])) then
      base := base + 1;
      insert into production_characters (production_id, nombre, orden) values ('showman', reparto[i][1], base);
      n_pers := n_pers + 1;
    end if;
  end loop;

  -- Reparto de Showman (entra "No publicado").
  for i in 1 .. array_length(reparto, 1) loop
    continue when reparto[i][2] = '';
    select id into pid from people where lower(nombre) = lower(reparto[i][2]) order by created_at limit 1;
    if not exists (select 1 from production_credits where production_id = 'showman' and person_id = pid and tipo = 'reparto' and papel = reparto[i][1]) then
      insert into production_credits (production_id, person_id, tipo, papel, orden) values ('showman', pid, 'reparto', reparto[i][1], i);
      n_rep := n_rep + 1;
    end if;
  end loop;

  raise notice 'Fichas nuevas: %, staff: %, personajes: %, reparto: %', n_ficha, n_staff, n_pers, n_rep;
end $$;

commit;

select 'Listo. Staff HSM: ' || (select count(*) from production_credits where production_id = 'hsm' and tipo = 'staff')
    || ' · Staff MM: ' || (select count(*) from production_credits where production_id = 'mm' and tipo = 'staff')
    || ' · Personajes Showman: ' || (select count(*) from production_characters where production_id = 'showman')
    || ' · Reparto Showman (sin publicar): ' || (select count(*) from production_credits where production_id = 'showman' and tipo = 'reparto' and not publicado)
    as resultado;
