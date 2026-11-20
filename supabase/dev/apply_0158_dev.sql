-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0158: Audiciones en Mi calendario para el equipo (horario del equipo) y callbacks.
-- Correr DESPUÉS de apply_0157_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'rehearsals' and column_name = 'sin_asistencia') then
    raise exception 'ABORTADO: primero corre apply_0157_dev.sql.';
  end if;
end $$;
-- 0158 · Audiciones en Mi calendario para el equipo (Diego 2026-11-20).
-- 0158 · Audiciones en Mi calendario para el equipo (Diego 2026-11-20).
--   * "Horario del equipo" de cada audición (audition_jornadas): fecha, de qué hora a qué hora, lugar y nota. Es lo que
--     ve en su calendario quien está en el equipo de esa audición (juez, host, recepción o quien las gestiona).
--   * Si no se configura, cada día de audición sale de la primera a la última hora de los horarios de inscripción.
--   * También el callback (si es en otra fecha), para el equipo y para quien fue llamado. Los ensayos y llamados salen con
--     su título tal cual ("Montaje · Showman", "Ensayo general · Showman"). El turno del aspirante ahora
--     lleva su hora de fin (0140).
-- Precede: 0157. No borra datos.


create table if not exists audition_jornadas (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  inicia timestamptz not null,
  termina timestamptz not null,
  lugar text check (lugar is null or length(lugar) <= 200),
  nota text check (nota is null or length(nota) <= 200),
  created_at timestamptz not null default now(),
  check (termina > inicia)
);
create index if not exists audition_jornadas_aud_idx on audition_jornadas(audition_id, inicia);

-- ¿Está en el equipo de la audición? (de la convocatoria o de la obra, con algún permiso de audiciones)
create or replace function audition_es_del_equipo(aid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from audition_members m where m.audition_id = aid and m.user_id = uid)
      or exists (select 1 from auditions au join production_members pm on pm.production_id = au.production_id
                   join role_permissions rp on rp.role_id = pm.role_id
                  where au.id = aid and pm.user_id = uid
                    and rp.permission_id in ('audiciones.gestionar', 'audiciones.evaluar', 'audiciones.entrevista', 'audiciones.registro'))
$$;
revoke all on function audition_es_del_equipo(uuid, uuid) from public, anon;

alter table audition_jornadas enable row level security;
drop policy if exists audition_jornadas_read on audition_jornadas;
create policy audition_jornadas_read on audition_jornadas for select to authenticated
  using (audition_perm(audition_id, 'audiciones.gestionar') or audition_es_del_equipo(audition_id, auth.uid()));
drop policy if exists audition_jornadas_write on audition_jornadas;
create policy audition_jornadas_write on audition_jornadas for all to authenticated
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
revoke all on audition_jornadas from anon;

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
      select 'ensayo-' || r.id as uid, r.titulo || ' · ' || p.nombre as titulo, r.inicia, r.termina, r.lugar,
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
      -- Su turno de audición (con hora de fin si el horario la tiene, 0140).
      select 'audicion-' || a.id, 'Audición: ' || au.titulo, s.inicia, s.termina, coalesce(s.sala, au.sede),
             null, '/cuenta'
        from audition_applications a join auditions au on au.id = a.audition_id join audition_slots s on s.id = a.slot_id
       where a.user_id = uid and a.estado not in ('cancelado', 'no_cumple') and s.inicia between desde and hasta
      union all
      -- 0158: su callback, si lo llamaron y es en otra fecha.
      select 'callback-' || a.id, 'Callback: ' || au.titulo, au.callback_fecha, null, coalesce(au.callback_lugar, au.sede),
             null, '/cuenta'
        from audition_applications a join auditions au on au.id = a.audition_id
       where a.user_id = uid and a.ronda >= 2 and a.estado not in ('cancelado', 'no_cumple')
         and au.callback_cuando = 'otra_fecha' and au.callback_fecha between desde and hasta
      union all
      -- 0158: audiciones donde está en el equipo (juez, host, recepción o quien las gestiona): su horario del equipo; si no
      -- se configuró, cada día de la primera a la última hora de los horarios.
      select 'audicion-equipo-' || j.id, 'Audición (equipo): ' || au.titulo || ' · ' || p.nombre, j.inicia, j.termina,
             coalesce(j.lugar, au.sede), j.nota, '/panel/audiciones/' || au.id
        from audition_jornadas j join auditions au on au.id = j.audition_id join productions p on p.id = au.production_id
       where j.inicia between desde and hasta and au.estado <> 'borrador' and not au.permanente and audition_es_del_equipo(au.id, uid)
      union all
      select 'audicion-dia-' || au.id || '-' || d.dia, 'Audición (equipo): ' || au.titulo || ' · ' || p.nombre, d.ini, d.fin,
             au.sede, 'Horario según los turnos de inscripción.', '/panel/audiciones/' || au.id
        from auditions au join productions p on p.id = au.production_id
        cross join lateral (
          select (s.inicia at time zone 'America/Mexico_City')::date as dia, min(s.inicia) as ini,
                 max(coalesce(s.termina, s.inicia + interval '30 minutes')) as fin
            from audition_slots s where s.audition_id = au.id group by 1) d
       where d.ini between desde and hasta and au.estado <> 'borrador' and not au.permanente
         and not exists (select 1 from audition_jornadas j where j.audition_id = au.id)
         and audition_es_del_equipo(au.id, uid)
      union all
      select 'callback-equipo-' || au.id, 'Callback (equipo): ' || au.titulo || ' · ' || p.nombre, au.callback_fecha, null,
             coalesce(au.callback_lugar, au.sede), null, '/panel/audiciones/' || au.id
        from auditions au join productions p on p.id = au.production_id
       where au.callback_cuando = 'otra_fecha' and au.callback_fecha between desde and hasta and au.estado <> 'borrador'
         and not au.permanente and audition_es_del_equipo(au.id, uid)
    ) x), '[]'::json));
end $$;
revoke all on function calendario_eventos(text) from public;
grant execute on function calendario_eventos(text) to anon, authenticated;

select 'Listo: 0158 aplicada (audiciones en el calendario del equipo).' as resultado;
