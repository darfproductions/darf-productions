-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0081: eventos (por función, presenciales, en línea) para Club Fan, con cuenta o públicos; avisos y recordatorios.
-- Requiere 0080 ya aplicada. Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


alter table fan_encuentros drop constraint fan_encuentros_tipo_ok;
alter table fan_encuentros drop constraint fan_encuentros_tipo_check;
alter table fan_encuentros drop constraint fan_encuentros_cupo_check;
drop index fan_encuentros_foto_funcion;

alter table fan_encuentros
  alter column production_id drop not null,
  alter column cupo drop not null,
  add column categoria text check (char_length(categoria) <= 60),
  add column acceso text not null default 'club' check (acceso in ('club', 'cuenta', 'publico')),
  add column liga text check (liga is null or (liga ~ '^https://' and char_length(liga) <= 500)),
  add column termina timestamptz,
  add column recordado_at timestamptz;

update fan_encuentros set categoria = 'Foto con el elenco' where tipo = 'foto';
update fan_encuentros set tipo = case tipo when 'foto' then 'funcion' when 'evento' then 'presencial' else tipo end;

alter table fan_encuentros
  alter column tipo set default 'funcion',
  add constraint fan_encuentros_tipo_check check (tipo in ('funcion', 'presencial', 'en_linea')),
  add constraint fan_encuentros_cupo_check check (cupo is null or cupo between 1 and 5000),
  add constraint fan_encuentros_tipo_ok check (
    (tipo = 'funcion' and performance_id is not null and production_id is not null)
    or (tipo = 'presencial' and inicia is not null and nullif(btrim(titulo), '') is not null)
    or (tipo = 'en_linea' and inicia is not null and nullif(btrim(titulo), '') is not null and liga is not null)),
  add constraint fan_encuentros_termina_ok check (termina is null or inicia is null or termina > inicia);

create table evento_recordatorios (
  encuentro_id uuid not null references fan_encuentros(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (encuentro_id, user_id)
);
alter table evento_recordatorios enable row level security;
create policy evento_recordatorios_own on evento_recordatorios for select to authenticated using (user_id = auth.uid());

create or replace function evento_editor(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when pid is null then is_admin() else has_perm(pid, 'fanzone.editar') end
$$;
revoke execute on function evento_editor(text) from public, anon;
grant execute on function evento_editor(text) to authenticated;

create or replace function evento_cuando(e fan_encuentros) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select starts_at from performances where id = e.performance_id), e.inicia)
$$;
create or replace function evento_fin(e fan_encuentros) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(e.termina, evento_cuando(e) + interval '3 hours')
$$;
create or replace function evento_puede_ver(e fan_encuentros) returns boolean
language sql stable security definer set search_path = public as $$
  select (e.production_id is null or production_is_visible(e.production_id))
     and case e.acceso when 'publico' then true when 'cuenta' then auth.uid() is not null else is_fan_member() end
$$;
create or replace function evento_nombre(e fan_encuentros) returns text
language sql immutable as $$
  select coalesce(nullif(btrim(e.titulo), ''), nullif(btrim(e.categoria), ''), case when e.tipo = 'funcion' then 'Foto con el elenco' else 'Evento' end)
$$;
revoke execute on function evento_cuando(fan_encuentros), evento_fin(fan_encuentros), evento_puede_ver(fan_encuentros) from public, anon, authenticated;

drop policy fan_encuentros_editor on fan_encuentros;
create policy fan_encuentros_editor on fan_encuentros for all to authenticated
  using (evento_editor(production_id)) with check (evento_editor(production_id));
drop policy fan_encuentro_lugares_editor on fan_encuentro_lugares;
create policy fan_encuentro_lugares_editor on fan_encuentro_lugares for select to authenticated
  using (exists (select 1 from fan_encuentros e where e.id = encuentro_id and evento_editor(e.production_id)));

