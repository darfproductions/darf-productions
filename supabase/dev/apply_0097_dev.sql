-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base oficial de la 2.0).
-- 0097: Audiciones públicas de una obra privada (nombre y colores sin abrir su página). Requiere 0096.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create or replace function audition_obra(aid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
           'nombre', p.nombre,
           'publica', p.estado in ('publicada', 'archivada'),
           'color_fondo', p.color_fondo, 'color_superficie', p.color_superficie,
           'color_texto', p.color_texto, 'color_acento', p.color_acento,
           'logo_path', p.logo_path, 'ambiente_path', p.ambiente_path, 'frase', p.frase)
    from auditions a join productions p on p.id = a.production_id
   where a.id = aid and (audition_is_public(aid) or audition_team(aid))
$$;
revoke execute on function audition_obra(uuid) from public;
grant execute on function audition_obra(uuid) to anon, authenticated;

commit;
