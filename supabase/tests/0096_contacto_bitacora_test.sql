-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0096 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't96_admin@test.local'),
       ('00000000-0000-0000-0000-0000000009f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't96_staff@test.local'),
       ('00000000-0000-0000-0000-0000000009f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't96_fan@test.local');
update profiles set rol = 'admin', nombre = 'Dire 96' where id = '00000000-0000-0000-0000-0000000009f1';
update profiles set rol = 'staff', nombre = 'Staff 96' where id = '00000000-0000-0000-0000-0000000009f2';

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
create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
with x as (
  insert into contact_messages (nombre, correo, telefono, asunto, mensaje)
  values ('Ana 96', 'ana96@test.local', '4421234567', 'Boletos', 'Hola, ¿hay funciones en enero?') returning id)
insert into ctx select 'm', id from x;

-- T1: un fan no puede asignar, responder ni ver el equipo.
do $$ declare m uuid := (select v from ctx where k = 'm'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f3');
  begin perform contact_asignar(m, '00000000-0000-0000-0000-0000000009f2'); raise exception 'FALLO T1: asignó'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform contact_responder(m, 'correo', null); raise exception 'FALLO T1: respondió'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform contact_equipo(); raise exception 'FALLO T1: vio el equipo'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T2: el Director asigna al staff (le llega un aviso) y no se puede asignar a un fan.
do $$ declare m uuid := (select v from ctx where k = 'm'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f1');
  if (select count(*) from contact_equipo() where nombre in ('Dire 96', 'Staff 96')) <> 2 then raise exception 'FALLO T2: equipo'; end if;
  begin perform contact_asignar(m, '00000000-0000-0000-0000-0000000009f3'); raise exception 'FALLO T2: asignó a un fan';
  exception when others then if sqlerrm not like 'Esa persona no atiende Contacto%' then raise exception 'FALLO T2: %', sqlerrm; end if; end;
  perform contact_asignar(m, '00000000-0000-0000-0000-0000000009f2');
  perform contact_asignar(m, '00000000-0000-0000-0000-0000000009f2'); -- repetir no avisa otra vez
  perform pg_temp.as_root();
  if (select asignado_a from contact_messages where id = m) <> '00000000-0000-0000-0000-0000000009f2' then raise exception 'FALLO T2: no se asignó'; end if;
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000009f2' and titulo = 'Te asignaron un mensaje de contacto') <> 1 then raise exception 'FALLO T2: aviso'; end if;
end $$;

-- T3: el staff responde por WhatsApp con nota: queda quién, canal y leído; reabrir lo quita.
do $$ declare m uuid := (select v from ctx where k = 'm'); r contact_messages%rowtype; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f2');
  begin perform contact_responder(m, 'paloma', null); raise exception 'FALLO T3: canal raro';
  exception when others then if sqlerrm not like 'Elige por dónde%' then raise exception 'FALLO T3: %', sqlerrm; end if; end;
  perform contact_responder(m, 'whatsapp', '  Le mandé las fechas  ');
  perform pg_temp.as_root();
  select * into r from contact_messages where id = m;
  if r.respondido_por <> '00000000-0000-0000-0000-0000000009f2' or r.respuesta_canal <> 'whatsapp' or r.respuesta_nota <> 'Le mandé las fechas' or not r.leido then
    raise exception 'FALLO T3: %', row_to_json(r);
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f2');
  perform contact_reabrir(m);
  perform pg_temp.as_root();
  if (select respondido_at from contact_messages where id = m) is not null then raise exception 'FALLO T3: reabrir'; end if;
end $$;

-- T4: la bitácora registra los cambios sin el correo ni el mensaje.
do $$ begin
  if (select count(*) from audit_log where tabla = 'contact_messages') < 3 then raise exception 'FALLO T4: sin bitácora'; end if;
  if exists (select 1 from audit_log where tabla = 'contact_messages'
              and (coalesce(antes::text, '') || coalesce(despues::text, '')) ~ '(ana96|enero|Ana 96)') then raise exception 'FALLO T4: datos personales'; end if;
end $$;

-- T5: audit_actores solo para el Director e incluye a quien hizo cambios.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f2');
  begin perform audit_actores(); raise exception 'FALLO T5: staff vio actores';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009f1');
  if not exists (select 1 from audit_actores() where nombre = 'Staff 96') then raise exception 'FALLO T5: falta actor'; end if;
  perform pg_temp.as_root();
end $$;

select 'OK 0096';
