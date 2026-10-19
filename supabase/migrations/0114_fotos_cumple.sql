-- 0114 (Diego 2026-10-16): fotos de cada función y regalo de cumpleaños del Club Fan.
--   * Las fotos de la galería pueden decir de qué función son (gallery_photos.performance_id). Cuando el álbum está
--     listo, "Avisar a quienes fueron" manda UN aviso a quien tuvo boleto aprobado de esa función (una sola vez).
--   * Regalo de cumpleaños: cada socio del Club Fan con fecha de nacimiento recibe el día 1 de su mes (o el día que
--     entre al club o la registre, si es ese mes) un código personal CUMPLE-XXXXXX: 10 % en hasta 2 boletos, una
--     compra, cualquier obra, todo ese mes. Solo sirve desde su propia cuenta.
--     El código vive en regalos_cumple; al usarlo en una obra se crea ahí su código normal (discount_codes con
--     regalo_id), así las órdenes, reportes y cortes lo tratan como cualquier descuento.

-- ════════ 1. Fotos de cada función ════════
alter table gallery_photos add column if not exists performance_id uuid references performances(id) on delete set null;
create index if not exists gallery_photos_funcion on gallery_photos (performance_id) where performance_id is not null;

-- La función tiene que ser de la misma obra.
create or replace function gallery_photos_funcion_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.performance_id is not null
     and not exists (select 1 from performances where id = new.performance_id and production_id = new.production_id) then
    raise exception 'Esa función no es de esta obra.';
  end if;
  return new;
end $$;
drop trigger if exists gallery_photos_funcion_check on gallery_photos;
create trigger gallery_photos_funcion_check before insert or update of performance_id on gallery_photos
  for each row execute function gallery_photos_funcion_check();

create table if not exists fotos_funcion_avisos (
  performance_id uuid primary key references performances(id) on delete cascade,
  avisados int not null default 0,
  por uuid,
  created_at timestamptz not null default now()
);
alter table fotos_funcion_avisos enable row level security;
-- Sin políticas: se lee y escribe solo con las funciones de abajo.

-- Panel: funciones de la obra con sus fotos, cuántos tienen boleto y si ya se avisó.
create or replace function fotos_funcion_estado(pid text)
returns table (performance_id uuid, starts_at timestamptz, fotos int, con_boleto int, avisados int, avisado_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'fanzone.editar') then raise exception 'No autorizado'; end if;
  return query
    select pf.id, pf.starts_at,
           (select count(*)::int from gallery_photos g where g.performance_id = pf.id),
           (select count(distinct o.buyer_user_id)::int from orders o
             where o.performance_id = pf.id and o.status = 'aprobado' and o.buyer_user_id is not null),
           a.avisados, a.created_at
      from performances pf
      left join fotos_funcion_avisos a on a.performance_id = pf.id
     where pf.production_id = pid and pf.cancelada_at is null and pf.starts_at < now() + interval '1 day'
     order by pf.starts_at desc;
end $$;
revoke all on function fotos_funcion_estado(text) from public, anon;
grant execute on function fotos_funcion_estado(text) to authenticated;

create or replace function fotos_funcion_avisar(pid text, perf uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uids uuid[]; ini timestamptz;
begin
  if not has_perm(pid, 'fanzone.editar') then raise exception 'No autorizado'; end if;
  select starts_at into ini from performances where id = perf and production_id = pid;
  if not found then raise exception 'Esa función no es de esta obra.'; end if;
  if not exists (select 1 from gallery_photos where performance_id = perf) then
    raise exception 'Primero sube fotos de esa función.';
  end if;
  perform 1 from performances where id = perf for update;
  if exists (select 1 from fotos_funcion_avisos where performance_id = perf) then
    raise exception 'Ya se avisó a quienes fueron a esa función.';
  end if;
  uids := array(select distinct o.buyer_user_id from orders o
                 where o.performance_id = perf and o.status = 'aprobado' and o.buyer_user_id is not null);
  perform notify(uids, 'boletos', 'Ya están las fotos de tu función',
                 production_name(pid) || ' · función del ' || to_char(ini at time zone 'America/Mexico_City', 'DD/MM'),
                 '/producciones/' || pid || '/fotos?funcion=' || perf, pid);
  insert into fotos_funcion_avisos (performance_id, avisados, por) values (perf, cardinality(uids), auth.uid());
  insert into audit_log (tabla, accion, production_id, despues)
    values ('gallery_photos', 'fotos_avisar', pid, jsonb_build_object('funcion', perf, 'avisados', cardinality(uids)));
  return cardinality(uids);
end $$;
revoke all on function fotos_funcion_avisar(text, uuid) from public, anon;
grant execute on function fotos_funcion_avisar(text, uuid) to authenticated;

-- ════════ 2. Regalo de cumpleaños del Club Fan ════════
create table if not exists regalos_cumple (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  codigo text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, anio)
);
alter table regalos_cumple enable row level security;
drop policy if exists regalos_cumple_mio on regalos_cumple;
create policy regalos_cumple_mio on regalos_cumple for select using (user_id = auth.uid());
grant select on regalos_cumple to authenticated;

alter table discount_codes add column if not exists regalo_id uuid references regalos_cumple(id) on delete set null;

-- Si se borra el regalo (la cuenta se eliminó), sus códigos ya no sirven.
create or replace function regalos_cumple_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update discount_codes set is_active = false where regalo_id = old.id;
  return old;