drop function fan_encuentros_lista(text);
create function fan_encuentros_lista(pid text default null)
returns table (id uuid, production_id text, obra text, performance_id uuid, tipo text, categoria text, titulo text, descripcion text,
               lugar text, starts_at timestamptz, termina timestamptz, venue text, cupo int, libres int, abierto boolean, notas text,
               requiere_registro boolean, requiere_boleto boolean, acceso text, apartado boolean, con_boleto boolean,
               recordar boolean, en_vivo boolean, liga text)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, pr.nombre, e.performance_id, e.tipo, e.categoria, evento_nombre(e), e.descripcion,
         e.lugar, evento_cuando(e), evento_fin(e), coalesce(e.lugar, pf.venue, pr.venue), e.cupo,
         case when e.cupo is null then null else greatest(0, e.cupo - (select count(*) from fan_encuentro_lugares l where l.encuentro_id = e.id))::int end,
         e.abierto, e.notas, e.requiere_registro, e.requiere_boleto, e.acceso,
         exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()),
         not e.requiere_boleto or e.performance_id is null
           or exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado'),
         exists (select 1 from evento_recordatorios r where r.encuentro_id = e.id and r.user_id = auth.uid()),
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e),
         case when e.tipo = 'en_linea' and now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e)
                   and (not e.requiere_registro or exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()))
              then e.liga end
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
   where evento_puede_ver(e)
     and evento_fin(e) > now()
     and (pid is null or e.production_id = pid)
   order by evento_cuando(e)
$$;
revoke execute on function fan_encuentros_lista(text) from public;
grant execute on function fan_encuentros_lista(text) to anon, authenticated;

