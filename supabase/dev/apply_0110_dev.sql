-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0110: elenco programado y aviso al Club Fan, ranking de vendedores por boletos y visitas del Club Fan
-- en la puerta. Requiere 0109. Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.rehearsal_attendance_ficha') is null then
    raise exception 'ABORTADO: primero corre apply_0109_dev.sql.';
  end if;
end $$;
begin;

-- ════════ 1 y 2. Elenco programado y aviso al Club Fan ════════
alter table production_credits add column if not exists publicar_at timestamptz;
alter table production_credits add column if not exists avisar_club boolean not null default false;

-- Socios del Club Fan (los del equipo y el elenco también tienen credencial, pero el aviso es para socios).
create or replace function socios_club() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from fan_members
$$;
revoke all on function socios_club() from public, anon, authenticated;

create or replace function credito_aviso_club() returns trigger
language plpgsql security definer set search_path = public as $$
declare obra text; persona text;
begin
  if not (new.publicado and not old.publicado and new.avisar_club) then return null; end if;
  if not production_is_visible(new.production_id) then return null; end if;
  select nombre into obra from productions where id = new.production_id;
  select nombre into persona from people where id = new.person_id;
  perform notify(socios_club(), 'fanzone',
    case when new.tipo = 'reparto' and coalesce(btrim(new.papel), '') <> ''
         then format('Conoce a quien será %s en %s', new.papel, obra)
         else format('%s se une al elenco de %s', persona, obra) end,
    case when new.tipo = 'reparto' and coalesce(btrim(new.papel), '') <> '' then persona else 'Club Fan: te enteras primero.' end,
    '/producciones/' || new.production_id, new.production_id);
  update production_credits set avisar_club = false where id = new.id;
  return null;
end $$;

drop trigger if exists credito_aviso_club on production_credits;
create trigger credito_aviso_club after update of publicado on production_credits
  for each row execute function credito_aviso_club();

-- "Publicar todo el elenco" con aviso: una sola notificación por obra.
create or replace function elenco_avisar_club(pid text) returns void
language plpgsql security definer set search_path = public as $$
declare obra text;
begin
  if not (has_perm(pid, 'elenco.gestionar') or has_perm(pid, 'obra.editar')) then raise exception 'No autorizado'; end if;
  if not production_is_visible(pid) then return; end if;
  select nombre into obra from productions where id = pid;
  perform notify(socios_club(), 'fanzone', format('Ya se reveló el elenco de %s', obra),
                 'Club Fan: conoce a quienes darán vida a la obra.', '/producciones/' || pid || '#elenco', pid);
end $$;
revoke all on function elenco_avisar_club(text) from public, anon;
grant execute on function elenco_avisar_club(text) to authenticated;

-- Publicación programada (pg_cron): lo que ya llegó a su hora sale solo.
create or replace function elenco_publicar_programado() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update production_credits set publicado = true, publicar_at = null
   where not publicado and publicar_at is not null and publicar_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function elenco_publicar_programado() from public, anon, authenticated;

-- Al publicar a mano se limpia lo programado.
create or replace function credito_limpia_programado() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.publicado then new.publicar_at := null; end if;
  return new;
end $$;
drop trigger if exists credito_limpia_programado on production_credits;
create trigger credito_limpia_programado before update of publicado on production_credits
  for each row execute function credito_limpia_programado();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_elenco_programado';
    perform cron.schedule('darf_elenco_programado', '*/5 * * * *', 'select public.elenco_publicar_programado()');
  end if;
end $$;

