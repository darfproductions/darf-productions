-- 0165 · Separar de un grupo y que no se vuelva a juntar (Diego 2026-11-24).
--   "Cambiar el orden" junta primero en un turno a quienes se mencionaron en «¿Con quién pasas?» (0140). Si alguien se
--   separó a mano, al reordenar se volvía a juntar. Ahora "Separar" lo marca (no_juntar) y ya no se junta solo; si se le
--   junta a mano con "Pasan juntos", la marca se quita.
-- Precede: 0164. No borra datos.

begin;

alter table audition_applications add column if not exists no_juntar boolean not null default false;

create or replace function audition_agrupar(aid uuid, p_apps uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); au auditions;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  if coalesce(cardinality(p_apps), 0) < 2 then raise exception 'Palomea al menos a 2 personas para que pasen juntas.'; end if;
  select * into au from auditions where id = aid for update;
  if (select count(*) from audition_applications where audition_id = aid and id = any(p_apps) and estado not in ('cancelado', 'no_cumple'))
     <> cardinality(p_apps) then
    raise exception 'Alguna de las personas no es de esta audición.';
  end if;
  if exists (select 1 from audition_applications where id = any(p_apps) and entered_at is not null) then
    raise exception 'Alguna de las personas ya pasó: solo se juntan quienes aún no pasan.';
  end if;
  -- 0165: juntar a mano quita la marca de "no juntar".
  update audition_applications set grupo_turno = g, no_juntar = false, updated_at = now() where id = any(p_apps);
  update audition_applications x set grupo_turno = null
   where x.audition_id = aid and x.grupo_turno is not null and x.grupo_turno <> g
     and (select count(*) from audition_applications y where y.grupo_turno = x.grupo_turno) < 2;
  perform _audition_renumerar(aid, null);
  return g;
end $$;

create or replace function audition_separar(aid uuid, app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  select grupo_turno into g from audition_applications where id = app and audition_id = aid for update;
  if g is null then return; end if;
  -- 0165: queda marcado para que "Cambiar el orden" ya no lo vuelva a juntar solo.
  update audition_applications set grupo_turno = null, no_juntar = true, updated_at = now() where id = app;
  if (select count(*) from audition_applications where grupo_turno = g) < 2 then
    update audition_applications set grupo_turno = null, updated_at = now() where grupo_turno = g;
  end if;
  perform _audition_renumerar(aid, null);
end $$;

-- Quiénes se separaron a mano (para no juntarlos solos al reordenar).
create or replace function audition_no_juntar(aid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when audition_puede_fila(aid)
    then coalesce((select array_agg(id) from audition_applications where audition_id = aid and no_juntar), '{}') end
$$;
revoke all on function audition_no_juntar(uuid) from public, anon;
grant execute on function audition_no_juntar(uuid) to authenticated;

commit;
