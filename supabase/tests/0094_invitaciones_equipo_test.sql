-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0094 aplicadas.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't94_admin@test.local', now()),
       ('00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't94_staff@test.local', now()),
       ('00000000-0000-0000-0000-0000000009d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't94_otro@test.local', now());
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000009d1';

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

-- T1: sin permisos.gestionar no se invita.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d3');
  begin
    perform panel_invite_member('showman', 'nuevo94@test.local', array['taquilla']);
    raise exception 'FALLO T1: invitó sin permiso';
  exception when others then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T1: %', sqlerrm; end if;
  end;
  perform pg_temp.as_root();
end $$;

-- T2: correo con cuenta → se agrega directo, con aviso de bienvenida único (dos roles = un aviso).
do $$ declare j jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d1');
  j := panel_invite_member('showman', ' T94_Staff@test.local ', array['taquilla', 'puerta']);
  perform pg_temp.as_root();
  if j->>'tipo' <> 'agregado' or (j->>'nuevos')::int <> 2 then raise exception 'FALLO T2: %', j; end if;
  if (select count(*) from production_members where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000009d2') <> 2 then raise exception 'FALLO T2: roles'; end if;
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000009d2' and titulo like 'Te sumaron al equipo%') <> 1 then raise exception 'FALLO T2: aviso'; end if;
  if (select href from notifications where user_id = '00000000-0000-0000-0000-0000000009d2' and titulo like 'Te sumaron%') <> '/panel/producciones/showman/guia' then raise exception 'FALLO T2: liga'; end if;
end $$;

-- T3: sin cuenta → invitación; volver a invitar la renueva y suma roles (no duplica).
do $$ declare j jsonb; j2 jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d1');
  j := panel_invite_member('showman', 'Nuevo94@test.local', array['taquilla']);
  j2 := panel_invite_member('showman', 'nuevo94@test.local', array['contenido']);
  perform pg_temp.as_root();
  if j->>'tipo' <> 'invitacion' or j2->>'token' <> j->>'token' then raise exception 'FALLO T3: % %', j, j2; end if;
  if (select roles from production_invites where token = j->>'token') <> array['contenido', 'taquilla'] then raise exception 'FALLO T3: roles'; end if;
  if (invite_info(j->>'token'))->>'estado' <> 'abierta' or (invite_info(j->>'token'))->>'obra' is null then raise exception 'FALLO T3: info'; end if;
  insert into ctx values ('tok', j->>'token');
end $$;

-- T4: la liga con otra cuenta no sirve; al crear la cuenta sin confirmar no entra; al confirmar sí.
do $$ declare tok text := (select v from ctx where k = 'tok'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d3');
  begin
    perform invite_accept(tok);
    raise exception 'FALLO T4: aceptó con otro correo';
  exception when others then
    if sqlerrm not like 'Esta invitación es para otro correo%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
  perform pg_temp.as_root();
  insert into auth.users (id, instance_id, aud, role, email)
  values ('00000000-0000-0000-0000-0000000009d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo94@test.local');
  if exists (select 1 from production_members where user_id = '00000000-0000-0000-0000-0000000009d4') then raise exception 'FALLO T4: entró sin confirmar'; end if;
  update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000009d4';
  if (select count(*) from production_members where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000009d4') <> 2 then raise exception 'FALLO T4: no entró'; end if;
  if (select aceptada_por from production_invites where token = tok) <> '00000000-0000-0000-0000-0000000009d4' then raise exception 'FALLO T4: no se marcó'; end if;
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000009d4' and titulo like 'Te sumaron al equipo%') <> 1 then raise exception 'FALLO T4: aviso'; end if;
  -- Abrir la liga después ya no falla (le dice a qué obra entrar).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d4');
  if invite_accept(tok) <> 'showman' then raise exception 'FALLO T4: reabrir'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: cancelada no sirve; quien no gestiona no ve las invitaciones.
do $$ declare j jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d1');
  j := panel_invite_member('showman', 'cancelar94@test.local', array['staff']);
  perform panel_invite_update((j->>'id')::uuid, 'cancelar');
  perform pg_temp.as_root();
  if (invite_info(j->>'token'))->>'estado' <> 'cancelada' then raise exception 'FALLO T5: estado'; end if;
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values ('00000000-0000-0000-0000-0000000009d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cancelar94@test.local', now());
  if exists (select 1 from production_members where user_id = '00000000-0000-0000-0000-0000000009d5') then raise exception 'FALLO T5: entró con cancelada'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009d3');
  if (select count(*) from production_invites) <> 0 then raise exception 'FALLO T5: ve invitaciones'; end if;
  perform pg_temp.as_root();
end $$;

-- T6: la bitácora guarda la invitación sin el token ni el correo.
do $$ begin
  if exists (select 1 from audit_log where tabla = 'production_invites' and (coalesce(antes::text, '') || coalesce(despues::text, '')) like '%nuevo94%') then
    raise exception 'FALLO T6: correo en la bitácora';
  end if;
end $$;

select 'OK 0094';
