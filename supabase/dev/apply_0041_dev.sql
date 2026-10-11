-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0041 (expediente, documentos y mensualidades, etapa 3E bloque 2).
-- Se corre a mano en Supabase → SQL Editor si el conector no puede. Si la base no es DEV,
-- aborta sin hacer nada. No borra datos.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

-- ¿Es integrante (o tiene cualquier rol) en la obra?
create or replace function is_production_member(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from production_members where production_id = pid and user_id = auth.uid())
$$;

-- ──────── Expediente ────────
create table member_files (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fecha_nacimiento date,
  telefono text,
  emergencia_nombre text,
  emergencia_telefono text,
  emergencia_parentesco text,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  alergias text,
  condiciones text,                 -- condiciones médicas, lesiones
  medicamentos text,
  tipo_sangre text,
  altura_cm numeric(5,1) check (altura_cm between 50 and 250),
  pecho_cm numeric(5,1) check (pecho_cm between 30 and 200),
  cintura_cm numeric(5,1) check (cintura_cm between 30 and 200),
  cadera_cm numeric(5,1) check (cadera_cm between 30 and 200),
  talla_ropa text,
  talla_calzado text,
  revisado_at timestamptz,
  revisado_por uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (production_id, user_id)
);

-- Solo la producción marca "revisado". Si el integrante cambia sus datos, el expediente
-- vuelve a "por revisar".
create or replace function member_files_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(new.production_id, 'expedientes.ver') then
    new.revisado_at := null; new.revisado_por := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger member_files_guard before insert or update on member_files
  for each row execute function member_files_guard();

alter table member_files enable row level security;
create policy member_files_own on member_files for all to authenticated
  using (user_id = auth.uid() and is_production_member(production_id))
  with check (user_id = auth.uid() and is_production_member(production_id));
-- Datos de salud: solo quien tiene expedientes.ver (no basta con manejar mensualidades).
create policy member_files_team on member_files for all to authenticated
  using (has_perm(production_id, 'expedientes.ver')) with check (has_perm(production_id, 'expedientes.ver'));
revoke all on member_files from anon;

-- ──────── Documentos ────────
create table member_doc_types (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  solo_menores boolean not null default false,
  obligatorio boolean not null default true,
  orden int not null default 0
);
create table member_docs (
  id uuid primary key default gen_random_uuid(),
  doc_type_id uuid not null references member_doc_types(id) on delete cascade,
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  archivo_path text,               -- expedientes/<obra>/<usuario>/…
  subido_at timestamptz,
  entregado_at timestamptz,        -- lo marca la producción
  recibido_por uuid references auth.users(id) on delete set null,
  unique (doc_type_id, user_id)
);

create or replace function member_docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.production_id <> (select production_id from member_doc_types where id = new.doc_type_id) then
    raise exception 'Documento de otra obra.';
  end if;
  if new.archivo_path is not null and new.archivo_path not like new.production_id || '/' || new.user_id::text || '/%' then
    raise exception 'Archivo no válido.';
  end if;
  if not has_perm(new.production_id, 'expedientes.ver') then
    if tg_op = 'UPDATE' then new.entregado_at := old.entregado_at; new.recibido_por := old.recibido_por;
    else new.entregado_at := null; new.recibido_por := null; end if;
  end if;
  return new;
end $$;
create trigger member_docs_guard before insert or update on member_docs
  for each row execute function member_docs_guard();

alter table member_doc_types enable row level security;
alter table member_docs enable row level security;
create policy member_doc_types_read on member_doc_types for select to authenticated
  using (is_production_member(production_id));
create policy member_doc_types_team on member_doc_types for all to authenticated
  using (has_perm(production_id, 'expedientes.ver')) with check (has_perm(production_id, 'expedientes.ver'));
create policy member_docs_own on member_docs for all to authenticated
  using (user_id = auth.uid() and is_production_member(production_id))
  with check (user_id = auth.uid() and is_production_member(production_id));
create policy member_docs_team on member_docs for all to authenticated
  using (has_perm(production_id, 'expedientes.ver')) with check (has_perm(production_id, 'expedientes.ver'));
revoke all on member_doc_types, member_docs from anon;

