-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029 aplicada y supabase/dev/seed_0029_producciones.sql cargado.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- Obra borrador con un crédito, para probar visibilidad.
insert into productions (id, nombre) values ('t_borr', 'Borrador');
insert into people (id, nombre) values ('00000000-0000-0000-0000-00000000b001', 'Persona Secreta');
insert into production_credits (production_id, person_id, tipo, papel) values ('t_borr', '00000000-0000-0000-0000-00000000b001', 'creativo', 'Dirección');

-- T1: el público solo ve obras publicadas/archivadas y su contenido
do $$ declare n int; begin
  perform pg_temp.as_anon();
  select count(*) into n from productions where id = 't_borr';
  if n <> 0 then raise exception 'FALLO T1: anon ve un borrador'; end if;
  select count(*) into n from production_credits where production_id = 't_borr';
  if n <> 0 then raise exception 'FALLO T1: anon ve créditos de un borrador'; end if;
  select count(*) into n from people where nombre = 'Persona Secreta';
  if n <> 0 then raise exception 'FALLO T1: anon ve personas de un borrador'; end if;
  select count(*) into n from productions where id in ('showman', 'mm', 'hsm');
  if n <> 3 then raise exception 'FALLO T1: anon no ve las 3 obras (%)', n; end if;
  select count(*) into n from production_credits where production_id = 'mm';
  if n = 0 then raise exception 'FALLO T1: anon no ve créditos de mm'; end if;
  reset role;
end $$;

-- T2: el vínculo persona ↔ cuenta no es público
do $$ begin
  perform pg_temp.as_anon();
  begin
    perform profile_id from people limit 1;
    raise exception 'FALLO T2: anon lee profile_id';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- T3: no se publica sin kit completo
do $$ begin
  begin
    update productions set estado = 'publicada' where id = 't_borr';
    raise exception 'FALLO T3: se publicó sin kit';
  exception when raise_exception then
    if sqlerrm not like 'No se puede publicar%Falta el logo%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
end $$;

-- T4: no se publica con colores ilegibles
do $$ begin
  update productions set logo_path = 'x/logo.webp', ambiente_path = 'x/amb.jpg', frase = 'Frase',
    color_fondo = '#101010', color_superficie = '#202020', color_texto = '#333333', color_acento = '#ffcc00'
  where id = 't_borr';
  begin
    update productions set estado = 'publicada' where id = 't_borr';
    raise exception 'FALLO T4: se publicó con texto ilegible';
  exception when raise_exception then
    if sqlerrm not like '%El texto no se lee sobre el fondo%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
  -- Fondo claro sí se permite (cada obra elige su fondo).
  update productions set color_fondo = '#f8f7f5', color_superficie = '#ffffff', color_texto = '#13235c', color_acento = '#c2255c',
    estado = 'publicada' where id = 't_borr';
  if (select publicada_at from productions where id = 't_borr') is null then raise exception 'FALLO T4: sin publicada_at'; end if;
end $$;

-- T5: archivada ⇔ concluded, en ambos sentidos
do $$ begin
  update productions set concluded = true where id = 't_borr';
  if (select estado from productions where id = 't_borr') <> 'archivada' then raise exception 'FALLO T5a'; end if;
  update productions set concluded = false where id = 't_borr';
  if (select estado from productions where id = 't_borr') <> 'publicada' then raise exception 'FALLO T5b'; end if;
  update productions set estado = 'archivada' where id = 't_borr';
  if not (select concluded from productions where id = 't_borr') then raise exception 'FALLO T5c'; end if;
end $$;

-- T6: solo una obra publicada puede estar en venta
do $$ begin
  update productions set estado = 'borrador' where id = 't_borr';
  begin
    update productions set on_sale = true where id = 't_borr';
    raise exception 'FALLO T6: borrador en venta';
  exception when raise_exception then
    if sqlerrm not like 'Solo una producción publicada%' then raise exception 'FALLO T6: %', sqlerrm; end if;
  end;
end $$;

-- T7: ensayos solo con cuenta; videos públicos
do $$ declare n int; begin
  perform pg_temp.as_anon();
  select count(*) into n from production_media where tipo = 'ensayo';
  if n <> 0 then raise exception 'FALLO T7: anon ve ensayos'; end if;
  select count(*) into n from production_media where tipo = 'video';
  if n = 0 then raise exception 'FALLO T7: anon no ve videos'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from production_media where tipo = 'ensayo';
  if n = 0 then raise exception 'FALLO T7: fan no ve ensayos'; end if;
  reset role;
end $$;

-- T8: un fan no escribe; un admin sí
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    insert into production_thanks (production_id, texto) values ('mm', 'hack');
    raise exception 'FALLO T8: fan escribió';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T8: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into production_thanks (production_id, texto) values ('mm', 'ok admin');
  reset role;
end $$;

-- T9: numeración continua de HSM (Acto I = 1–7, Acto II = 8–12)
do $$ declare n int; begin
  select count(*) into n from production_songs s join production_acts a on a.id = s.act_id
   where s.production_id = 'hsm' and a.nombre = 'Acto I';
  if n <> 7 then raise exception 'FALLO T9: Acto I de HSM tiene % canciones', n; end if;
end $$;

do $$ begin raise exception 'OK: 0029 pruebas T1–T9 (se aborta a propósito para no persistir)'; end $$;
