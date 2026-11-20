-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0156: Mi calendario DARF (liga privada por persona para Google, Apple u Outlook).
-- Correr DESPUÉS de apply_0155_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.rehearsals') is null or to_regclass('public.fan_encuentros') is null then
    raise exception 'ABORTADO: faltan ensayos o eventos.';
  end if;
end $$;
-- 0156 · Mi calendario DARF (Diego 2026-11-20).
--   Cada persona tiene una liga privada (una por cuenta) para suscribirse desde Google Calendar, Apple Calendar u
--   Outlook. El calendario se actualiza solo y trae SOLO lo de esa persona:
--   * ensayos y llamados a los que está citada (los llamados de función ya son ensayos, 0127);
--   * funciones de las obras donde está (elenco o equipo) y funciones con boleto suyo;
--   * eventos del Club Fan con su lugar u orden; su turno de audición.
--   La liga se puede cambiar (la anterior deja de servir). Quien tenga la liga solo puede VER esos eventos.
-- Precede: 0155. No borra datos.


create table if not exists calendario_ligas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table calendario_ligas enable row level security;
revoke all on calendario_ligas from anon, authenticated;

-- Mi liga (la crea si no hay). p_nueva: cambiarla; la anterior deja de servir.
create or replace function mi_calendario_liga(p_nueva boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare tk text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); actual text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select token into actual from calendario_ligas where user_id = auth.uid();
  if actual is not null and not coalesce(p_nueva, false) then return actual; end if;
  insert into calendario_ligas (user_id, token) values (auth.uid(), tk)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return tk;
end $$;
revoke all on function mi_calendario_liga(boolean) from public, anon;
grant execute on function mi_calendario_liga(boolean) to authenticated;

-- Los eventos de la persona dueña de la liga (para el archivo del calendario). Sin liga válida: nada.
create or replace function calendario_eventos(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; desde timestamptz := now() - interval '60 days'; hasta timestamptz := now() + interval '400 days';
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select user_id into uid from calendario_ligas where token = p_token;
  if uid is null then return null; end if;
  return json_build_object(
    'nombre', (select coalesce(nullif(btrim(nombre), ''), 'DARF') from profiles where id = uid),
    'eventos', coalesce((select json_agg(x order by x.inicia) from (
      -- Ensayos y llamados a los que está citada.
      select 'ensayo-' || r.id as uid, 'Ensayo: ' || r.titulo || ' · ' || p.nombre as titulo, r.inicia, r.termina, r.lugar,
             r.notas as detalle, '/cuenta/produccion/' || r.production_id as ruta
        from rehearsals r join productions p on p.id = r.production_id
       where r.inicia between desde and hasta and coalesce(r.estado, '') <> 'cancelado' and rehearsal_cites(r.id, uid)
      union all
      -- Funciones de las obras donde está (elenco o equipo).
      select 'funcion-' || pf.id, 'Función: ' || p.nombre, pf.starts_at, pf.termina_at, coalesce(pf.venue, p.venue),
             null, '/cuenta/produccion/' || p.id
        from performances pf join productions p on p.id = pf.production_id
       where pf.starts_at between desde and hasta and pf.cancelada_at is null and p.estado <> 'archivada'
         and (exists (select 1 from production_members m where m.production_id = p.id and m.user_id = uid and m.role_id = 'integrante')
              or es_equipo(p.id, uid))
      union all
      -- Funciones con boleto suyo (si no está ya como elenco o equipo de esa obra).
      select distinct on (o.performance_id) 'orden-' || o.order_code, p.nombre || ' · DARF Productions', pf.starts_at, pf.termina_at,
             coalesce(pf.venue, p.venue), 'Orden ' || o.order_code || '. Tus boletos con QR están en Mi cuenta.', '/cuenta'
        from orders o join performances pf on pf.id = o.performance_id join productions p on p.id = pf.production_id
       where o.buyer_user_id = uid and o.status = 'aprobado' and pf.starts_at between desde and hasta and pf.cancelada_at is null
         and not exists (select 1 from production_members m where m.production_id = p.id and m.user_id = uid and m.role_id = 'integrante')
         and not es_equipo(p.id, uid)
      union all
      -- Eventos del Club Fan con su lugar u orden aprobada.
      select 'evento-' || e.id, evento_nombre(e), evento_cuando(e), e.termina, case when e.tipo = 'en_linea' then 'En línea' else e.lugar end,
             null, '/cuenta/eventos'
        from fan_encuentros e
       where e.cancelado_at is null and evento_cuando(e) between desde and hasta
         and (exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = uid)
              or exists (select 1 from evento_ordenes x where x.encuentro_id = e.id and x.user_id = uid and x.status = 'aprobado'))
      union all
      -- Su turno de audición.
      select 'audicion-' || a.id, 'Audición: ' || au.titulo, s.inicia, null, coalesce(s.sala, au.sede),
             null, '/cuenta'
        from audition_applications a join auditions au on au.id = a.audition_id join audition_slots s on s.id = a.slot_id
       where a.user_id = uid and a.estado not in ('cancelado', 'no_cumple') and s.inicia between desde and hasta
    ) x), '[]'::json));
end $$;
revoke all on function calendario_eventos(text) from public;
grant execute on function calendario_eventos(text) to anon, authenticated;

select 'Listo: 0156 aplicada (Mi calendario DARF).' as resultado;
