-- 0134 (Diego 2026-11-03): revisar cada solicitud de audición.
--   * Toda solicitud nueva queda "En revisión" (estado inscrito). Quien gestiona la revisa:
--       - Aprobar → pasa a la lista de quienes audicionan (convocado) y le llega el aviso.
--       - Regresar con nota ("te falta la foto", "pon tu experiencia"…) → le llega el aviso con la nota y puede corregir
--         aunque la inscripción ya haya cerrado (lo mismo que "pedir que complete", 0133). Al guardar vuelve a revisión.
--   * "Aprobar las completas": aprueba de una vez las que están en revisión y no les falta nada.
--   * El día de la audición, si llega alguien sin aprobar, la entrada lo registra igual pero avisa (sin_aprobar).
--   * El aviso por WhatsApp lo arma la web (liga con el mensaje listo); la base solo guarda la nota.
-- Precede: 0133.

begin;

alter table audition_applications add column if not exists completar_nota text check (length(completar_nota) <= 500);
alter table audition_applications add column if not exists revisada_at timestamptz;
alter table audition_applications add column if not exists revisada_por uuid references auth.users(id) on delete set null;

-- Aprobar o regresar una solicitud (quien gestiona la convocatoria).
create or replace function audition_revisar(aid uuid, app uuid, p_accion text, p_nota text default null) returns json
language plpgsql security definer set search_path = public as $$
declare au auditions; v audition_applications; nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  select * into v from audition_applications where id = app and audition_id = aid for update;
  if not found then raise exception 'Esa solicitud no es de esta convocatoria.'; end if;
  if v.checked_in_at is not null then raise exception 'Ya se registró en la audición: no se puede cambiar su solicitud.'; end if;
  if v.estado in ('cancelado') then raise exception 'La solicitud está cancelada.'; end if;

  if p_accion = 'aprobar' then
    update audition_applications set estado = case when estado in ('inscrito', 'en_espera', 'no_cumple') then 'convocado' else estado end,
           completar_pedido_at = null, completar_nota = null, revisada_at = now(), revisada_por = auth.uid(), updated_at = now()
     where id = app;
    if v.user_id is not null then
      begin
        perform notify(array[v.user_id], 'audicion', '¡Tu solicitud fue aprobada!',
          concat_ws(' · ', au.titulo, 'Ya estás en la lista para audicionar. Tu QR está en Mi cuenta.'), '/audiciones/' || aid, au.production_id);
      exception when others then null;
      end;
    end if;
  elsif p_accion = 'regresar' then
    if nota is null and cardinality(_audition_faltantes(v)) = 0 then raise exception 'Escribe qué tiene que corregir.'; end if;
    if length(nota) > 500 then raise exception 'La nota es muy larga (máximo 500 letras).'; end if;
    if v.user_id is null then raise exception 'Esta persona no tiene cuenta: avísale por WhatsApp.'; end if;
    update audition_applications set estado = case when estado in ('convocado', 'en_espera') then 'inscrito' else estado end,
           completar_pedido_at = now(), completar_nota = coalesce(nota, 'Falta: ' || array_to_string(_audition_faltantes(v), ', ')),
           revisada_at = now(), revisada_por = auth.uid(), updated_at = now()
     where id = app;
    begin
      perform notify(array[v.user_id], 'audicion', 'Te regresamos tu solicitud',
        concat_ws(' · ', au.titulo, coalesce(nota, 'Falta: ' || array_to_string(_audition_faltantes(v), ', '))), '/audiciones/' || aid, au.production_id);
    exception when others then null;
    end;
  else
    raise exception 'Acción no válida.';
  end if;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'revisar_' || p_accion, au.production_id, jsonb_build_object('estado', v.estado),
            jsonb_build_object('solicitud', app, 'nombre', v.nombre, 'nota', nota));
  return (select json_build_object('estado', estado, 'nota', completar_nota) from audition_applications where id = app);
end $$;
revoke all on function audition_revisar(uuid, uuid, text, text) from public, anon;
grant execute on function audition_revisar(uuid, uuid, text, text) to authenticated;

