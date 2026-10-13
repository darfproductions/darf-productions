-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0094: invitaciones al equipo (liga y correo), aviso de bienvenida y guía de tu rol. Requiere 0093.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create table if not exists production_invites (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  roles text[] not null check (cardinality(roles) between 1 and 20),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invitado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expira_at timestamptz not null default now() + interval '30 days',
  aceptada_at timestamptz,
  aceptada_por uuid references auth.users(id) on delete set null,
  cancelada_at timestamptz,
  enviado_at timestamptz,
  envio_error text check (length(envio_error) <= 300)
);
create unique index if not exists uq_production_invite_abierta on production_invites(production_id, email)
  where aceptada_at is null and cancelada_at is null;

alter table production_invites enable row level security;
drop policy if exists production_invites_gestion on production_invites;
create policy production_invites_gestion on production_invites for select to authenticated
  using (has_perm(production_id, 'permisos.gestionar'));
revoke all on production_invites from anon, authenticated;
grant select on production_invites to authenticated;
create or replace function _audit_resumen(t text, o jsonb, n jsonb) returns jsonb
language sql immutable as $$
  select case when t in ('member_measures', 'member_incidents', 'member_payments', 'member_docs', 'member_fee_terms',
                         'pro_profiles', 'people', 'member_requests', 'production_invites')
    then jsonb_strip_nulls(jsonb_build_object(
           'id', coalesce(n, o)->'id', 'user_id', coalesce(n, o)->'user_id', 'production_id', coalesce(n, o)->'production_id',
           'tipo', coalesce(n, o)->'tipo', 'estado', coalesce(n, o)->'estado',
           'campos', case when o is not null and n is not null then
             (select jsonb_agg(k order by k) from jsonb_object_keys(n) k where n->k is distinct from o->k) end,
           'privado', true))
  end
$$;
drop trigger if exists audit_production_invites on production_invites;
create trigger audit_production_invites after insert or update or delete on production_invites
  for each row execute function audit_row();

