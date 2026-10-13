-- 0096: Contacto con responsable y respuesta; filtros de la Bitácora (Bloque 4C, 2026-10-13).
--   * Contacto: asignar un mensaje a alguien del equipo (le llega aviso), marcar quién respondió,
--     cuándo y por dónde (correo, WhatsApp, teléfono u otro) con una nota; reabrir si fue error.
--     Queda en la bitácora sin datos de quien escribió.
--   * Bitácora: lista de personas que aparecen como autoras (filtro por persona) e índice.
-- Precede: 0095.

begin;

-- ════════ Contacto ════════
alter table contact_messages
  add column if not exists asignado_a uuid references auth.users(id) on delete set null,
  add column if not exists asignado_at timestamptz,
  add column if not exists respondido_at timestamptz,
  add column if not exists respondido_por uuid references auth.users(id) on delete set null,
  add column if not exists respuesta_canal text,
  add column if not exists respuesta_nota text;
alter table contact_messages drop constraint if exists contact_messages_respuesta;
alter table contact_messages add constraint contact_messages_respuesta check (
  (respuesta_canal is null or respuesta_canal in ('correo', 'whatsapp', 'telefono', 'otro'))
  and length(coalesce(respuesta_nota, '')) <= 500);
create index if not exists idx_contact_messages_asignado on contact_messages(asignado_a) where respondido_at is null;

-- Quienes atienden Contacto (staff y Director), para el selector "Asignar a".
create or replace function contact_equipo()
returns table (id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'No autorizado.'; end if;
  return query
    select p.id, coalesce(nullif(btrim(p.nombre), ''), u.email::text)
      from profiles p join auth.users u on u.id = p.id
     where p.rol in ('staff', 'admin')
     order by 2;
end $$;

create or replace function contact_asignar(p_id uuid, p_uid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare m contact_messages%rowtype;
begin
  if not is_staff() then raise exception 'No autorizado.'; end if;
  if p_uid is not null and not exists (select 1 from profiles where id = p_uid and rol in ('staff', 'admin')) then
    raise exception 'Esa persona no atiende Contacto.';
  end if;
  update contact_messages set asignado_a = p_uid, asignado_at = case when p_uid is null then null else now() end
   where id = p_id and asignado_a is distinct from p_uid
  returning * into m;
  if not found then
    if not exists (select 1 from contact_messages where id = p_id) then raise exception 'No encontramos ese mensaje.'; end if;
    return;
  end if;
  if p_uid is not null and p_uid is distinct from auth.uid() then
    perform notify(array[p_uid], 'contacto', 'Te asignaron un mensaje de contacto',
      concat_ws(' · ', m.nombre, nullif(m.asunto, '')), '/panel/contacto?ver=mios', null);
  end if;
end $$;

create or replace function contact_responder(p_id uuid, p_canal text, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'No autorizado.'; end if;
  if p_canal not in ('correo', 'whatsapp', 'telefono', 'otro') then raise exception 'Elige por dónde respondiste.'; end if;
  update contact_messages
     set respondido_at = now(), respondido_por = auth.uid(), respuesta_canal = p_canal,
         respuesta_nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''), leido = true
   where id = p_id;
  if not found then raise exception 'No encontramos ese mensaje.'; end if;
end $$;

create or replace function contact_reabrir(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'No autorizado.'; end if;
  update contact_messages set respondido_at = null, respondido_por = null, respuesta_canal = null, respuesta_nota = null
   where id = p_id;
  if not found then raise exception 'No encontramos ese mensaje.'; end if;
end $$;

-- Bitácora sin nombre, correo ni mensaje (resumen como 0090/0094).
create or replace function _audit_resumen(t text, o jsonb, n jsonb) returns jsonb
language sql immutable as $$
  select case
    when t = 'contact_messages' then jsonb_strip_nulls(jsonb_build_object(
           'id', coalesce(n, o)->'id', 'asignado_a', coalesce(n, o)->'asignado_a',
           'respondido_por', coalesce(n, o)->'respondido_por', 'respuesta_canal', coalesce(n, o)->'respuesta_canal',
           'campos', case when o is not null and n is not null then
             (select jsonb_agg(k order by k) from jsonb_object_keys(n) k where n->k is distinct from o->k) end,
           'privado', true))
    when t in ('member_measures', 'member_incidents', 'member_payments', 'member_docs', 'member_fee_terms',
               'pro_profiles', 'people', 'member_requests', 'production_invites')
    then jsonb_strip_nulls(jsonb_build_object(
           'id', coalesce(n, o)->'id', 'user_id', coalesce(n, o)->'user_id', 'production_id', coalesce(n, o)->'production_id',
           'tipo', coalesce(n, o)->'tipo', 'estado', coalesce(n, o)->'estado',
           'campos', case when o is not null and n is not null then
             (select jsonb_agg(k order by k) from jsonb_object_keys(n) k where n->k is distinct from o->k) end,
           'privado', true))
  end
$$;
-- Solo cambios hechos por el equipo (asignar, responder, reabrir, borrar); el mensaje nuevo no se registra.
drop trigger if exists audit_contact_messages on contact_messages;
create trigger audit_contact_messages after update or delete on contact_messages
  for each row execute function audit_row();

-- ════════ Bitácora ════════
create index if not exists idx_audit_log_actor on audit_log(actor, at desc);

-- Personas que aparecen como autoras en la bitácora (filtro por persona). Solo el Director.
create or replace function audit_actores()
returns table (id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director puede ver la bitácora.'; end if;
  return query
    select a.actor, coalesce(nullif(btrim(p.nombre), ''), u.email::text, 'Cuenta borrada')
      from (select distinct actor from audit_log where actor is not null) a
      left join profiles p on p.id = a.actor
      left join auth.users u on u.id = a.actor
     order by 2;
end $$;

revoke execute on function contact_equipo(), contact_asignar(uuid, uuid), contact_responder(uuid, text, text), contact_reabrir(uuid), audit_actores()
  from public, anon;
grant execute on function contact_equipo(), contact_asignar(uuid, uuid), contact_responder(uuid, text, text), contact_reabrir(uuid), audit_actores()
  to authenticated;

commit;