-- Aprobar de una vez las que están en revisión y no les falta nada (ni tienen un pedido de corrección abierto).
create or replace function audition_aprobar_completas(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  for r in select a.id from audition_applications a
            where a.audition_id = aid and a.estado = 'inscrito' and a.checked_in_at is null and a.completar_pedido_at is null
              and cardinality(_audition_faltantes(a)) = 0
  loop
    perform audition_revisar(aid, r.id, 'aprobar');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function audition_aprobar_completas(uuid) from public, anon;
grant execute on function audition_aprobar_completas(uuid) to authenticated;

-- "Pedir que completen" (0133) también guarda qué falta, para que la persona lo vea.
create or replace function audition_pedir_completar(aid uuid, p_apps uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; r record; n int := 0; texto text;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  if au.estado not in ('abierta', 'cerrada') then raise exception 'La convocatoria debe estar abierta o cerrada para pedir cambios.'; end if;
  for r in
    select a.id, a.user_id, _audition_faltantes(a) as faltan from audition_applications a
     where a.audition_id = aid and a.user_id is not null and a.checked_in_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (case when p_apps is null then cardinality(_audition_faltantes(a)) > 0 else a.id = any(p_apps) end)
  loop
    texto := case when cardinality(r.faltan) > 0 then 'Falta: ' || array_to_string(r.faltan, ', ') else 'Revisa y actualiza tus datos' end;
    update audition_applications set completar_pedido_at = now(), completar_nota = texto,
           estado = case when estado in ('convocado', 'en_espera') then 'inscrito' else estado end, updated_at = now()
     where id = r.id;
    n := n + 1;
    begin
      perform notify(array[r.user_id], 'audicion', 'Completa tu inscripción', concat_ws(' · ', au.titulo, texto), '/audiciones/' || aid, au.production_id);
    exception when others then null;
    end;
  end loop;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'pedir_completar', au.production_id, null, jsonb_build_object('audicion', aid, 'personas', n));
  return n;
end $$;
revoke all on function audition_pedir_completar(uuid, uuid[]) from public, anon;
grant execute on function audition_pedir_completar(uuid, uuid[]) to authenticated;

-- Llegada: igual que 0131, y avisa si la solicitud no está aprobada (se registra igual: nadie se queda en la puerta).
create or replace function audition_checkin(aid uuid, ref text) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications%rowtype; n int; r text := lower(btrim(coalesce(ref, ''))); au auditions;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = aid;
  select * into v from audition_applications
   where audition_id = aid and (qr_token::text = r or id::text = r) for update;
  if not found then return json_build_object('result', 'no_encontrado'); end if;
  if v.estado in ('cancelado', 'no_cumple') then
    return json_build_object('result', 'no_admitido', 'nombre', v.nombre, 'estado', v.estado);
  end if;
  if au.fase = 'callback' and v.estado <> 'callback' then
    return json_build_object('result', 'no_callback', 'nombre', v.nombre, 'numero', v.numero);
  end if;
  if v.checked_in_at is not null then
    return json_build_object('result', 'ya_registrado', 'nombre', v.nombre, 'numero', v.numero);
  end if;
  n := v.numero;
  if n is null or (au.numeracion = 'llegada' and au.fase <> 'callback') then
    perform 1 from auditions where id = aid for update;   -- numeración sin repetidos
    select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid and id <> v.id;
  end if;
  update audition_applications set checked_in_at = now(), checked_in_by = auth.uid(), numero = n, updated_at = now() where id = v.id;
  return json_build_object('result', 'ok', 'nombre', v.nombre, 'numero', n, 'es_menor', v.es_menor,
    'personajes', (select array_agg(ro.nombre order by ro.orden) from audition_roles ro where ro.id = any(v.roles)),
    'callback', au.fase = 'callback', 'sin_aprobar', v.estado = 'inscrito' and not v.walk_in);
end $$;
revoke execute on function audition_checkin(uuid, text) from public, anon;
grant execute on function audition_checkin(uuid, text) to authenticated;

commit;