end $$;
drop trigger if exists regalos_cumple_borrar on regalos_cumple;
create trigger regalos_cumple_borrar before delete on regalos_cumple for each row execute function regalos_cumple_borrar();

-- Fin del mes en curso (hora de México).
create or replace function regalo_cumple_vence() returns timestamptz
language sql stable set search_path = public as $$
  select ((date_trunc('month', hoy_mx()) + interval '1 month')::timestamp) at time zone 'America/Mexico_City'
$$;

-- ¿Este regalo se puede usar ahora, por quien lo usa?
create or replace function regalo_cumple_revisar(rid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare r regalos_cumple;
begin
  select * into r from regalos_cumple where id = rid;
  if not found then raise exception 'El código de descuento no existe'; end if;
  if r.user_id is distinct from auth.uid() then
    raise exception 'Este código es un regalo personal: se usa desde la cuenta del socio al comprar en línea.';
  end if;
  if r.anio <> extract(year from hoy_mx())::int or r.mes <> extract(month from hoy_mx())::int then
    raise exception 'Tu regalo de cumpleaños ya venció.';
  end if;
  if exists (select 1 from orders o join discount_codes d on d.id = o.discount_code_id
              where d.regalo_id = rid and o.status in ('pendiente', 'aprobado')) then
    raise exception 'Ya usaste tu regalo de cumpleaños.';
  end if;
end $$;
revoke all on function regalo_cumple_revisar(uuid) from public, anon, authenticated;

-- El código del regalo para una obra: se crea al comprar (crear = true); en la vista previa solo se arma.
create or replace function regalo_cumple_codigo(pid text, p_codigo text, crear boolean) returns discount_codes
language plpgsql security definer set search_path = public as $$
declare r regalos_cumple; v discount_codes;
begin
  select * into r from regalos_cumple where codigo = p_codigo;
  if not found then raise exception 'El código de descuento no existe'; end if;
  perform regalo_cumple_revisar(r.id);
  v.production_id := pid; v.codigo := r.codigo; v.percent := 10; v.max_tickets_per_order := 2;
  v.max_uses_total := 1; v.valid_until := regalo_cumple_vence(); v.is_active := true; v.regalo_id := r.id;
  if crear then
    insert into discount_codes (production_id, codigo, percent, valid_until, max_uses_total, max_tickets_per_order, is_active, regalo_id)
    values (pid, r.codigo, 10, v.valid_until, 1, 2, true, r.id)
    returning * into v;
  end if;
  return v;
end $$;
revoke all on function regalo_cumple_codigo(text, text, boolean) from public, anon, authenticated;

-- Los códigos CUMPLE- se resuelven con el regalo; un código de regalo ya creado vuelve a revisar al dueño.
do $$
declare def text;
begin
  def := pg_get_functiondef('public._resolve_discount_code(uuid, text, text, boolean)'::regprocedure);
  if position('regalo_cumple' in def) = 0 then
    def := replace(def, $q$  if not found then raise exception 'El código de descuento no existe'; end if;$q$,
                        $q$  if not found then
    -- 0114: regalo de cumpleaños del Club Fan.
    if v_codigo like 'CUMPLE-%' then
      v_dc := regalo_cumple_codigo(p_production_id, v_codigo, p_lock);
    else
      raise exception 'El código de descuento no existe';
    end if;
  end if;
  if v_dc.regalo_id is not null then perform regalo_cumple_revisar(v_dc.regalo_id); end if;$q$);
    if position('regalo_cumple' in def) = 0 then raise exception '0114: no se pudo parchar _resolve_discount_code'; end if;
    execute def;
  end if;
end $$;

-- Cada mañana: regalos para los socios que cumplen años este mes y aún no lo tienen este año.
create or replace function regalos_cumple_generar() returns int
language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from hoy_mx())::int;
  m int := extract(month from hoy_mx())::int;
  meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  r record; n int := 0;
begin
  for r in
    insert into regalos_cumple (user_id, anio, mes, codigo)
    select f.user_id, y, m, 'CUMPLE-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
      from fan_members f
      join profiles p on p.id = f.user_id
     where p.fecha_nacimiento is not null and extract(month from p.fecha_nacimiento)::int = m
       and not exists (select 1 from cuentas_empresa e where e.user_id = f.user_id)
    on conflict do nothing
    returning user_id, codigo
  loop
    n := n + 1;
    begin
      perform notify(array[r.user_id], 'boletos', '¡Feliz cumpleaños! Tu regalo del Club Fan',
        '10 % en hasta 2 boletos de cualquier obra durante ' || meses[m] || '. Código ' || r.codigo || '.',
        '/cuenta#club', null);
    exception when others then null;
    end;
  end loop;
  return n;
end $$;
revoke all on function regalos_cumple_generar() from public, anon, authenticated;

do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname = 'darf_cumple';
  perform cron.schedule('darf_cumple', '10 14 * * *', 'select public.regalos_cumple_generar()');
end if; end $$;

-- La lista de códigos de la obra no muestra los regalos de cumpleaños (son personales).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.admin_list_discount_codes(text)'::regprocedure);
  if position('regalo_id' in def) = 0 then
    def := replace(def, 'from discount_codes d where d.production_id = target_production_id',
                        'from discount_codes d where d.production_id = target_production_id and d.regalo_id is null');
    if position('regalo_id' in def) = 0 then raise exception '0114: no se pudo parchar admin_list_discount_codes'; end if;
    execute def;
  end if;
end $$;
