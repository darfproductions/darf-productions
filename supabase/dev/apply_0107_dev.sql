-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0107: elenco "No publicado" (Reparto y Ensamble se publican cuando tú quieras). Requiere 0106.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.elenco_dar_acceso(uuid)') is null then
    raise exception 'ABORTADO: primero corre apply_0106_dev.sql.';
  end if;
end $$;
begin;

alter table production_credits add column if not exists publicado boolean not null default true;

-- Reparto y Ensamble nuevos (panel, oferta aceptada, obra duplicada) entran sin publicar.
create or replace function credito_sin_publicar() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tipo in ('reparto', 'ensamble') then new.publicado := false; end if;
  return new;
end $$;

drop trigger if exists credito_sin_publicar on production_credits;
create trigger credito_sin_publicar before insert on production_credits
  for each row execute function credito_sin_publicar();

-- ──────── Lo público solo ve créditos publicados ────────
-- El equipo de la obra (production_credits_team_read) y quien la edita (production_credits_editor_write)
-- siguen viendo todo.
drop policy if exists production_credits_read on production_credits;
create policy production_credits_read on production_credits for select
  using ((production_is_visible(production_id) and publicado) or is_staff());

drop policy if exists people_read on people;
create policy people_read on people for select
  using (
    is_staff()
    or exists (select 1 from production_credits c
               where c.person_id = people.id and c.publicado and production_is_visible(c.production_id))
  );

-- Perfil profesional público: créditos DARF solo publicados.
create or replace function pro_darf_credits(pid uuid)
returns table (production_id text, obra text, tipo text, papel text)
language sql stable security definer set search_path = public as $$
  select c.production_id, p.nombre, c.tipo, c.papel
    from production_credits c join productions p on p.id = c.production_id
   where c.person_id = pid and c.publicado and production_is_visible(c.production_id)
     and (pro_is_public(pid) or can_edit_pro_profile(pid))
   order by p.created_at desc
$$;

-- Retratos y enlaces de la página de la obra: solo de quien ya salió.
create or replace function production_pro_info(pid text)
returns table (person_id uuid, retrato_path text, slug text)
language sql stable security definer set search_path = public as $$
  select distinct c.person_id,
         case when pro_is_public(c.person_id) then p.retrato_path end,
         case when pro_is_public(c.person_id) then p.slug end
    from production_credits c join pro_profiles p on p.person_id = c.person_id
   where c.production_id = pid and c.publicado and production_is_visible(pid)
$$;

-- Cifras del inicio: el talento cuenta solo lo publicado.
create or replace function public_stats() returns json
language sql stable security definer set search_path = public as $$
  with obras as (
    select id from productions where estado in ('publicada', 'archivada')
  )
  select json_build_object(
    'producciones', (select count(*) from obras),
    'funciones', (select count(*) from performances pf join obras o on o.id = pf.production_id where pf.starts_at < now()),
    'talento', (select count(distinct c.person_id) from production_credits c join obras o on o.id = c.production_id where c.activo and c.publicado),
    'boletos', (select count(*) from tickets t join orders r on r.id = t.order_id join performances pf on pf.id = t.performance_id
                 join obras o on o.id = pf.production_id where r.status = 'aprobado')
  )
$$;

commit;

select 'Listo 0107. Créditos publicados: ' || count(*) filter (where publicado) || ' de ' || count(*) as resultado from production_credits;
