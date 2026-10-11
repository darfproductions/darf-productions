-- 0040: elenco y ofertas (Fase 3, etapa 3E, bloque 1). Decisiones de Diego (2026-10-11).
--   * La producción manda una OFERTA (personaje, ensamble, cover, equipo…) a una persona con
--     cuenta: desde los resultados de una audición o directo por correo.
--   * La persona acepta o declina desde Mi cuenta (avisos dentro de la página, sin correos).
--   * Al aceptar: se crea (o reusa) su ficha de persona ligada a su cuenta, entra a los
--     créditos de la obra y recibe el rol "Integrante" (portal del elenco, bloques siguientes).
--   * El rol Integrante no tiene permisos de panel: no cuenta como "equipo de la obra".
-- Precede: 0039.

begin;

create table casting_offers (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,               -- a quién
  application_id uuid references audition_applications(id) on delete set null,    -- si viene de una audición
  tipo text not null check (tipo in ('reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico')),
  papel text,                                                                      -- personaje o puesto ("Cover de Brady")
  mensaje text check (length(mensaje) <= 2000),
  responder_antes timestamptz,
  estado text not null default 'enviada' check (estado in ('enviada', 'aceptada', 'declinada', 'retirada')),
  respondida_at timestamptz,
  credit_id uuid references production_credits(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (tipo = 'ensamble' or coalesce(btrim(papel), '') <> '')
);
create index idx_casting_offers_user on casting_offers(user_id, estado);
create index idx_casting_offers_prod on casting_offers(production_id, estado);
create index idx_casting_offers_app on casting_offers(application_id);

alter table casting_offers enable row level security;
create policy casting_offers_own_read on casting_offers for select to authenticated using (user_id = auth.uid());
create policy casting_offers_team_read on casting_offers for select to authenticated using (has_perm(production_id, 'elenco.gestionar'));
revoke all on casting_offers from anon;
-- Escribir solo por las funciones de abajo.

-- "Equipo de la obra" = alguien con un rol que da permisos. El Integrante (sin permisos)
-- no lee borradores ni datos internos de la obra.
create or replace function in_production_team(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol in ('admin', 'staff'))
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and m.production_id = pid)
  )
$$;

