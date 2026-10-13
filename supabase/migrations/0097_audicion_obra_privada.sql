-- 0097: Audiciones públicas de una obra privada (2026-10-13).
--   * Una obra en borrador u oculta no sale en la página, pero sus convocatorias sí. Para que la
--     convocatoria muestre el nombre y los colores de la obra (sin abrir su página), esta función
--     da solo el nombre y el kit de la obra de una convocatoria pública (o al equipo de la audición).
--   * "publica" dice si la página de la obra se puede ver (para poner o no la liga).
-- Precede: 0096.

begin;

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
