-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0107 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e71', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't107_a@test.local');
-- Obra en borrador (la plantilla impide publicarla en la prueba): production_is_visible se simula abajo.
insert into productions (id, nombre, estado) values ('t107_obra', 'Obra 107', 'borrador');
insert into people (id, nombre, profile_id) values
  ('00000000-0000-0000-0000-00000000e701', 'Ana Reparto', '00000000-0000-0000-0000-000000000e71'),
  ('00000000-0000-0000-0000-00000000e702', 'Beto Ensamble', null),
  ('00000000-0000-0000-0000-00000000e703', 'Caro Creativa', null);

-- T1: reparto y ensamble nuevos entran sin publicar; creativo sale publicado. Aun sin publicar, quien tiene
-- cuenta ya es integrante (0106).
do $$ begin
  insert into production_credits (production_id, person_id, tipo, papel) values
    ('t107_obra', '00000000-0000-0000-0000-00000000e701', 'reparto', 'Brady'),
    ('t107_obra', '00000000-0000-0000-0000-00000000e703', 'creativo', 'Coreografía');
  insert into production_credits (production_id, person_id, tipo, publicado) values
    ('t107_obra', '00000000-0000-0000-0000-00000000e702', 'ensamble', true);
  if exists (select 1 from production_credits where production_id = 't107_obra' and tipo in ('reparto', 'ensamble') and publicado) then
    raise exception 'FALLO T1: elenco publicado al agregarlo';
  end if;
  if not (select publicado from production_credits where production_id = 't107_obra' and tipo = 'creativo') then
    raise exception 'FALLO T1: creativo sin publicar';
  end if;
  if not exists (select 1 from production_members where production_id = 't107_obra' and user_id = '00000000-0000-0000-0000-000000000e71' and role_id = 'integrante') then
    raise exception 'FALLO T1: sin acceso de integrante';
  end if;
end $$;

-- Para probar lo público, la obra cuenta como visible (sin tocar la guarda de la plantilla).
create or replace function pg_temp.visible_107() returns void language plpgsql as $$
begin
  alter table productions disable trigger user;
  update productions set estado = 'publicada' where id = 't107_obra';
  alter table productions enable trigger user;
end $$;
select pg_temp.visible_107();

-- T2: el público no ve el elenco sin publicar (ni la ficha de la persona); sí al creativo.
do $$ declare n int; m int; begin
  set local role anon;
  select count(*) into n from production_credits where production_id = 't107_obra';
  select count(*) into m from people where id in ('00000000-0000-0000-0000-00000000e701', '00000000-0000-0000-0000-00000000e702');
  reset role;
  if n <> 1 then raise exception 'FALLO T2: el público ve % créditos', n; end if;
  if m <> 0 then raise exception 'FALLO T2: el público ve % fichas del elenco', m; end if;
end $$;

-- T3: al publicar a una persona sale ella sola; los créditos del perfil público también.
do $$ declare n int; begin
  update production_credits set publicado = true where production_id = 't107_obra' and person_id = '00000000-0000-0000-0000-00000000e701';
  set local role anon;
  select count(*) into n from production_credits where production_id = 't107_obra';
  reset role;
  if n <> 2 then raise exception 'FALLO T3: el público ve % créditos', n; end if;
  if (select count(*) from production_credits c where c.production_id = 't107_obra' and c.publicado) <> 2 then raise exception 'FALLO T3'; end if;
end $$;

-- T4: despublicar la vuelve a ocultar.
do $$ declare n int; begin
  update production_credits set publicado = false where production_id = 't107_obra' and person_id = '00000000-0000-0000-0000-00000000e701';
  set local role anon;
  select count(*) into n from production_credits where production_id = 't107_obra';
  reset role;
  if n <> 1 then raise exception 'FALLO T4: %', n; end if;
end $$;

-- T5: cambiar otra cosa (papel, orden) no publica.
do $$ begin
  update production_credits set papel = 'Brady Mitchell', orden = 3 where production_id = 't107_obra' and person_id = '00000000-0000-0000-0000-00000000e701';
  if (select publicado from production_credits where production_id = 't107_obra' and person_id = '00000000-0000-0000-0000-00000000e701') then
    raise exception 'FALLO T5';
  end if;
end $$;
