-- 0123 (Diego 2026-10-22): preventa privada con código, antes de la del Club Fan.
--   Etapas de cada función: privada (solo quien canjeó un código de la obra) → preventa Club Fan (socios y quien
--   tiene código) → venta general. Varios códigos por obra (nombre y máximo de personas), límite opcional de
--   boletos por persona en la etapa privada. Las fechas privadas viven aparte (no las lee el público: quien no tiene
--   código solo ve "La venta abre el…"). Taquilla vende siempre.

-- ──────── Fechas (privadas) ────────
create table if not exists preventa_privada_obras (
  production_id text primary key references productions(id) on delete cascade,
  desde timestamptz not null,
  max_por_persona int check (max_por_persona is null or max_por_persona between 1 and 50),
  updated_at timestamptz not null default now()
);
create table if not exists preventa_privada_funciones (
  performance_id uuid primary key references performances(id) on delete cascade,
  desde timestamptz not null
);

-- ──────── Códigos y accesos ────────
create table if not exists preventa_codigos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9-]{4,24}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  max_personas int check (max_personas is null or max_personas between 1 and 100000),
  activo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists preventa_codigos_prod_idx on preventa_codigos(production_id);
create table if not exists preventa_accesos (
  codigo_id uuid not null references preventa_codigos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  canjeado_at timestamptz not null default now(),
  primary key (codigo_id, user_id)
);
create index if not exists preventa_accesos_user_idx on preventa_accesos(user_id);
create table if not exists preventa_intentos (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists preventa_intentos_idx on preventa_intentos(user_id, at);

drop trigger if exists audit_preventa_codigos on preventa_codigos;
create trigger audit_preventa_codigos after insert or update or delete on preventa_codigos for each row execute function audit_row();

alter table preventa_privada_obras enable row level security;
alter table preventa_privada_funciones enable row level security;
alter table preventa_codigos enable row level security;
alter table preventa_accesos enable row level security;
alter table preventa_intentos enable row level security;

drop policy if exists preventa_privada_obras_team on preventa_privada_obras;
create policy preventa_privada_obras_team on preventa_privada_obras for select to authenticated
  using (has_perm(production_id, 'funciones.gestionar') or has_perm(production_id, 'ventas.ver'));
drop policy if exists preventa_privada_funciones_team on preventa_privada_funciones;
create policy preventa_privada_funciones_team on preventa_privada_funciones for select to authenticated
  using (exists (select 1 from performances pf where pf.id = performance_id
                 and (has_perm(pf.production_id, 'funciones.gestionar') or has_perm(pf.production_id, 'ventas.ver'))));
drop policy if exists preventa_codigos_team on preventa_codigos;
create policy preventa_codigos_team on preventa_codigos for select to authenticated
  using (has_perm(production_id, 'funciones.gestionar') or has_perm(production_id, 'ventas.ver'));
drop policy if exists preventa_accesos_read on preventa_accesos;
create policy preventa_accesos_read on preventa_accesos for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from preventa_codigos c where c.id = codigo_id
         and (has_perm(c.production_id, 'funciones.gestionar') or has_perm(c.production_id, 'ventas.ver'))));

-- ¿Esta cuenta tiene acceso a la preventa privada de la obra?
create or replace function preventa_tiene_acceso(uid uuid, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from preventa_accesos a join preventa_codigos c on c.id = a.codigo_id
                                      where a.user_id = uid and c.production_id = pid and c.activo)
$$;
revoke all on function preventa_tiene_acceso(uuid, text) from public, anon, authenticated;

