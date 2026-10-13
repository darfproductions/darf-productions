-- 0082: eventos en la portada y en el menú (Diego 2026-10-12). Para que la gente se entere de los
-- eventos aunque sean del Club Fan o pidan cuenta, la portada y /eventos muestran un "escaparate":
-- nombre, tipo, fecha, obra, lugar y para quién es. Nunca la liga de un evento en línea ni la lista
-- de personas; para apartar o entrar sigue mandando fan_encuentros_lista (0081).
-- Precede: 0081. Solo agrega una función.

begin;

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
