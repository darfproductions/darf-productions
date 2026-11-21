-- 0160 · Aviso de expediente incompleto para el equipo (Diego 2026-11-21).
--   A quien tiene créditos en DARF le sale un aviso en sus notificaciones (panel y Mi cuenta) mientras a su expediente
--   personal le falte algo. Es obligatorio todo menos las medidas de vestuario: fecha de nacimiento, teléfono, género,
--   contacto de emergencia (nombre, teléfono y parentesco), alergias, condiciones médicas, medicamentos y tipo de
--   sangre ("Ninguna" cuenta como respuesta); y, si es menor de edad, los datos de su madre, padre o tutor.
-- Precede: 0159. No borra datos.

begin;

-- Lo que le falta al expediente de una persona (nombres para mostrar). Vacío = completo.
create or replace function expediente_falta(uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  with f as (select * from person_files where user_id = uid),
       nac as (select coalesce((select fecha_nacimiento from profiles where id = uid), (select fecha_nacimiento from f)) as d),
       vacio as (select x.etiqueta from (values
         ('Fecha de nacimiento', (select d from nac) is null),
         ('Teléfono', coalesce(btrim((select telefono from f)), '') = ''),
         ('Género', (select genero from f) is null),
         ('Contacto de emergencia: nombre', coalesce(btrim((select emergencia_nombre from f)), '') = ''),
         ('Contacto de emergencia: teléfono', coalesce(btrim((select emergencia_telefono from f)), '') = ''),
         ('Contacto de emergencia: parentesco', coalesce(btrim((select emergencia_parentesco from f)), '') = ''),
         ('Alergias', coalesce(btrim((select alergias from f)), '') = ''),
         ('Condiciones médicas o lesiones', coalesce(btrim((select condiciones from f)), '') = ''),
         ('Medicamentos', coalesce(btrim((select medicamentos from f)), '') = ''),
         ('Tipo de sangre', coalesce(btrim((select tipo_sangre from f)), '') = ''),
         ('Madre, padre o tutor: nombre', (select d from nac) > current_date - interval '18 years' and coalesce(btrim((select tutor_nombre from f)), '') = ''),
         ('Madre, padre o tutor: teléfono', (select d from nac) > current_date - interval '18 years' and coalesce(btrim((select tutor_telefono from f)), '') = ''),
         ('Madre, padre o tutor: correo', (select d from nac) > current_date - interval '18 years' and coalesce(btrim((select tutor_email from f)), '') = '')
       ) x(etiqueta, falta) where x.falta)
  select coalesce(array_agg(etiqueta), '{}') from vacio
$$;
revoke all on function expediente_falta(uuid) from public, anon, authenticated;

-- Mi aviso: solo si tengo créditos en DARF. null = no aplica; vacío = completo.
create or replace function mi_expediente_falta() returns text[]
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and exists (
                select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = auth.uid())
              then expediente_falta(auth.uid()) end
$$;
revoke all on function mi_expediente_falta() from public, anon;
grant execute on function mi_expediente_falta() to authenticated;

-- Mi expediente (para llenarlo desde Mi cuenta, sin entrar a una obra).
create or replace function mi_expediente() returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null then (
    select row_to_json(x) from (
      select f.*, coalesce(p.fecha_nacimiento, f.fecha_nacimiento) as fecha_nacimiento_cuenta
        from profiles p left join person_files f on f.user_id = p.id where p.id = auth.uid()) x) end
$$;
revoke all on function mi_expediente() from public, anon;
grant execute on function mi_expediente() to authenticated;

commit;