-- Etapa privada de una función: [desde, preventa_desde).
create or replace function preventa_privada_de(pfid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select desde from preventa_privada_funciones where performance_id = pfid
$$;
revoke all on function preventa_privada_de(uuid) from public, anon, authenticated;

-- ──────── Reglas de compra en línea (reemplaza 0120) ────────
create or replace function preventa_revisar(pfid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare desde timestamptz; hasta timestamptz; publicadas boolean; modo text; pid text; privada timestamptz; acceso boolean;
begin
  select pf.preventa_desde, pf.preventa_hasta, p.funciones_publicadas, p.modo_venta, p.id into desde, hasta, publicadas, modo, pid
    from performances pf join productions p on p.id = pf.production_id where pf.id = pfid;
  if publicadas is not true then raise exception 'Esta función no está a la venta en línea.'; end if;
  if modo = 'whatsapp' then raise exception 'Los boletos de esta obra se piden por WhatsApp.'; end if;
  privada := preventa_privada_de(pfid);
  acceso := preventa_tiene_acceso(auth.uid(), pid);
  -- 0123: etapa privada (solo con código).
  if privada is not null and desde is not null and now() < desde then
    if acceso and now() >= privada then return; end if;
    if acceso then raise exception 'Tu preventa privada abre el %.', cuando_mx(privada); end if;
    raise exception 'La venta de esta función abre el %.', cuando_mx(desde);
  end if;
  if desde is not null and desde > now() then
    raise exception 'La venta de esta función abre el %.', cuando_mx(desde);
  end if;
  if hasta is not null and hasta > now() and not is_fan_member() and not acceso then
    raise exception 'Esta función está en preventa para el Club Fan hasta el %. Únete gratis en la Fan Zone para comprar ahora.', cuando_mx(hasta);
  end if;
end $$;

-- Límite de boletos por persona en la etapa privada (al final de la transacción de la compra en línea).
create or replace function preventa_privada_tope() returns trigger
language plpgsql security definer set search_path = public as $$
declare o orders; pid text; privada timestamptz; desde timestamptz; tope int; n int;
begin
  select * into o from orders where id = new.order_id;
  if o.buyer_user_id is null or o.created_by_staff_id is not null then return null; end if;
  select pf.production_id, pf.preventa_desde into pid, desde from performances pf where pf.id = new.performance_id;
  privada := preventa_privada_de(new.performance_id);
  if privada is null or desde is null or now() < privada or now() >= desde then return null; end if;
  select max_por_persona into tope from preventa_privada_obras where production_id = pid;
  if tope is null then return null; end if;
  select count(*) into n from tickets t join orders o2 on o2.id = t.order_id
   where t.performance_id = new.performance_id and t.is_active and o2.buyer_user_id = o.buyer_user_id and o2.status in ('pendiente', 'aprobado');
  if n > tope then
    raise exception 'En la preventa privada el máximo es de % boletos por persona en esta función.', tope;
  end if;
  return null;
end $$;
drop trigger if exists preventa_privada_tope on tickets;
create constraint trigger preventa_privada_tope after insert on tickets deferrable initially deferred
  for each row execute function preventa_privada_tope();

-- ──────── Fechas: obra → funciones ────────
-- Igual que obra_preventa (0118): la obra pone sus fechas en las funciones sin fechas propias.
create or replace function obra_preventa_privada(pid text, p_desde timestamptz, p_max int) returns json
language plpgsql security definer set search_path = public as $$
declare d timestamptz; n int := 0;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_max is not null and (p_max < 1 or p_max > 50) then raise exception 'El máximo por persona va de 1 a 50.'; end if;
  if p_desde is null then
    delete from preventa_privada_obras where production_id = pid;
    delete from preventa_privada_funciones f using performances pf
     where pf.id = f.performance_id and pf.production_id = pid and not pf.preventa_propia;
  else
    select preventa_desde into d from productions where id = pid;
    if d is null or p_desde >= d then
      raise exception 'Primero pon el inicio de la preventa del Club Fan (o de la venta): la privada va antes.';
    end if;
    insert into preventa_privada_obras (production_id, desde, max_por_persona) values (pid, p_desde, p_max)
    on conflict (production_id) do update set desde = excluded.desde, max_por_persona = excluded.max_por_persona, updated_at = now();
    insert into preventa_privada_funciones (performance_id, desde)
    select pf.id, p_desde from performances pf
     where pf.production_id = pid and not pf.preventa_propia and pf.cancelada_at is null and pf.starts_at > now()
       and pf.preventa_desde is not null and pf.preventa_desde > p_desde
    on conflict (performance_id) do update set desde = excluded.desde;
    get diagnostics n = row_count;
  end if;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('productions', 'preventa_privada', pid, jsonb_build_object('desde', p_desde, 'max', p_max, 'funciones', n));
  return json_build_object('funciones', n);
end $$;
revoke all on function obra_preventa_privada(text, timestamptz, int) from public, anon;
grant execute on function obra_preventa_privada(text, timestamptz, int) to authenticated;

-- Una función: sus propias fechas privadas (o null para quitarla).
create or replace function funcion_preventa_privada(pfid uuid, p_desde timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare pid text; d timestamptz;
begin
  select production_id, preventa_desde into pid, d from performances where id = pfid;
  if pid is null or not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_desde is null then delete from preventa_privada_funciones where performance_id = pfid; return; end if;
  if d is null or p_desde >= d then raise exception 'La preventa privada debe empezar antes del inicio de la preventa (o venta) de la función.'; end if;
  insert into preventa_privada_funciones (performance_id, desde) values (pfid, p_desde)
  on conflict (performance_id) do update set desde = excluded.desde;
end $$;
revoke all on function funcion_preventa_privada(uuid, timestamptz) from public, anon;
grant execute on function funcion_preventa_privada(uuid, timestamptz) to authenticated;

-- Funciones nuevas o que vuelven a "usar las fechas de la obra": toman la privada de la obra si le queda.
create or replace function performances_preventa_privada() returns trigger
language plpgsql security definer set search_path = public as $$
declare o preventa_privada_obras;
begin
  if new.preventa_propia then return null; end if;
  select * into o from preventa_privada_obras where production_id = new.production_id;
  if o.desde is not null and new.preventa_desde is not null and o.desde < new.preventa_desde and (new.starts_at is null or new.starts_at > now()) then
    insert into preventa_privada_funciones (performance_id, desde) values (new.id, o.desde)
    on conflict (performance_id) do update set desde = excluded.desde;
  elsif tg_op = 'UPDATE' then
    delete from preventa_privada_funciones where performance_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists performances_preventa_privada on performances;
create trigger performances_preventa_privada after insert or update of preventa_desde, preventa_propia on performances
  for each row execute function performances_preventa_privada();

-- ──────── Códigos ────────
create or replace function preventa_codigo_crear(pid text, p_nombre text, p_max int) returns json
language plpgsql security definer set search_path = public as $$
declare c text; nid uuid; i int := 0;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'Ponle un nombre al código (ej. Familias del elenco).'; end if;
  loop
    -- Sin letras que se confunden (0/O, 1/I/L).
    c := 'DARF-' || (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from preventa_codigos where codigo = c);
    i := i + 1; if i > 20 then raise exception 'No se pudo generar el código; intenta otra vez.'; end if;
  end loop;
  insert into preventa_codigos (production_id, codigo, nombre, max_personas) values (pid, c, btrim(p_nombre), p_max) returning id into nid;
  return json_build_object('id', nid, 'codigo', c);
end $$;
revoke all on function preventa_codigo_crear(text, text, int) from public, anon;
grant execute on function preventa_codigo_crear(text, text, int) to authenticated;

create or replace function preventa_codigo_estado(p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from preventa_codigos where id = p_id;
  if pid is null or not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  update preventa_codigos set activo = p_activo where id = p_id;
end $$;
revoke all on function preventa_codigo_estado(uuid, boolean) from public, anon;
grant execute on function preventa_codigo_estado(uuid, boolean) to authenticated;

-- Canjear un código (liga /preventa/CODIGO o campo en la obra). Tope: 10 intentos fallidos por hora.
-- Código inválido: {error}; válido: {production_id, obra, ya}.
create or replace function preventa_canjear(p_codigo text) returns json
language plpgsql security definer set search_path = public as $$
declare c preventa_codigos; norm text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g')); n int; ya boolean;
begin
  if auth.uid() is null then raise exception 'Entra a tu cuenta para usar el código.'; end if;
  if (select count(*) from preventa_intentos where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados intentos. Espera una hora e intenta de nuevo.';
  end if;
  if norm !~ '^DARF-' and norm ~ '^[A-Z0-9]{5}$' then norm := 'DARF-' || norm; end if;
  select * into c from preventa_codigos where codigo = norm;
  if not found or not c.activo then
    -- Se responde sin error para que el intento quede guardado (un error desharía el registro).
    insert into preventa_intentos (user_id) values (auth.uid());
    return json_build_object('error', 'Ese código no es válido o ya no está activo.');
  end if;
  ya := exists (select 1 from preventa_accesos where codigo_id = c.id and user_id = auth.uid());
  if not ya and c.max_personas is not null then
    select count(*) into n from preventa_accesos where codigo_id = c.id;
    if n >= c.max_personas then raise exception 'Este código ya alcanzó su límite de personas.'; end if;
  end if;
  if not ya then
    insert into preventa_accesos (codigo_id, user_id) values (c.id, auth.uid());
    insert into audit_log (tabla, accion, registro_id, production_id, despues)
      values ('preventa_accesos', 'canjear', c.id::text, c.production_id, jsonb_build_object('codigo', c.codigo));
  end if;
  return json_build_object('production_id', c.production_id, 'obra', (select nombre from productions where id = c.production_id), 'ya', ya);
end $$;
revoke all on function preventa_canjear(text) from public, anon;
grant execute on function preventa_canjear(text) to authenticated;

-- Para la web: si tengo acceso, las fechas privadas de cada función y el máximo por persona.
create or replace function mi_preventa_privada(pid text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not preventa_tiene_acceso(auth.uid(), pid) then return json_build_object('acceso', false); end if;
  return json_build_object('acceso', true,
    'max', (select max_por_persona from preventa_privada_obras where production_id = pid),
    'funciones', coalesce((select json_object_agg(f.performance_id, f.desde) from preventa_privada_funciones f
                             join performances pf on pf.id = f.performance_id where pf.production_id = pid), '{}'::json));
end $$;
revoke all on function mi_preventa_privada(text) from public, anon;
grant execute on function mi_preventa_privada(text) to authenticated;

-- Panel: por código, personas que entraron, boletos y ventas aprobadas de esas cuentas en la obra.
create or replace function preventa_codigos_resumen(pid text)
returns table (id uuid, codigo text, nombre text, max_personas int, activo boolean, created_at timestamptz, personas int, boletos int, vendido numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'funciones.gestionar') or has_perm(pid, 'ventas.ver')) then raise exception 'No autorizado'; end if;
  return query
    select c.id, c.codigo, c.nombre, c.max_personas, c.activo, c.created_at,
           (select count(*) from preventa_accesos a where a.codigo_id = c.id)::int,
           (select count(*) from tickets t join orders o on o.id = t.order_id join performances pf on pf.id = o.performance_id
             where pf.production_id = pid and t.is_active and o.status = 'aprobado'
               and o.buyer_user_id in (select a.user_id from preventa_accesos a where a.codigo_id = c.id))::int,
           coalesce((select sum(o.total) from orders o join performances pf on pf.id = o.performance_id
             where pf.production_id = pid and o.status = 'aprobado'
               and o.buyer_user_id in (select a.user_id from preventa_accesos a where a.codigo_id = c.id)), 0)
    from preventa_codigos c where c.production_id = pid order by c.created_at;
end $$;
revoke all on function preventa_codigos_resumen(text) from public, anon;
grant execute on function preventa_codigos_resumen(text) to authenticated;