-- Archivos privados: expedientes/<obra>/<usuario>/archivo (PDF o imagen, 10 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

create or replace function can_use_member_object(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pid text := split_part(path, '/', 1); uid text := split_part(path, '/', 2);
begin
  if pid = '' or uid = '' then return false; end if;
  if uid = auth.uid()::text and is_production_member(pid) then return true; end if;
  return has_perm(pid, 'expedientes.ver');
end $$;
create policy expedientes_read on storage.objects for select to authenticated
  using (bucket_id = 'expedientes' and can_use_member_object(name));
create policy expedientes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes' and can_use_member_object(name));
create policy expedientes_remove on storage.objects for delete to authenticated
  using (bucket_id = 'expedientes' and can_use_member_object(name));

-- ──────── Mensualidades ────────
create table production_fees (
  production_id text primary key references productions(id) on delete cascade,
  monto numeric(10,2) not null check (monto >= 0),
  desde date not null,             -- primer mes que se cobra
  hasta date not null,             -- último mes que se cobra
  dia_limite int not null default 10 check (dia_limite between 1 and 28),
  check (hasta >= desde)
);
-- Beca o cuota especial por persona (lo decide quien maneja mensualidades).
create table member_fee_terms (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  beca boolean not null default false,
  cuota_especial numeric(10,2) check (cuota_especial >= 0),
  nota text,
  primary key (production_id, user_id)
);
create table member_payments (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),   -- mes que paga (día 1)
  monto numeric(10,2) not null check (monto > 0),
  metodo text not null default 'efectivo' check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  nota text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  registrado_at timestamptz not null default now()
);
create index idx_member_payments on member_payments(production_id, user_id, periodo);

alter table production_fees enable row level security;
alter table member_payments enable row level security;
alter table member_fee_terms enable row level security;
create policy member_fee_terms_own_read on member_fee_terms for select to authenticated using (user_id = auth.uid());
create policy member_fee_terms_team on member_fee_terms for all to authenticated
  using (has_perm(production_id, 'mensualidades.gestionar')) with check (has_perm(production_id, 'mensualidades.gestionar'));
create policy production_fees_read on production_fees for select to authenticated
  using (is_production_member(production_id) or has_perm(production_id, 'mensualidades.gestionar'));
create policy production_fees_team on production_fees for all to authenticated
  using (has_perm(production_id, 'mensualidades.gestionar')) with check (has_perm(production_id, 'mensualidades.gestionar'));
create policy member_payments_own_read on member_payments for select to authenticated using (user_id = auth.uid());
create policy member_payments_team on member_payments for all to authenticated
  using (has_perm(production_id, 'mensualidades.gestionar')) with check (has_perm(production_id, 'mensualidades.gestionar'));
revoke all on production_fees, member_payments, member_fee_terms from anon;

-- ──────── Lista del elenco con cuenta (para expedientes y mensualidades) ────────
create or replace function cast_roster(pid text)
returns table (user_id uuid, nombre text, email text, papeles text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'expedientes.ver') or has_perm(pid, 'mensualidades.gestionar') or has_perm(pid, 'elenco.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           u.email::text,
           coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                       from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}')
      from production_members m
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
     order by 2;
end $$;

-- Obras donde soy integrante (Mi cuenta → Mis producciones).
create or replace function my_productions()
returns table (production_id text, nombre text, estado text, papeles text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.estado,
         coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                     from production_credits c join people pe on pe.id = c.person_id
                    where c.production_id = p.id and pe.profile_id = auth.uid()), '{}')
    from production_members m join productions p on p.id = m.production_id
   where m.user_id = auth.uid() and m.role_id = 'integrante'
   order by p.created_at desc
$$;

revoke execute on function is_production_member(text) from public, anon;
revoke execute on function member_files_guard() from public, anon;
revoke execute on function member_docs_guard() from public, anon;
revoke execute on function can_use_member_object(text) from public, anon;
revoke execute on function cast_roster(text) from public, anon;
revoke execute on function my_productions() from public, anon;
grant execute on function is_production_member(text), can_use_member_object(text), cast_roster(text), my_productions() to authenticated;

-- Bitácora: documentos y pagos (el expediente no, para no copiar datos de salud a la bitácora).
create trigger audit_member_docs after insert or update or delete on member_docs for each row execute function audit_row();
create trigger audit_member_payments after insert or update or delete on member_payments for each row execute function audit_row();
create trigger audit_member_fee_terms after insert or update or delete on member_fee_terms for each row execute function audit_row();
create trigger audit_production_fees after insert or update or delete on production_fees for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012040000', '0041_member_files') on conflict do nothing;
commit;
select 'OK: 0041 aplicada en DARF 2.0 DEV' as resultado;