create or replace function fan_encuentro_apartar(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; usados int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para apartar tu lugar.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Este evento no existe.'; end if;
  if not evento_puede_ver(e) then
    if e.acceso = 'club' then raise exception 'Únete al Club Fan para apartar tu lugar.'; end if;
    raise exception 'Este evento no existe.';
  end if;
  if not p_on then
    delete from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid() and llegada_at is null;
    return;
  end if;
  if not e.requiere_registro then raise exception 'Este evento no necesita registro.'; end if;
  if evento_cuando(e) <= now() then raise exception 'Este evento ya empezó.'; end if;
  if not e.abierto then raise exception 'El registro para este evento está cerrado.'; end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado') then
    raise exception 'Necesitas un boleto aprobado para esta función.';
  end if;
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return; end if;
  if e.cupo is not null then
    select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
    if usados >= e.cupo then raise exception 'Ya no hay lugares para este evento.'; end if;
  end if;
  insert into fan_encuentro_lugares (encuentro_id, user_id) values (eid, auth.uid());
end $$;

create or replace function evento_recordar(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para activar el recordatorio.'; end if;
  select * into e from fan_encuentros where id = eid;
  if not found or not evento_puede_ver(e) then raise exception 'Este evento no existe.'; end if;
  if p_on then insert into evento_recordatorios (encuentro_id, user_id) values (eid, auth.uid()) on conflict do nothing;
  else delete from evento_recordatorios where encuentro_id = eid and user_id = auth.uid(); end if;
end $$;
revoke execute on function evento_recordar(uuid, boolean) from public, anon;
grant execute on function evento_recordar(uuid, boolean) to authenticated;

create or replace function evento_entrar(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros;
begin
  select * into e from fan_encuentros where id = eid;
  if not found or e.tipo <> 'en_linea' or not evento_puede_ver(e) then return null; end if;
  if now() not between evento_cuando(e) - interval '15 minutes' and evento_fin(e) then return null; end if;
  if e.requiere_registro and not exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return null; end if;
  if auth.uid() is not null then
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at) values (eid, auth.uid(), now())
    on conflict (encuentro_id, user_id) do update set llegada_at = coalesce(fan_encuentro_lugares.llegada_at, now());
  end if;
  return e.liga;
end $$;
revoke execute on function evento_entrar(uuid) from public;
grant execute on function evento_entrar(uuid) to anon, authenticated;

drop function fan_encuentro_personas(uuid);
create function fan_encuentro_personas(eid uuid)
returns table (user_id uuid, nombre text, telefono text, numero int, created_at timestamptz, llegada_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, coalesce(p.nombre, ''), p.telefono, m.numero, l.created_at, l.llegada_at
    from fan_encuentro_lugares l
    join fan_encuentros e on e.id = l.encuentro_id
    left join profiles p on p.id = l.user_id
    left join fan_members m on m.user_id = l.user_id
   where l.encuentro_id = eid and (evento_editor(e.production_id) or (e.production_id is not null and has_perm(e.production_id, 'puerta.validar')))
   order by l.llegada_at nulls last, l.created_at
$$;
revoke execute on function fan_encuentro_personas(uuid) from public, anon;
grant execute on function fan_encuentro_personas(uuid) to authenticated;

create or replace function evento_marcar(eid uuid, uid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros;
begin
  select * into e from fan_encuentros where id = eid;
  if not found then raise exception 'Este evento no existe.'; end if;
  if not (evento_editor(e.production_id) or (e.production_id is not null and has_perm(e.production_id, 'puerta.validar'))) then
    raise exception 'No tienes permiso en este evento.';
  end if;
  update fan_encuentro_lugares set llegada_at = case when p_on then coalesce(llegada_at, now()) end,
         marcado_por = case when p_on then auth.uid() end
   where encuentro_id = eid and user_id = uid;
end $$;
revoke execute on function evento_marcar(uuid, uuid, boolean) from public, anon;
grant execute on function evento_marcar(uuid, uuid, boolean) to authenticated;

create or replace function fan_checkin(eid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; entrada text; m fan_members; l fan_encuentro_lugares; nombre text; foto text; usados int; base json;
begin
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Ese evento no existe.'; end if;
  if not (evento_editor(e.production_id) or (e.production_id is not null and has_perm(e.production_id, 'puerta.validar'))) then
    raise exception 'No tienes permiso para validar credenciales en este evento.';
  end if;
  if e.tipo = 'en_linea' then raise exception 'Este evento es en línea: no se valida en una entrada.'; end if;
  entrada := btrim(coalesce(p_code, ''));
  if entrada ~ '/f/' then entrada := split_part(split_part(entrada, '/f/', 2), '?', 1); end if;
  if upper(entrada) ~ '^FAN-[2-9A-HJ-NP-Z]{4}$' then
    select * into m from fan_members where codigo = upper(entrada);
  else
    select * into m from fan_members where token = entrada;
  end if;
  if not found then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = m.user_id;
  base := json_build_object('user_id', m.user_id, 'nombre', nombre, 'foto_path', foto, 'numero', m.numero, 'fundador', m.numero <= 100);
  select * into l from fan_encuentro_lugares where encuentro_id = eid and user_id = m.user_id;
  if found and l.llegada_at is not null then
    return (base::jsonb || jsonb_build_object('resultado', 'ya', 'llegada', l.llegada_at))::json;
  end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = m.user_id and o.status = 'aprobado') then
    return (base::jsonb || jsonb_build_object('resultado', 'sin_boleto'))::json;
  end if;
  if l.user_id is null then
    if e.requiere_registro then return (base::jsonb || jsonb_build_object('resultado', 'sin_lugar'))::json; end if;
    if e.cupo is not null then
      select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
      if usados >= e.cupo then return (base::jsonb || jsonb_build_object('resultado', 'lleno'))::json; end if;
    end if;
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at, marcado_por) values (eid, m.user_id, now(), auth.uid());
  else
    update fan_encuentro_lugares set llegada_at = now(), marcado_por = auth.uid() where encuentro_id = eid and user_id = m.user_id;
  end if;
  return (base::jsonb || jsonb_build_object('resultado', 'ok', 'llegada', now()))::json;
end $$;

create or replace function notify_evento_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare cuando timestamptz := evento_cuando(new);
begin
  if new.production_id is not null and not production_is_visible(new.production_id) then return new; end if;
  if cuando is null or cuando <= now() then return new; end if;
  perform notify(array(select user_id from fan_members), 'fanzone',
    'Nuevo evento: ' || evento_nombre(new),
    initcap(cuando_mx(cuando)) || ' a las ' || to_char(cuando at time zone 'America/Mexico_City', 'HH24:MI')
      || case new.tipo when 'en_linea' then ' · en línea' else coalesce(' · ' || new.lugar, '') end
      || case when new.production_id is not null then ' · ' || production_name(new.production_id) else '' end,
    '/eventos', new.production_id);
  return new;
end $$;
create trigger fan_encuentros_aviso after insert on fan_encuentros for each row execute function notify_evento_nuevo();

create or replace function notify_eventos_proximos() returns int
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; n int := 0; cuando timestamptz;
begin
  for e in select * from fan_encuentros where recordado_at is null for update skip locked loop
    cuando := evento_cuando(e);
    continue when cuando is null or cuando <= now() or cuando > now() + interval '1 hour';
    perform notify(array(select user_id from fan_encuentro_lugares where encuentro_id = e.id
                         union select user_id from evento_recordatorios where encuentro_id = e.id),
      'fanzone', 'En una hora: ' || evento_nombre(e),
      'Empieza a las ' || to_char(cuando at time zone 'America/Mexico_City', 'HH24:MI')
        || case e.tipo when 'en_linea' then '. La liga para entrar aparece 15 minutos antes.' else '. Lleva tu credencial del Club Fan.' end,
      '/eventos', e.production_id);
    update fan_encuentros set recordado_at = now() where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function notify_evento_nuevo(), notify_eventos_proximos() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_eventos';
    perform cron.schedule('darf_eventos', '*/15 * * * *', 'select public.notify_eventos_proximos()');
  end if;
end $$;

commit;