-- ════════ 3. Ranking de vendedores por boletos ════════
drop function if exists director_sellers();
create function director_sellers()
returns table (nombre text, codigo text, tipo text, obras integer, ordenes integer, boletos integer, monto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_casa('casa.reportes') then raise exception 'Solo el Director.'; end if;
  return query
    select coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
           s.codigo, case when s.user_id is null then 'externo' else 'cuenta' end,
           count(distinct f.production_id)::int, count(*)::int,
           coalesce(sum((select count(*) from tickets t where t.order_id = o.id and t.is_active)), 0)::int,
           sum(o.total)
      from orders o join performances f on f.id = o.performance_id join sellers s on s.id = o.seller_id
     where o.status = 'aprobado'
     group by s.id
     order by 6 desc, sum(o.total) desc
     limit 50;
end $$;
revoke all on function director_sellers() from public, anon;
grant execute on function director_sellers() to authenticated;

-- ════════ 4. Visitas del Club Fan en la puerta ════════
create table if not exists visitas_puerta (
  performance_id uuid not null references performances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marcado_por uuid,
  created_at timestamptz not null default now(),
  primary key (performance_id, user_id)
);
alter table visitas_puerta enable row level security;
drop policy if exists visitas_puerta_read on visitas_puerta;
create policy visitas_puerta_read on visitas_puerta for select
  using (user_id = auth.uid() or has_perm((select production_id from performances where id = performance_id), 'puerta.validar'));

-- Se escanea el pase (credencial) en la puerta de una función.
create or replace function puerta_visita(p_performance uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare pf performances; uid uuid; nombre text; foto text; entraron int; visitas int; base jsonb; prev timestamptz;
begin
  select * into pf from performances where id = p_performance;
  if not found then raise exception 'Esa función no existe.'; end if;
  if not (is_staff() or has_perm(pf.production_id, 'puerta.validar')) then raise exception 'No autorizado'; end if;
  uid := credencial_resolver(p_code);
  if uid is null then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = uid;
  base := jsonb_build_object('nombre', nombre, 'foto_path', foto, 'socio', exists (select 1 from fan_members where user_id = uid));
  select created_at into prev from visitas_puerta where performance_id = p_performance and user_id = uid;
  if found then return (base || jsonb_build_object('resultado', 'ya', 'hora', prev))::json; end if;
  select count(*) into entraron from tickets t join orders o on o.id = t.order_id
   where t.performance_id = p_performance and t.checked_in_at is not null and o.status = 'aprobado';
  select count(*) into visitas from visitas_puerta where performance_id = p_performance;
  if visitas >= entraron then return (base || jsonb_build_object('resultado', 'sin_boleto'))::json; end if;
  insert into visitas_puerta (performance_id, user_id, marcado_por) values (p_performance, uid, auth.uid());
  perform wallet_marcar_cuentas(array[uid]);
  return (base || jsonb_build_object('resultado', 'ok', 'visitas', fan_visitas(uid)))::json;
end $$;
revoke all on function puerta_visita(uuid, text) from public, anon;
grant execute on function puerta_visita(uuid, text) to authenticated;

-- Visitas: pases escaneados en la puerta + eventos a los que llegó + boletos escaneados antes de este cambio.
-- El corte es el momento en que se aplica 0110 (lo ganado antes se conserva).
do $$
declare corte text := coalesce(substring(pg_get_functiondef('public.fan_visitas(uuid)'::regprocedure) from '< ''([^'']+)''::timestamptz'), now()::text);
begin
  execute format($f$
create or replace function fan_visitas(uid uuid) returns int
language sql stable security definer set search_path = public as $b$
  select count(distinct v.clave)::int from (
    select 'f:' || vp.performance_id::text as clave from visitas_puerta vp where vp.user_id = uid
    union all
    select 'f:' || t.performance_id::text
      from tickets t join orders o on o.id = t.order_id
     where o.buyer_user_id = uid and o.status = 'aprobado' and t.checked_in_at is not null
       and t.checked_in_at < %L::timestamptz
    union all
    select case when e.tipo = 'funcion' and e.performance_id is not null then 'f:' || e.performance_id::text
                else 'e:' || e.id::text end
      from fan_encuentro_lugares l join fan_encuentros e on e.id = l.encuentro_id
     where l.user_id = uid and l.llegada_at is not null
  ) v where uid is not null;
$b$;$f$, corte);
end $$;

commit;

select 'Listo 0110. Elenco programado, aviso al Club Fan, ranking por boletos y visitas en la puerta activos.' as resultado;
