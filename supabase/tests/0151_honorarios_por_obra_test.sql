-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0151 aplicadas.
-- 0151: marcar pagado con comprobante, quién ve el comprobante y «Ya me llegó».
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000001510c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t151c@test.local'),
  ('00000000-0000-0000-0000-0000001510e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t151p@test.local'),
  ('00000000-0000-0000-0000-0000001510e3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t151o@test.local');
insert into panel_roles (id, nombre, alcance, categoria) values ('t151_x','X','casa','casa');
insert into casa_members (user_id, role_id) values ('00000000-0000-0000-0000-0000001510c1','t151_x');
insert into casa_cargos (user_id, directivo) values ('00000000-0000-0000-0000-0000001510c1', true);
insert into people (id, nombre, profile_id) values ('00000000-0000-0000-0000-0000001510f1','Profe 151','00000000-0000-0000-0000-0000001510e2');
insert into hon_meses (periodo, total_pagado, reserva_mes, resultado) values ('2026-10-01', 100, 0, '{}');
insert into hon_mes_personas (periodo, person_id, nombre, pago, bruto, partes) values ('2026-10-01','00000000-0000-0000-0000-0000001510f1','Profe 151',100,100,'[]');
create function pg_temp.yo(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); perform set_config('role','authenticated',true); end $$;
do $$ begin
  perform pg_temp.yo('00000000-0000-0000-0000-0000001510e2');
  begin perform hon_ya_me_llego('2026-10-01'); raise exception 'FALLO: confirmó sin pago'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform hon_marcar_pagado('2026-10-01','00000000-0000-0000-0000-0000001510f1','2026-10/00000000-0000-0000-0000-0000001510f1/a.webp'); raise exception 'FALLO: profe marcó'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.yo('00000000-0000-0000-0000-0000001510c1');
  begin perform hon_marcar_pagado('2026-10-01','00000000-0000-0000-0000-0000001510f1','otra/ruta.webp'); raise exception 'FALLO: ruta mala'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Sin foto también se marca pagado (el comprobante es opcional); la foto se puede subir después.
  perform hon_marcar_pagado('2026-10-01','00000000-0000-0000-0000-0000001510f1', null);
  if (select pagado_at is null or comprobante_path is not null from hon_mes_personas where periodo = '2026-10-01') then raise exception 'FALLO: pagado sin foto'; end if;
  perform hon_marcar_pagado('2026-10-01','00000000-0000-0000-0000-0000001510f1','2026-10/00000000-0000-0000-0000-0000001510f1/a.webp');
  if not hon_puede_ver_comprobante('2026-10/00000000-0000-0000-0000-0000001510f1/a.webp') then raise exception 'FALLO: cabeza no ve'; end if;
  perform pg_temp.yo('00000000-0000-0000-0000-0000001510e2');
  if not hon_puede_ver_comprobante('2026-10/00000000-0000-0000-0000-0000001510f1/a.webp') then raise exception 'FALLO: dueña no ve'; end if;
  perform hon_ya_me_llego('2026-10-01');
  perform pg_temp.yo('00000000-0000-0000-0000-0000001510e3');
  if hon_puede_ver_comprobante('2026-10/00000000-0000-0000-0000-0000001510f1/a.webp') or hon_puede_ver_comprobante('basura') then raise exception 'FALLO: otro ve'; end if;
  raise notice '0151 OK';
end $$;
rollback;
