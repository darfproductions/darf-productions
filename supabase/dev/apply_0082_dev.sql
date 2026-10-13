-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0082: escaparate de próximos eventos (portada y /eventos). Solo agrega una función. Requiere 0081.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create or replace function eventos_cartelera(p_limite int default 6)
returns table (id uuid, production_id text, obra text, tipo text, categoria text, titulo text, lugar text,
               starts_at timestamptz, termina timestamptz, acceso text, requiere_registro boolean, en_vivo boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, pr.nombre, e.tipo, e.categoria, evento_nombre(e),
         case when e.tipo = 'en_linea' then null else coalesce(e.lugar, pf.venue, pr.venue) end,
         evento_cuando(e), evento_fin(e), e.acceso, e.requiere_registro,
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e)
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
   where (e.production_id is null or production_is_visible(e.production_id))
     and evento_fin(e) > now()
   order by evento_cuando(e)
   limit greatest(1, least(coalesce(p_limite, 6), 50))
$$;
revoke execute on function eventos_cartelera(int) from public;
grant execute on function eventos_cartelera(int) to anon, authenticated;

commit;
