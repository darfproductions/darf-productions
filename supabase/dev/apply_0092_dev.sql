-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0092: avisos personales (comunicados y ensayos al elenco; resultados de audición al aspirante). Requiere 0091.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create or replace function _sin_repetir(uids uuid[], p_titulo text, p_pid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(u), '{}') from unnest(uids) u
   where not exists (select 1 from notifications n where n.user_id = u and n.titulo = p_titulo
                       and n.production_id is not distinct from p_pid and n.created_at > now() - interval '2 minutes')
$$;

create or replace function notify_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare uids uuid[];
begin
  begin
    select array_agg(distinct m.user_id) into uids
      from production_members m
     where m.production_id = new.production_id and m.role_id = 'integrante'
       and audience_includes(new.production_id, m.user_id, new.audiencia, new.grupos, new.personas);
    perform notify(coalesce(uids, '{}'), 'elenco', case when new.importante then 'Comunicado importante' else 'Nuevo comunicado' end,
      concat_ws(' · ', new.titulo, production_name(new.production_id)), '/cuenta/produccion/' || new.production_id, new.production_id);
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notify_announcement on announcements;
create trigger notify_announcement after insert on announcements for each row execute function notify_announcement();

create or replace function _citados(r rehearsals) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
    from production_members m
   where m.production_id = r.production_id and m.role_id = 'integrante'
     and is_active_member(r.production_id, m.user_id)
     and (r.convocatoria = 'todos'
          or (r.convocatoria = 'grupos' and r.grupos && member_groups(r.production_id, m.user_id))
          or (r.convocatoria = 'personas' and m.user_id = any(r.personas)))
$$;

create or replace function notify_rehearsal() returns trigger
language plpgsql security definer set search_path = public as $$
declare titulo text; detalle text; uids uuid[];
begin
  begin
    if tg_op = 'INSERT' then
      if new.inicia < now() or new.estado = 'cancelado' then return new; end if;
      -- De una serie, solo avisa el primer ensayo (por fecha), aunque se creen todos juntos.
      if new.serie_id is not null and exists (select 1 from rehearsals x where x.serie_id = new.serie_id and (x.inicia, x.id) < (new.inicia, new.id)) then return new; end if;
      titulo := case when new.serie_id is not null then 'Nuevos ensayos en tu calendario' else 'Nuevo ensayo' end;
      detalle := concat_ws(' · ', new.titulo, cuando_mx(new.inicia) || case when new.serie_id is not null then ' (y los siguientes de la serie)' else '' end, new.lugar);
    elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
      if new.inicia < now() then return new; end if;
      titulo := 'Se canceló un ensayo';
      detalle := concat_ws(' · ', new.titulo, cuando_mx(new.inicia));
    elsif new.estado <> 'cancelado' and (new.inicia is distinct from old.inicia or new.lugar is distinct from old.lugar) then
      if new.inicia < now() then return new; end if;
      titulo := 'Cambió un ensayo';
      detalle := concat_ws(' · ', new.titulo, 'Ahora: ' || cuando_mx(new.inicia), new.lugar);
    else
      return new;
    end if;
    uids := _sin_repetir(_citados(new), titulo, new.production_id);
    perform notify(uids, 'elenco', titulo, detalle, '/cuenta/produccion/' || new.production_id, new.production_id);
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notify_rehearsal on rehearsals;
create trigger notify_rehearsal after insert or update of estado, inicia, lugar on rehearsals for each row execute function notify_rehearsal();

create or replace function notify_application_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare a auditions%rowtype; titulo text; detalle text;
begin
  begin
    if new.user_id is null or new.estado is not distinct from old.estado then return new; end if;
    select * into a from auditions where id = new.audition_id;
    -- Con votación (0089) la etapa ya manda sus avisos (callback, ofertas, "gracias por audicionar").
    if coalesce(a.fase, 'audicion') <> 'audicion' then return new; end if;
    case new.estado
      when 'convocado' then titulo := 'Te convocamos a audicionar';
        detalle := concat_ws(' · ', a.titulo, (select cuando_mx(s.inicia) from audition_slots s where s.id = new.slot_id));
      when 'en_espera' then titulo := 'Estás en lista de espera'; detalle := a.titulo;
      when 'callback' then titulo := '¡Pasaste a callback!'; detalle := a.titulo;
      when 'seleccionado' then titulo := '¡Quedaste seleccionado!'; detalle := concat_ws(' · ', a.titulo, 'Pronto te contactamos con los siguientes pasos.');
      when 'no_seleccionado' then titulo := 'Gracias por audicionar';
        detalle := concat_ws(' · ', a.titulo, 'Esta vez no quedaste. ¡Te esperamos en la próxima convocatoria!');
      else return new;
    end case;
    perform notify(array[new.user_id], 'audicion', titulo, detalle, '/audiciones/' || a.id, a.production_id);
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists notify_application_estado on audition_applications;
create trigger notify_application_estado after update of estado on audition_applications for each row execute function notify_application_estado();

revoke execute on function _sin_repetir(uuid[], text, text), _citados(rehearsals), notify_announcement(), notify_rehearsal(), notify_application_estado()
  from public, anon, authenticated;


commit;
