-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0135 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000135a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't135_admin@test.local'),
  ('00000000-0000-0000-0000-000000135a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't135_vocal@test.local'),
  ('00000000-0000-0000-0000-000000135a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't135_cualquiera@test.local'),
  ('00000000-0000-0000-0000-000000135a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't135_coreo@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000135a01';
update profiles set nombre = 'Vale Vocal' where id = '00000000-0000-0000-0000-000000135a02';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', (select email from auth.users where id = uid::uuid))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t135_obra', 'Obra 135', 'borrador');

do $$
declare adm text := '00000000-0000-0000-0000-000000135a01'; vocal text := '00000000-0000-0000-0000-000000135a02';
        otro text := '00000000-0000-0000-0000-000000135a03'; coreo text := '00000000-0000-0000-0000-000000135a04';
        j jsonb; p1 uuid; p2 uuid; p3 uuid; ok boolean; inv production_invites; per uuid; r jsonb;
begin
  -- T1: fechas tentativas solo por mes y en orden.
  begin update productions set tentativa_desde = '2027-03-15' where id = 't135_obra'; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T1a'; end if;
  begin update productions set tentativa_desde = '2027-04-01', tentativa_hasta = '2027-03-01' where id = 't135_obra'; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T1b'; end if;
  update productions set tentativa_desde = '2027-03-01', tentativa_hasta = '2027-04-01', asistente_paso = 3 where id = 't135_obra';

  -- T2: personaje completo y grupo de ensamble con cupo; valores raros no entran.
  insert into production_characters (production_id, nombre, categoria, genero, edad_min, edad_max, tesituras, canto, baile, habilidades, rasgos)
    values ('t135_obra', 'Lela', 'protagonista', 'mujer', 16, 22, '{soprano,mezzosoprano}', 'fuerte', 'fuerte', '{Acrobacia}', 'Pelirroja');
  insert into production_characters (production_id, nombre, categoria, cupo, genero, baile, habilidades)
    values ('t135_obra', 'Porristas', 'ensamble', 6, 'mujer', 'fuerte', '{Acrobacia,"Danza aérea"}');
  begin insert into production_characters (production_id, nombre, tesituras) values ('t135_obra', 'X', '{silbato}'); ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T2'; end if;

  -- T3: alguien sin permisos no arma el equipo.
  perform pg_temp.as_user(otro);
  begin perform production_puesto_guardar('t135_obra', null, 'Dirección vocal', 'creativo', '{juez}'); ok := false; exception when others then ok := true; end;
  perform pg_temp.reset();
  if not ok then raise exception 'FALLO T3'; end if;

  -- T4: puesto con cuenta → rol en la obra y crédito con su nombre.
  perform pg_temp.as_user(adm);
  j := production_puesto_guardar('t135_obra', null, 'Dirección vocal', 'creativo', '{juez,asistente}', vocal::uuid);
  p1 := (j->>'id')::uuid;
  perform pg_temp.reset();
  if (select count(*) from production_members where production_id = 't135_obra' and user_id = vocal::uuid) <> 2 then raise exception 'FALLO T4a'; end if;
  if not exists (select 1 from production_credits c join people pe on pe.id = c.person_id
                  where c.production_id = 't135_obra' and c.papel = 'Dirección vocal' and c.tipo = 'creativo' and pe.profile_id = vocal::uuid) then
    raise exception 'FALLO T4b';
  end if;

  -- T5: hueco (sin nadie) y con nombre + correo sin cuenta → invitación y crédito con la ficha nueva.
  perform pg_temp.as_user(adm);
  j := production_puesto_guardar('t135_obra', null, 'Stage manager', 'produccion', '{staff}');
  p2 := (j->>'id')::uuid;
  j := production_puesto_guardar('t135_obra', null, 'Coreografía', 'creativo', '{juez}', null, 'Coco Reyes', 'Coco@Nuevo.test');
  p3 := (j->>'id')::uuid;
  perform pg_temp.reset();
  if (select person_id is not null or credit_id is not null from production_puestos where id = p2) then raise exception 'FALLO T5a'; end if;
  if j->>'token' is null or (select email from production_puestos where id = p3) <> 'coco@nuevo.test' then raise exception 'FALLO T5b: %', j; end if;
  select * into inv from production_invites where id = (select invite_id from production_puestos where id = p3);
  if inv.email <> 'coco@nuevo.test' or inv.roles <> '{juez}' then raise exception 'FALLO T5c'; end if;
  select person_id into per from production_puestos where id = p3;

  -- T6: al aceptar la invitación, el puesto y la ficha quedan ligados a la cuenta.
  update production_invites set aceptada_at = now(), aceptada_por = coreo::uuid where id = inv.id;
  if (select user_id from production_puestos where id = p3) <> coreo::uuid or (select profile_id from people where id = per) <> coreo::uuid then
    raise exception 'FALLO T6';
  end if;

  -- T7: cambiar quién ocupa "Dirección vocal" quita los roles a la anterior y pasa el crédito.
  perform pg_temp.as_user(adm);
  perform production_puesto_guardar('t135_obra', p1, 'Dirección vocal', 'creativo', '{juez}', null, 'Otra Persona');
  perform pg_temp.reset();
  if exists (select 1 from production_members where production_id = 't135_obra' and user_id = vocal::uuid) then raise exception 'FALLO T7a'; end if;
  if (select pe.nombre from production_puestos p join production_credits c on c.id = p.credit_id join people pe on pe.id = c.person_id where p.id = p1) <> 'Otra Persona' then
    raise exception 'FALLO T7b';
  end if;

  -- T8: borrar un puesto quita su crédito.
  perform pg_temp.as_user(adm);
  perform production_puesto_borrar(p1);
  perform pg_temp.reset();
  if exists (select 1 from production_credits where production_id = 't135_obra' and papel = 'Dirección vocal') then raise exception 'FALLO T8'; end if;

  -- T9: hitos y lugares.
  insert into production_hitos (production_id, nombre, mes) values ('t135_obra', 'Estreno', '2027-03-01');
  insert into production_lugares (production_id, tipo, nombre, mapa_url) values ('t135_obra', 'teatro', 'Teatro X', 'https://maps.app/x');

  -- T9b: la convocatoria trae la ficha del personaje; la persona guarda su perfil y el juez lo ve junto a la ficha.
  declare aid2 uuid; rid uuid; app2 uuid; fj json;
  begin
    insert into auditions (production_id, titulo, estado) values ('t135_obra', 'Aud fichas', 'abierta') returning id into aid2;
    insert into audition_roles (audition_id, nombre, character_id, orden)
      select aid2, nombre, id, 1 from production_characters where production_id = 't135_obra' and nombre = 'Lela' returning id into rid;
    fj := audition_fichas(aid2);
    if fj->0->>'nombre' <> 'Lela' or fj->0->'tesituras'->>0 <> 'soprano' or fj->0->>'rasgos' <> 'Pelirroja' then raise exception 'FALLO T9b-a: %', fj; end if;
    insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, roles)
      values (aid2, coreo::uuid, 'Coco', '2005-01-01', '554', array[rid]) returning id into app2;
    perform pg_temp.as_user(otro);
    begin perform audition_perfil_guardar(app2, 'mezzosoprano', 'fuerte', 'basico', 'mujer', '{Acrobacia}'); ok := false; exception when others then ok := true; end;
    perform pg_temp.as_user(coreo);
    perform audition_perfil_guardar(app2, 'mezzosoprano', 'fuerte', 'basico', 'mujer', '{Acrobacia, ""}');
    perform pg_temp.reset();
    if not ok then raise exception 'FALLO T9b-b: otra persona cambió el perfil'; end if;
    if (select perfil_tesitura <> 'mezzosoprano' or perfil_habilidades <> '{Acrobacia}' from audition_applications where id = app2) then raise exception 'FALLO T9b-c'; end if;
    fj := _audition_juez_persona(aid2, app2, 1, now());
    if fj->'fichas'->0->>'baile' <> 'fuerte' or fj->'perfil'->>'baile' <> 'basico' then raise exception 'FALLO T9b-d: %', fj; end if;
  end;

  -- T10: borrar la obra: sin Casa DARF no; con el nombre mal no; con el nombre bien se va todo (con audición con inscritos).
  insert into auditions (production_id, titulo, estado) values ('t135_obra', 'Aud 135', 'abierta');
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono)
    select id, otro::uuid, 'Alguien', '2000-01-01', '551' from auditions where production_id = 't135_obra';
  perform pg_temp.as_user(otro);
  begin perform panel_borrar_produccion('t135_obra', 'Obra 135'); ok := false; exception when others then ok := true; end;
  perform pg_temp.reset();
  if not ok then raise exception 'FALLO T10a'; end if;
  perform pg_temp.as_user(adm);
  begin perform panel_borrar_produccion('t135_obra', 'Obra 13'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T10b'; end if;
  r := panel_borrar_produccion('t135_obra', ' obra 135 ');
  perform pg_temp.reset();
  if exists (select 1 from productions where id = 't135_obra') or exists (select 1 from production_puestos where production_id = 't135_obra')
     or (r->>'solicitudes')::int <> 3 then
    raise exception 'FALLO T10c: %', r;
  end if;
  if not exists (select 1 from people where id = per) then raise exception 'FALLO T10d: la ficha de la persona se debe conservar'; end if;

  raise notice '0135 OK';
end $$;