create table if not exists invite_config (
  id int primary key default 1 check (id = 1),
  hook_url text check (hook_url is null or hook_url like 'https://%'),
  hook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into invite_config (id) values (1) on conflict do nothing;
alter table invite_config enable row level security;
revoke all on invite_config from anon, authenticated;

create or replace function panel_invite_member(pid text, p_email text, p_roles text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare correo text := lower(btrim(coalesce(p_email, ''))); uid uuid; r text; nuevos int := 0; inv production_invites%rowtype;
begin
  if not has_perm(pid, 'permisos.gestionar') then raise exception 'No tienes permiso para dar roles en esta obra.'; end if;
  if not exists (select 1 from productions where id = pid) then raise exception 'La obra no existe.'; end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido.'; end if;
  if coalesce(cardinality(p_roles), 0) = 0 then raise exception 'Marca al menos un rol.'; end if;
  if exists (select 1 from unnest(p_roles) x where not exists (select 1 from panel_roles where id = x)) then
    raise exception 'Uno de los roles no existe.';
  end if;
  select id into uid from auth.users where lower(email) = correo;
  if uid is not null then
    foreach r in array p_roles loop
      insert into production_members (production_id, user_id, role_id, created_by)
      values (pid, uid, r, auth.uid()) on conflict (production_id, user_id, role_id) do nothing;
      if found then nuevos := nuevos + 1; end if;
    end loop;
    return jsonb_build_object('tipo', 'agregado', 'nuevos', nuevos);
  end if;
  update production_invites
     set roles = (select array_agg(distinct x order by x) from unnest(roles || p_roles) x),
         expira_at = now() + interval '30 days', invitado_por = auth.uid(), enviado_at = null, envio_error = null
   where production_id = pid and email = correo and aceptada_at is null and cancelada_at is null
  returning * into inv;
  if not found then
    insert into production_invites (production_id, email, roles, invitado_por)
    values (pid, correo, (select array_agg(distinct x order by x) from unnest(p_roles) x), auth.uid())
    returning * into inv;
  end if;
  return jsonb_build_object('tipo', 'invitacion', 'id', inv.id, 'token', inv.token);
end $$;

create or replace function panel_invite_update(p_id uuid, p_accion text)
returns void
language plpgsql security definer set search_path = public as $$
declare inv production_invites%rowtype;
begin
  select * into inv from production_invites where id = p_id;
  if not found or not has_perm(inv.production_id, 'permisos.gestionar') then raise exception 'No encontramos esa invitación.'; end if;
  if inv.aceptada_at is not null or inv.cancelada_at is not null then raise exception 'Esa invitación ya no está abierta.'; end if;
  if p_accion = 'reenviar' then
    update production_invites set expira_at = now() + interval '30 days', enviado_at = null, envio_error = null where id = p_id;
  elsif p_accion = 'cancelar' then
    update production_invites set cancelada_at = now() where id = p_id;
  else
    raise exception 'Acción no válida.';
  end if;
end $$;

create or replace function _invite_apply(inv production_invites, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  foreach r in array inv.roles loop
    if exists (select 1 from panel_roles where id = r) then
      insert into production_members (production_id, user_id, role_id, created_by)
      values (inv.production_id, uid, r, inv.invitado_por) on conflict (production_id, user_id, role_id) do nothing;
    end if;
  end loop;
  update production_invites set aceptada_at = now(), aceptada_por = uid where id = inv.id;
end $$;

create or replace function invite_info(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'production_id', i.production_id, 'obra', p.nombre, 'email', i.email,
    'roles', (select coalesce(jsonb_agg(pr.nombre order by pr.orden), '[]') from panel_roles pr where pr.id = any(i.roles)),
    'estado', case when i.aceptada_at is not null then 'aceptada' when i.cancelada_at is not null then 'cancelada'
                   when i.expira_at < now() then 'vencida' else 'abierta' end)
    from production_invites i join productions p on p.id = i.production_id
   where i.token = p_token and length(p_token) >= 32
$$;

create or replace function invite_accept(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare inv production_invites%rowtype; correo text; confirmado timestamptz;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación.'; end if;
  select * into inv from production_invites where token = p_token and length(p_token) >= 32;
  if not found or inv.cancelada_at is not null then raise exception 'Esta invitación ya no es válida.'; end if;
  if inv.aceptada_at is not null then
    if inv.aceptada_por = auth.uid() then return inv.production_id; end if;
    raise exception 'Esta invitación ya se usó.';
  end if;
  if inv.expira_at < now() then raise exception 'Esta invitación venció. Pide que te la reenvíen.'; end if;
  select lower(email), email_confirmed_at into correo, confirmado from auth.users where id = auth.uid();
  if correo is distinct from inv.email then raise exception 'Esta invitación es para otro correo. Entra con la cuenta de ese correo.'; end if;
  if confirmado is null then raise exception 'Primero confirma tu correo (revisa tu bandeja) y vuelve a abrir la liga.'; end if;
  perform _invite_apply(inv, auth.uid());
  return inv.production_id;
end $$;

create or replace function claim_team_invites() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv production_invites%rowtype;
begin
  if new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then return new; end if;
  begin
    for inv in select * from production_invites
                where email = lower(new.email) and aceptada_at is null and cancelada_at is null and expira_at > now() loop
      perform _invite_apply(inv, new.id);
    end loop;
  exception when others then null; -- nunca impide crear o confirmar la cuenta
  end;
  return new;
end $$;
drop trigger if exists claim_team_invites on auth.users;
create trigger claim_team_invites after insert or update of email_confirmed_at, email on auth.users
  for each row execute function claim_team_invites();

create or replace function notify_team_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
declare titulo text;
begin
  begin
    -- El elenco (integrante) entra por su oferta y tiene su propio portal; quien se agrega a sí mismo no necesita aviso.
    if new.role_id = 'integrante' or new.created_by is not distinct from new.user_id then return new; end if;
    titulo := 'Te sumaron al equipo de ' || coalesce(production_name(new.production_id), 'una obra');
    perform notify(_sin_repetir(array[new.user_id], titulo, new.production_id), 'equipo', titulo,
      'Ya tienes acceso al panel de esta obra. Mira tu guía para saber qué puedes hacer y dónde.',
      '/panel/producciones/' || new.production_id || '/guia', new.production_id);
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notify_team_welcome on production_members;
create trigger notify_team_welcome after insert on production_members for each row execute function notify_team_welcome();

create or replace function production_invites_mail() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg invite_config%rowtype;
begin
  begin
    if new.aceptada_at is not null or new.cancelada_at is not null or new.enviado_at is not null then return new; end if;
    if tg_op = 'UPDATE' and old.enviado_at is null and old.expira_at = new.expira_at and old.roles = new.roles then return new; end if;
    select * into cfg from invite_config where id = 1;
    if cfg.hook_url is null or to_regnamespace('net') is null then return new; end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using cfg.hook_url, jsonb_build_object('id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-invite-secret', cfg.hook_secret);
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists production_invites_mail on production_invites;
create trigger production_invites_mail after insert or update on production_invites
  for each row execute function production_invites_mail();

revoke execute on function panel_invite_member(text, text, text[]), panel_invite_update(uuid, text), invite_accept(text) from public, anon;
grant execute on function panel_invite_member(text, text, text[]), panel_invite_update(uuid, text), invite_accept(text) to authenticated;
revoke execute on function invite_info(text) from public;
grant execute on function invite_info(text) to anon, authenticated;
revoke execute on function _invite_apply(production_invites, uuid), claim_team_invites(), notify_team_welcome(), production_invites_mail()
  from public, anon, authenticated;

commit;
