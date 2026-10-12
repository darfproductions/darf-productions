-- 0073 · Idioma en la ficha y cifras públicas para Nosotros (bloque "funciones de la propuesta").
-- Aditiva: una columna y una función de solo lectura.

-- Idioma de la obra (se muestra en la ficha si se llena).
alter table public.productions add column if not exists idioma text;
alter table public.productions drop constraint if exists productions_idioma_len;
alter table public.productions add constraint productions_idioma_len check (idioma is null or char_length(idioma) <= 60);

-- Cifras de DARF (solo obras públicas): producciones, funciones ya presentadas,
-- personas en escena y detrás, y boletos de órdenes aprobadas. Sin datos personales.
create or replace function public.public_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with obras as (
    select id from productions where estado in ('publicada', 'archivada')
  )
  select json_build_object(
    'producciones', (select count(*) from obras),
    'funciones', (select count(*) from performances pf join obras o on o.id = pf.production_id where pf.starts_at < now()),
    'talento', (select count(distinct c.person_id) from production_credits c join obras o on o.id = c.production_id where c.activo),
    'boletos', (select count(*) from tickets t join orders r on r.id = t.order_id join performances pf on pf.id = t.performance_id
                 join obras o on o.id = pf.production_id where r.status = 'aprobado')
  )
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;

-- Entrar con Google: Google manda el nombre como full_name / name (no "nombre").
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, nombre, rol)
  values (new.id,
          left(nullif(btrim(coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')), ''), 120),
          'fan');
  return new;
end;
$$;