-- Mandar una oferta. p: {production_id, application_id | email, tipo, papel, mensaje, responder_antes}
create or replace function casting_offer_send(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid text := nullif(btrim(p->>'production_id'), '');
  app uuid := nullif(p->>'application_id', '')::uuid;
  uid uuid;
  v_id uuid;
  v_tipo text := coalesce(nullif(p->>'tipo', ''), 'reparto');
begin
  if pid is null or not exists (select 1 from productions where id = pid) then raise exception 'Elige la obra.'; end if;
  if not has_perm(pid, 'elenco.gestionar') then raise exception 'No tienes permiso para armar el elenco de esta obra.'; end if;
  if app is not null then
    select user_id into uid from audition_applications where id = app;
    if not found then raise exception 'No se encontró la solicitud.'; end if;
    if uid is null then
      raise exception 'Esta persona se registró el día de la audición y no tiene cuenta. Pídele que cree su cuenta y mándale la oferta por correo.';
    end if;
    -- Desde una audición: hay que poder ver esa audición (de esta obra o general con permiso).
    if not audition_perm(application_audition(app), 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  else
    select id into uid from auth.users where lower(email) = lower(btrim(coalesce(p->>'email', '')));
    if uid is null then raise exception 'Ese correo aún no tiene cuenta en DARF. Pídele que se registre primero.'; end if;
  end if;
  if exists (select 1 from casting_offers where production_id = pid and user_id = uid and estado = 'enviada'
               and tipo = v_tipo and coalesce(papel, '') = coalesce(btrim(p->>'papel'), '')) then
    raise exception 'Ya tiene esa misma oferta pendiente.';
  end if;
  insert into casting_offers (production_id, user_id, application_id, tipo, papel, mensaje, responder_antes)
  values (pid, uid, app, v_tipo, nullif(btrim(p->>'papel'), ''), nullif(btrim(p->>'mensaje'), ''),
          nullif(p->>'responder_antes', '')::timestamptz)
  returning id into v_id;
  return v_id;
end $$;

-- Retirar una oferta que aún no se responde.
create or replace function casting_offer_withdraw(oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o casting_offers%rowtype;
begin
  select * into o from casting_offers where id = oid for update;
  if not found or not has_perm(o.production_id, 'elenco.gestionar') then raise exception 'No autorizado'; end if;
  if o.estado <> 'enviada' then raise exception 'Esta oferta ya fue respondida.'; end if;
  update casting_offers set estado = 'retirada', respondida_at = now() where id = oid;
end $$;

-- La persona responde. Al aceptar: ficha de persona + crédito + rol Integrante.
create or replace function casting_offer_respond(oid uuid, acepta boolean) returns json
language plpgsql security definer set search_path = public as $$
declare o casting_offers%rowtype; v_person uuid; v_credit uuid; v_nombre text;
begin
  select * into o from casting_offers where id = oid and user_id = auth.uid() for update;
  if not found then raise exception 'No se encontró la oferta.'; end if;
  if o.estado <> 'enviada' then raise exception 'Esta oferta ya no está disponible.'; end if;
  if o.responder_antes is not null and now() > o.responder_antes then raise exception 'El plazo para responder ya pasó. Habla con la producción.'; end if;
  if not acepta then
    update casting_offers set estado = 'declinada', respondida_at = now() where id = oid;
    return json_build_object('estado', 'declinada');
  end if;

  select id into v_person from people where profile_id = auth.uid();
  if v_person is null then
    v_nombre := coalesce(
      nullif(btrim((select nombre from audition_applications where id = o.application_id)), ''),
      nullif(btrim((select nombre from profiles where id = auth.uid())), ''),
      split_part((select email from auth.users where id = auth.uid()), '@', 1));
    insert into people (nombre, profile_id) values (v_nombre, auth.uid()) returning id into v_person;
  end if;
  insert into production_credits (production_id, person_id, tipo, papel, orden)
  values (o.production_id, v_person, o.tipo, o.papel,
          coalesce((select max(orden) + 1 from production_credits where production_id = o.production_id and tipo = o.tipo), 1))
  returning id into v_credit;
  insert into production_members (production_id, user_id, role_id, created_by)
  values (o.production_id, auth.uid(), 'integrante', o.created_by)
  on conflict (production_id, user_id, role_id) do nothing;
  update casting_offers set estado = 'aceptada', respondida_at = now(), credit_id = v_credit where id = oid;
  if o.application_id is not null then
    update audition_applications set estado = 'seleccionado', updated_at = now()
     where id = o.application_id and estado not in ('cancelado');
  end if;
  return json_build_object('estado', 'aceptada', 'credit_id', v_credit);
end $$;

-- Mis ofertas (Mi cuenta), con el nombre de la obra aunque aún no esté publicada.
create or replace function my_casting_offers()
returns table (id uuid, production_id text, obra text, tipo text, papel text, mensaje text,
               responder_antes timestamptz, estado text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.production_id, p.nombre, o.tipo, o.papel, o.mensaje, o.responder_antes, o.estado, o.created_at
    from casting_offers o join productions p on p.id = o.production_id
   where o.user_id = auth.uid() and o.estado in ('enviada', 'aceptada')
   order by (o.estado = 'enviada') desc, o.created_at desc
$$;

-- Ofertas de la obra con nombre y correo (para quien arma el elenco).
create or replace function casting_offer_list(pid text)
returns table (id uuid, user_id uuid, nombre text, email text, application_id uuid, tipo text, papel text, estado text,
               responder_antes timestamptz, created_at timestamptz, respondida_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'elenco.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select o.id, o.user_id,
           coalesce(nullif(btrim(pr.nombre), ''), (select a.nombre from audition_applications a where a.id = o.application_id), split_part(u.email::text, '@', 1)),
           u.email::text, o.application_id, o.tipo, o.papel, o.estado, o.responder_antes, o.created_at, o.respondida_at
      from casting_offers o
      join auth.users u on u.id = o.user_id
      left join profiles pr on pr.id = o.user_id
     where o.production_id = pid
     order by (o.estado = 'enviada') desc, o.created_at desc;
end $$;

revoke execute on function casting_offer_list(text) from public, anon;
grant execute on function casting_offer_list(text) to authenticated;
revoke execute on function casting_offer_send(jsonb) from public, anon;
revoke execute on function casting_offer_withdraw(uuid) from public, anon;
revoke execute on function casting_offer_respond(uuid, boolean) from public, anon;
revoke execute on function my_casting_offers() from public, anon;
grant execute on function casting_offer_send(jsonb), casting_offer_withdraw(uuid), casting_offer_respond(uuid, boolean), my_casting_offers()
  to authenticated;

create trigger audit_casting_offers after insert or update or delete on casting_offers for each row execute function audit_row();

commit;
