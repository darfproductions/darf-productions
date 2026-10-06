# Mapa interactivo de asientos (staff) — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas `- [ ]`.

**Goal:** Mostrar en Boletaje el mapa real de 725 asientos de Showman por función y permitir al admin bloquear, liberar, generar boleto y cancelar, y a staff/admin validar QR, todo contra Supabase.

**Architecture:** Migración `0021` agrega `seats.lado` y tres RPCs `security definer` con el rol validado dentro. El frontend (vanilla JS en `js/app.js`) carga asientos, bloqueos y tickets por función, pinta un mapa HTML por filas y bloques, y llama a las RPCs; bloquear/liberar son escrituras directas a `blocked_seats` (RLS solo admin).

**Tech Stack:** PostgreSQL/Supabase (RLS, plpgsql), cliente `sb` (supabase-js), JS vanilla sin build, CSS en `css/styles.css`.

**Spec:** [docs/superpowers/specs/2026-10-05-staff-interactive-seat-map-design.md](../specs/2026-10-05-staff-interactive-seat-map-design.md) (aprobado por Johann).

## Global Constraints

- Nunca ejecutar SQL de escritura/DDL contra Supabase sin mostrar el SQL exacto y recibir un "sí" explícito de Johann, una operación a la vez. Las lecturas (`select`) sí pueden correr libremente.
- No editar migraciones ya ejecutadas (0001–0020). Todo cambio va en `0021`.
- No exponer `service_role`, claves de Resend ni secretos. La clave anon/publishable puede estar en el frontend.
- Datos de BD en el DOM solo con `textContent` (nunca `innerHTML`).
- Las RPCs: `security definer`, `set search_path = public`, rol validado dentro, `revoke execute ... from public, anon`, `grant execute ... to authenticated`.
- Nada de datos falsos de asientos. El checkout público queda fuera de alcance y oculto.
- No editar `DARF_Productions.html` (legado abandonado).
- Commits pequeños y temáticos, `git add` con rutas explícitas (nunca `-A`; nunca `.claude/`), barrido de secretos antes de cada commit. **No commit ni push a menos que Johann lo pida.** Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Comunicación con Johann en español; para personas sin pronombres declarados, they/them.
- Respuestas de error de RPCs en español (`raise exception '…'`).

## Review Focus

- Dos admins venden el mismo asiento a la vez: el segundo debe fallar completo (todo-o-nada) y la UI recarga el mapa. → Task 1 (prueba de doble venta) y Task 4.
- Asiento bloqueado y luego intento de venderlo, o vendido y luego bloquearlo: la RPC rechaza el primero; el bloqueo de un asiento con ticket activo debe rechazarse en UI. → Task 1 y Task 4.
- Función con `starts_at` null y `on_sale = false` (estado real de Showman hoy): el mapa debe abrir y el admin poder vender; no se rompe por fecha nula. → Task 1 y Task 3.
- Nombre del comprador con `<script>`/comillas en tooltip y panel: se muestra literal, sin ejecutar. → Task 3.
- QR pegado con espacios, mayúsculas o texto que no es UUID: debe responder "no reconocido", no error 500. → Task 1 (`check_in_ticket` recibe `text`) y Task 5.
- Cancelar el único ticket de una orden: el total de la orden queda en 0 (lo recalcula el trigger) y el asiento vuelve a disponible. → Task 1.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0021_seat_map_rpcs.sql` (crear) | `seats.lado` + 3 RPCs |
| `supabase/tests/0021_seat_map_rpcs_test.sql` (crear) | Pruebas SQL en transacción con rollback; no se aplican, solo se corren con `rollback` |
| `js/app.js` (modificar) | Capa de datos del mapa, render, acciones, check-in, limpieza |
| `css/styles.css` (modificar) | `.smap-*` (mapa, franjas de zona, leyendas), retiro de `.staff-seatmap` |
| `index.html` (modificar) | Contenedores de Boletaje y de Vendedores |
| `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md` (modificar) | Documentación |

Convenciones del código existente (ES5 estilo `var`/`function`, un solo archivo `js/app.js`): seguir el mismo estilo. Funciones auxiliares ya disponibles: `clearEl(el)`, `flash(msg,'s'|'d'|'i')`, `sb` (cliente supabase), `AuthService.session.rol`, `boletajeSel={prod,perf}`, `fmtPerfDate(iso)`, `DB.getProductions()`, `DB.getPerformancesForProduction(id)`.

---

### Task 1: Migración 0021 (`seats.lado` + 3 RPCs) con pruebas SQL

**Files:**
- Create: `supabase/migrations/0021_seat_map_rpcs.sql`
- Create: `supabase/tests/0021_seat_map_rpcs_test.sql`

**Interfaces:**
- Produces (SQL):
  - `seats.lado text` ∈ `('izquierda','central','derecha')`, no nulo para los 725 asientos.
  - `admin_create_seated_order(target_performance_id uuid, target_buyer_nombre text, target_buyer_telefono text, target_seat_ids uuid[], target_seller_codigo text default null) returns json` → `{order_id, order_code, total, tickets:[{ticket_id, seat_id, seat_label, qr_token}]}`
  - `admin_cancel_ticket(target_ticket_id uuid) returns json` → `{ticket_id, seat_id, cancelled:true}`
  - `check_in_ticket(target_qr_token text) returns json` → `{result:'ok'|'ya_usado'|'no_encontrado'|'cancelado', seat_label, category, performance_starts_at, buyer_nombre, checked_in_at}`. **Recibe `text`** (no `uuid`) para que un QR mal formado devuelva `no_encontrado` en vez de error de cast (Review Focus).

Hechos verificados del esquema: `is_staff()` incluye a `admin`; `is_admin()` solo admin. `tickets.unit_price` es NOT NULL y las RPCs existentes lo insertan explícitamente desde `performance_price_categories`; el trigger `recompute_order_total` recalcula `orders.total` con tickets activos en insert/update/delete (así que cancelar recalcula solo). `orders.order_code` lo genera `trg_set_order_code` (no se manda). `orders.total` es NOT NULL (se manda el total calculado, como en 0015). Estados de orden: `pendiente`/`aprobado`/`rechazado` (enum `order_status`). `sellers(codigo)` guarda código normalizado; verificar la normalización con `select codigo from sellers limit 3` antes de escribir el lookup (el frontend usa `normCode`).

- [ ] **Step 1: Leer el normalizador de códigos de vendedor**

Run: `rg -n "function normCode" -A3 js/app.js`
Expected: muestra cómo se normaliza (probablemente `trim().toUpperCase()`). Usar la misma regla en SQL (`upper(btrim(...))`).

- [ ] **Step 2: Escribir la prueba SQL (falla: aún no existen las funciones)**

Crear `supabase/tests/0021_seat_map_rpcs_test.sql`. Corre dentro de una transacción y termina en `rollback`. Simula roles con `set local role authenticated` + `set_config('request.jwt.claims', ...)`. Usa un admin, un staff y un fan **temporales** insertados en `auth.users`/`profiles` dentro de la transacción (se descartan con el rollback). Estructura (cada bloque `do $$` lanza excepción si el resultado no es el esperado):

```sql
-- supabase/tests/0021_seat_map_rpcs_test.sql
-- Ejecutar SOLO dentro de esta transacción; termina en ROLLBACK (no persiste nada).
begin;

-- Usuarios temporales (se descartan con el rollback)
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local');
-- handle_new_user() crea los profiles como 'fan'; subimos roles:
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000b1';

-- Contexto: primera función de Showman y 3 asientos Preferente distintos
create temp table ctx as
select
  (select id from performances where production_id = 'showman' order by created_at limit 1) as perf,
  (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id='showman' and seat_label like 'Preferente-X-%' order by seat_number limit 3) q) as seats3;
grant select on ctx to authenticated, anon;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: fan y staff NO pueden crear orden
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'X', '1', (select seats3 from ctx));
    raise exception 'FALLO: fan pudo vender';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1 fan: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'X', '1', (select seats3 from ctx));
    raise exception 'FALLO: staff pudo vender';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1 staff: %', sqlerrm; end if;
  end;
end $$;

-- T2: admin vende (función NO está en venta), precio sale de la BD, orden aprobada
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := admin_create_seated_order((select perf from ctx), 'Ana <b>Test</b>', '5512345678', (select seats3 from ctx));
  if (r->>'total')::numeric <> 900 then raise exception 'FALLO T2 total esperado 900, fue %', r->>'total'; end if;
  if json_array_length(r->'tickets') <> 3 then raise exception 'FALLO T2 tickets'; end if;
  if (select status::text from orders where id = (r->>'order_id')::uuid) <> 'aprobado' then raise exception 'FALLO T2 status'; end if;
  perform set_config('t.order_id', r->>'order_id', true);
  perform set_config('t.ticket1', r->'tickets'->0->>'ticket_id', true);
  perform set_config('t.qr1', r->'tickets'->0->>'qr_token', true);
end $$;

-- T3: doble venta del mismo asiento falla completo (todo-o-nada)
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'Otro', '1', (select seats3 from ctx));
    raise exception 'FALLO T3: permitió doble venta';
  exception when others then
    if sqlerrm not like '%ya no está disponible%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
end $$;

-- T4: asiento bloqueado no se vende
do $$ declare s uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select id into s from seats where production_id='showman' and seat_label='Preferente-X-10';
  insert into blocked_seats (performance_id, seat_id) values ((select perf from ctx), s);
  begin
    perform admin_create_seated_order((select perf from ctx), 'Z', '1', array[s]);
    raise exception 'FALLO T4: vendió asiento bloqueado';
  exception when others then
    if sqlerrm not like '%bloqueado%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
end $$;

-- T5: check_in — staff valida; segunda vez ya_usado; basura no_encontrado
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  r := check_in_ticket(current_setting('t.qr1'));
  if r->>'result' <> 'ok' then raise exception 'FALLO T5 ok: %', r; end if;
  r := check_in_ticket(upper(current_setting('t.qr1')));
  if r->>'result' <> 'ya_usado' then raise exception 'FALLO T5 ya_usado: %', r; end if;
  r := check_in_ticket('  no-es-uuid ');
  if r->>'result' <> 'no_encontrado' then raise exception 'FALLO T5 basura: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform check_in_ticket(current_setting('t.qr1'));
    raise exception 'FALLO T5: fan pudo validar';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5 fan: %', sqlerrm; end if;
  end;
end $$;

-- T6: cancelar libera el asiento, recalcula total y check_in da cancelado
do $$ declare r json; tk uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform admin_cancel_ticket(current_setting('t.ticket1')::uuid);
    raise exception 'FALLO T6: staff pudo cancelar';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T6 staff: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_cancel_ticket(current_setting('t.ticket1')::uuid);
  if (select total from orders where id = current_setting('t.order_id')::uuid) <> 600 then
    raise exception 'FALLO T6: total debía bajar a 600'; end if;
  r := check_in_ticket(current_setting('t.qr1'));
  if r->>'result' <> 'cancelado' then raise exception 'FALLO T6 cancelado: %', r; end if;
  -- el asiento vuelve a poder venderse
  r := admin_create_seated_order((select perf from ctx), 'Re-venta', '1', array[(select seats3[1] from ctx)]);
end $$;

-- T7: anon no puede ejecutar nada
do $$ begin
  set local role anon;
  begin
    perform admin_cancel_ticket(gen_random_uuid());
    raise exception 'FALLO T7: anon ejecutó';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- T8: seats.lado completo y fila J correcta
do $$ begin
  reset role;
  if exists (select 1 from seats where production_id='showman' and lado is null) then raise exception 'FALLO T8: asientos sin lado'; end if;
  if (select count(*) from seats where production_id='showman' and lado='izquierda' and seat_label like 'Discapacitados-J-%') <> 3 then raise exception 'FALLO T8 disc izq'; end if;
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
```

Nota para el implementador: el formato exacto de `seat_label` (`Preferente-X-1`) y el id de producción (`'showman'`) están verificados contra `supabase/seeds/showman_seats.csv`; confirmar con `select seat_label from seats where production_id='showman' limit 3` (lectura) antes de correr. Los 3 asientos de ctx son de Preferente ($300 c/u → 900).

- [ ] **Step 3: Verificar que la prueba falla**

Con el MCP: `mcp__supabase__execute_sql` solo para la prueba SQL **tras recibir el "sí" de Johann** para correr el archivo (la prueba escribe dentro de una transacción con `rollback`, pero aun así es ejecución de escritura temporal; pedir aprobación del paso). Expected: FALLA con `function admin_create_seated_order(...) does not exist`.

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/0021_seat_map_rpcs.sql`:

```sql
-- 0021: seat map for staff Boletaje
-- 1) seats.lado: which block of the row a seat belongs to (left/center/right)
-- 2) admin_create_seated_order: admin-only sale that works regardless of on_sale
-- 3) admin_cancel_ticket: admin-only, frees a sold seat (history is kept)
-- 4) check_in_ticket: staff/admin QR validation (atomic)

-- ============================================================
-- 1. seats.lado
-- ============================================================
alter table seats
  add column if not exists lado text
  check (lado in ('izquierda','central','derecha'));

-- Cuts per row: (fin_izq, fin_centro). Seats > fin_centro are 'derecha'.
-- Source: supabase/seeds/gen_showman_seats.py
with cuts(seat_row, fin_izq, fin_centro) as (values
  ('X',12,12),('W',12,24),('V',11,22),('U',11,23),('T',11,22),('S',12,24),
  ('R',12,23),('Q',11,23),('P',11,22),('O',11,23),('N',12,23),('M',12,24),
  ('L',11,22),('K',11,23),('J',0,11),
  ('I',11,23),('H',10,21),('G',9,21),('F',10,21),('E',9,21),('D',9,20),
  ('C',8,19),('B',8,19),('A',8,19)
)
update seats s
set lado = case
  when s.seat_number <= c.fin_izq then 'izquierda'
  when s.seat_number <= c.fin_centro then 'central'
  else 'derecha' end
from cuts c
where s.production_id = 'showman'
  and s.seat_row = c.seat_row
  and s.section <> 'Zona Marrón';

-- Discapacitados (J1-J3 left, J4-J6 right), their own price category
update seats s
set lado = case when s.seat_number <= 3 then 'izquierda' else 'derecha' end
where s.production_id = 'showman' and s.section = 'Zona Marrón';

do $$
declare n integer;
begin
  select count(*) into n from seats where production_id = 'showman' and lado is null;
  if n <> 0 then raise exception '0021: % asientos de Showman sin lado', n; end if;
end $$;
```

Antes de escribirlo: **verificar con lecturas** (a) que los valores `seat_row`/`seat_number`/`section` coinciden con los cortes (`select section, seat_row, min(seat_number), max(seat_number), count(*) from seats where production_id='showman' group by 1,2 order by 1,2`), (b) los números de Discapacitados en J (si en la BD son 1–3 / 4–6 o son los números físicos de la fila). Si la numeración de Discapacitados no es 1–6, ajustar la regla de `lado` a la real (por ejemplo, usando el CSV). Corregir las cuñas de la query según lo que devuelva la lectura; el `do $$` final garantiza que no queda ningún asiento sin `lado`.

Continuar la migración con las RPCs:

```sql
-- ============================================================
-- 2. admin_create_seated_order
-- ============================================================
create or replace function admin_create_seated_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[],
  target_seller_codigo text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production_id text;
  v_seat_id uuid;
  v_price_category_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_total numeric(10,2);
  v_seller_id uuid;
  v_tickets json;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  if target_performance_id is null then raise exception 'La función es obligatoria'; end if;
  if target_buyer_nombre is null or btrim(target_buyer_nombre) = '' then
    raise exception 'El nombre del comprador es obligatorio'; end if;
  if target_buyer_telefono is null or btrim(target_buyer_telefono) = '' then
    raise exception 'El teléfono del comprador es obligatorio'; end if;
  if target_seat_ids is null or cardinality(target_seat_ids) < 1 then
    raise exception 'Debes seleccionar al menos un asiento'; end if;
  if cardinality(target_seat_ids) > 20 then
    raise exception 'No puedes seleccionar más de 20 asientos'; end if;
  if (select count(*) from unnest(target_seat_ids) s)
     <> (select count(distinct s) from unnest(target_seat_ids) s) then
    raise exception 'No puedes seleccionar el mismo asiento más de una vez'; end if;

  -- Performance must exist. on_sale is NOT required (admin sells at the box office).
  select pf.production_id into v_production_id
  from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;

  -- Optional seller
  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo));
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  -- Lock + validate every seat
  for v_seat_id in select unnest(target_seat_ids) loop
    perform 1 from seats where id = v_seat_id for update;
    if not found then raise exception 'Uno de los asientos seleccionados no existe'; end if;

    if not exists (select 1 from seats s where s.id = v_seat_id and s.production_id = v_production_id) then
      raise exception 'Uno de los asientos no pertenece a esta producción'; end if;
    if not exists (select 1 from seats s where s.id = v_seat_id and s.is_active) then
      raise exception 'Uno de los asientos seleccionados no está disponible'; end if;
    if exists (select 1 from blocked_seats bs where bs.performance_id = target_performance_id and bs.seat_id = v_seat_id) then
      raise exception 'Uno de los asientos seleccionados está bloqueado'; end if;
    if exists (select 1 from tickets t where t.performance_id = target_performance_id and t.seat_id = v_seat_id and t.is_active) then
      raise exception 'Uno de los asientos seleccionados ya no está disponible'; end if;

    select s.price_category_id into v_price_category_id from seats s where s.id = v_seat_id;
    if v_price_category_id is null then
      raise exception 'Uno de los asientos no tiene categoría de precio configurada'; end if;
    if not exists (
      select 1 from performance_price_categories ppc
      join price_categories pc on pc.id = ppc.price_category_id
      where ppc.performance_id = target_performance_id
        and ppc.price_category_id = v_price_category_id and pc.is_active
    ) then
      raise exception 'No existe un precio configurado para uno de los asientos seleccionados'; end if;
  end loop;

  select coalesce(sum(ppc.price), 0) into v_total
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id, created_by_staff_id,
                      approved_by, approved_at)
  values (target_performance_id, 'aprobado', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), null, v_total, v_seller_id,
          auth.uid(), auth.uid(), now())
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id, ppc.price, true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(json_build_object(
           'ticket_id', t.id, 'seat_id', t.seat_id,
           'seat_label', s.seat_label, 'qr_token', t.qr_token)
         order by s.seat_label)
  into v_tickets
  from tickets t join seats s on s.id = t.seat_id
  where t.order_id = v_order_id;

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'total', v_total, 'tickets', v_tickets);
end;
$$;

-- ============================================================
-- 3. admin_cancel_ticket
-- ============================================================
create or replace function admin_cancel_ticket(target_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_id uuid;
begin
  if not is_admin() then raise exception 'No autorizado'; end if;

  update tickets set is_active = false
  where id = target_ticket_id and is_active
  returning seat_id into v_seat_id;

  if not found then
    raise exception 'El boleto no existe o ya está cancelado';
  end if;

  return json_build_object('ticket_id', target_ticket_id, 'seat_id', v_seat_id, 'cancelled', true);
end;
$$;

-- ============================================================
-- 4. check_in_ticket
-- ============================================================
create or replace function check_in_ticket(target_qr_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_ticket record;
  v_updated integer;
begin
  if not is_staff() then raise exception 'No autorizado'; end if;

  begin
    v_token := btrim(target_qr_token)::uuid;
  exception when others then
    return json_build_object('result', 'no_encontrado');
  end;

  select t.id, t.is_active, t.checked_in_at, s.seat_label, pc.nombre as category,
         pf.starts_at, o.buyer_nombre
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = s.price_category_id
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  update tickets set checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_ticket.id and is_active and checked_in_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('result', 'ya_usado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre,
                             'checked_in_at', v_ticket.checked_in_at);
  end if;

  return json_build_object('result', 'ok', 'seat_label', v_ticket.seat_label,
                           'category', v_ticket.category,
                           'performance_starts_at', v_ticket.starts_at,
                           'buyer_nombre', v_ticket.buyer_nombre);
end;
$$;

-- ============================================================
-- 5. PRIVILEGES (lesson of 0016: revoke from anon explicitly)
-- ============================================================
revoke execute on function admin_create_seated_order(uuid, text, text, uuid[], text) from public, anon;
revoke execute on function admin_cancel_ticket(uuid) from public, anon;
revoke execute on function check_in_ticket(text) from public, anon;
grant execute on function admin_create_seated_order(uuid, text, text, uuid[], text) to authenticated;
grant execute on function admin_cancel_ticket(uuid) to authenticated;
grant execute on function check_in_ticket(text) to authenticated;
```

Nota: en `check_in_ticket`, la lectura de `checked_in_at` del `select` se hace **antes** del `update`; si dos validaciones corren a la vez, el `update` condicionado (`where checked_in_at is null`) decide quién gana y el perdedor recibe `ya_usado` (con `checked_in_at` posiblemente nulo en esa carrera; es aceptable: el resultado `ya_usado` es lo importante).

- [ ] **Step 5: Mostrar a Johann la migración + prueba y pedir "sí" para probar en transacción**

Mostrar el SQL exacto de la prueba. Con "sí", ejecutar la prueba completa (la migración debe estar **aplicada antes** que la prueba para que pase; por eso el orden es: (a) aplicar `0021` con "sí" explícito, (b) correr la prueba con rollback). Alternativa más segura, preferida: ejecutar `0021` **dentro de la misma transacción** al inicio de la prueba (concatenar migración + prueba + `rollback`) para validarla sin persistir nada; solo si todo pasa, pedir un segundo "sí" para aplicarla de verdad con `mcp__supabase__apply_migration` (nombre `seat_map_rpcs`).

Run (con aprobación): `mcp__supabase__execute_sql` con `begin; <0021>; <prueba sin su propio begin/rollback>; rollback;`
Expected: la última sentencia devuelve `TODAS LAS PRUEBAS PASARON`; cualquier `FALLO …` aborta con el mensaje.

- [ ] **Step 6: Aplicar la migración (segundo "sí")**

`mcp__supabase__apply_migration` con name `seat_map_rpcs` y el SQL de `0021`. Luego verificar con lecturas: `select count(*) from seats where production_id='showman' and lado is null` = 0; `select proname from pg_proc where proname in ('admin_create_seated_order','admin_cancel_ticket','check_in_ticket')` = 3 filas; `mcp__supabase__get_advisors` (security) sin avisos nuevos sobre las funciones (en particular `anon` sin EXECUTE: `select has_function_privilege('anon','check_in_ticket(text)','execute')` = false).

- [ ] **Step 7: Commit (solo si Johann lo pide)**

```bash
git add supabase/migrations/0021_seat_map_rpcs.sql supabase/tests/0021_seat_map_rpcs_test.sql
git commit -m "feat(db): seat map support — seats.lado and admin sale/cancel/check-in RPCs (0021)"
```

---

### Task 2: Capa de datos del mapa en `js/app.js`

**Files:**
- Modify: `js/app.js` (nuevo bloque `// ─── SEAT MAP (Supabase) ───` justo antes de `var boletajeSel`, ~L1325)

**Interfaces:**
- Consumes: `sb`, `AuthService.session.rol`, `boletajeSel.perf`, `boletajeSel.prod`.
- Produces (todas globales, estilo del archivo):
  - `smapState` = `{perf:null, prod:null, seats:[], blocked:{}, tickets:{}, prices:{}, loading:false, error:null, selected:{}}`
    - `blocked[seat_id]=true`; `tickets[seat_id]={ticket_id, status, checked_in_at, buyer_nombre, order_code}`; `prices[price_category_id]={price, nombre}`
  - `async function smapLoad(prodId, perfId)` → llena `smapState` y llama `renderSeatMap()`; maneja errores con `smapState.error`.
  - `function smapSeatState(seat)` → `'disp'|'pend'|'ap'|'usado'|'bloq'`
  - `function smapCounts()` → `{total, vendidos, bloqueados, disponibles}` (vendidos = pend+ap+usado)
  - `async function smapBlock(seatIds)`, `smapRelease(seatIds)`, `smapSell(seatIds, nombre, tel, seller)`, `smapCancelTicket(ticketId)` → `{ok:boolean, error?:string, data?}`

- [ ] **Step 1: Escribir las funciones**

Pegar este bloque (ES5, igual que el resto):

```js
// ─── SEAT MAP (Supabase) ───────────────────────────────
var smapState={perf:null,prod:null,seats:[],blocked:{},tickets:{},prices:{},loading:false,error:null,selected:{}};

async function smapLoad(prodId,perfId){
  if(!sb||!perfId){smapState.seats=[];smapState.error=null;renderSeatMap();return;}
  smapState.loading=true;smapState.error=null;
  smapState.prod=prodId;smapState.perf=perfId;
  smapState.selected={};
  renderSeatMap();
  var seatsRes=await sb.from('seats').select('id,seat_label,seat_row,seat_number,section,lado,price_category_id,is_active').eq('production_id',prodId).limit(2000);
  var blockedRes=await sb.from('blocked_seats').select('seat_id').eq('performance_id',perfId).limit(2000);
  var ticketsRes=await sb.from('tickets').select('id,seat_id,checked_in_at,orders(status,buyer_nombre,order_code)').eq('performance_id',perfId).eq('is_active',true).not('seat_id','is',null).limit(2000);
  var pricesRes=await sb.from('performance_price_categories').select('price_category_id,price,price_categories(nombre)').eq('performance_id',perfId);
  // Si el usuario cambió de función mientras cargaba, descartar este resultado.
  if(smapState.perf!==perfId) return;
  smapState.loading=false;
  var err=seatsRes.error||blockedRes.error||ticketsRes.error||pricesRes.error;
  if(err){smapState.error='No se pudo cargar el mapa: '+err.message;smapState.seats=[];renderSeatMap();return;}
  smapState.seats=seatsRes.data||[];
  smapState.blocked={};(blockedRes.data||[]).forEach(function(b){smapState.blocked[b.seat_id]=true;});
  smapState.tickets={};(ticketsRes.data||[]).forEach(function(t){
    smapState.tickets[t.seat_id]={ticket_id:t.id,status:t.orders?t.orders.status:null,checked_in_at:t.checked_in_at,buyer_nombre:t.orders?t.orders.buyer_nombre:'',order_code:t.orders?t.orders.order_code:''};
  });
  smapState.prices={};(pricesRes.data||[]).forEach(function(p){
    smapState.prices[p.price_category_id]={price:Number(p.price),nombre:p.price_categories?p.price_categories.nombre:''};
  });
  renderSeatMap();
}

function smapSeatState(seat){
  var t=smapState.tickets[seat.id];
  if(t){
    if(t.checked_in_at) return 'usado';
    if(t.status==='aprobado') return 'ap';
    return 'pend';
  }
  if(smapState.blocked[seat.id]) return 'bloq';
  return 'disp';
}

function smapCounts(){
  var c={total:0,vendidos:0,bloqueados:0,disponibles:0};
  smapState.seats.forEach(function(s){
    if(!s.is_active) return;
    c.total++;
    var st=smapSeatState(s);
    if(st==='disp') c.disponibles++;
    else if(st==='bloq') c.bloqueados++;
    else c.vendidos++;
  });
  return c;
}

function smapIsAdmin(){return AuthService.session.rol==='admin';}

async function smapBlock(seatIds){
  if(!smapIsAdmin()) return {ok:false,error:'Solo un admin puede bloquear asientos.'};
  var rows=seatIds.map(function(id){return {performance_id:smapState.perf,seat_id:id};});
  var r=await sb.from('blocked_seats').upsert(rows,{onConflict:'performance_id,seat_id',ignoreDuplicates:true});
  return r.error?{ok:false,error:r.error.message}:{ok:true};
}
async function smapRelease(seatIds){
  if(!smapIsAdmin()) return {ok:false,error:'Solo un admin puede liberar asientos.'};
  var r=await sb.from('blocked_seats').delete().eq('performance_id',smapState.perf).in('seat_id',seatIds);
  return r.error?{ok:false,error:r.error.message}:{ok:true};
}
async function smapSell(seatIds,nombre,tel,seller){
  var r=await sb.rpc('admin_create_seated_order',{target_performance_id:smapState.perf,target_buyer_nombre:nombre,target_buyer_telefono:tel,target_seat_ids:seatIds,target_seller_codigo:seller||null});
  return r.error?{ok:false,error:r.error.message}:{ok:true,data:r.data};
}
async function smapCancelTicket(ticketId){
  var r=await sb.rpc('admin_cancel_ticket',{target_ticket_id:ticketId});
  return r.error?{ok:false,error:r.error.message}:{ok:true,data:r.data};
}
```

Nota de verificación: confirmar que `blocked_seats` tiene `PK (performance_id, seat_id)` (para el `onConflict`) con `rg -n "blocked_seats" -A6 supabase/migrations/0008*.sql`. Los bloqueos de un asiento con ticket activo se filtran en la UI (Task 4); la tabla no lo impide.

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check js/app.js`
Expected: sin salida (OK).

- [ ] **Step 3: Probar la carga en el navegador (consola, sesión admin)**

Con `npx serve .` o abriendo `index.html` en local, iniciar sesión como admin y en la consola: `await smapLoad('showman', DB.getPerformancesForProduction('showman')[0].id); smapCounts()`.
Expected: `{total:725, vendidos:0, bloqueados:0, disponibles:725}` (si ya hay datos de prueba, los números cuadran con la BD; verificar con `select count(*) from tickets where is_active` vía MCP, solo lectura).

- [ ] **Step 4: Commit (solo si Johann lo pide)**

```bash
git add js/app.js
git commit -m "feat(staff): seat map data layer (load seats, blocks, tickets, prices per function)"
```

---

### Task 3: Render del mapa + CSS (solo lectura)

**Files:**
- Modify: `js/app.js` — reemplazar el cuerpo de `renderBoletajeProductions` (desde el `box` placeholder, L1357-1365) y añadir `renderSeatMap()`
- Modify: `css/styles.css` — añadir bloque `.smap-*` después de `.staff-seat.sel` (~L528)
- Modify: `index.html` — sin cambios en esta tarea (se reutiliza `#boletajeProdList`)

**Interfaces:**
- Consumes: `smapState`, `smapSeatState`, `smapCounts`, `smapIsAdmin`, `smapLoad` (Task 2).
- Produces: `function renderSeatMap()` (pinta en `#smapRoot`, que `renderBoletajeProductions` crea tras los selectores); `function smapToggle(seatId)` (stub en esta tarea: solo admin, actualiza `smapState.selected` y llama `renderSeatMap()`); `function smapTooltip(seat)` → string.

- [ ] **Step 1: CSS**

Agregar a `css/styles.css`:

```css
/* ─── Mapa interactivo de staff (Boletaje) ─── */
.smap-wrap{overflow-x:auto;padding-bottom:12px;margin-bottom:12px}
.smap{display:inline-block;min-width:100%;text-align:center}
.smap-stage{margin:0 auto 14px;max-width:420px;padding:6px 0;border-radius:var(--r4);background:var(--g2);border:1px solid var(--g3);font-size:11px;letter-spacing:.2em;color:var(--t3);text-transform:uppercase}
.smap-row{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:3px;white-space:nowrap}
.smap-row-label{width:22px;font-size:10px;font-weight:700;color:var(--t3);flex-shrink:0}
.smap-block{display:flex;gap:3px}
.smap-aisle{width:18px;flex-shrink:0}
.smap-seat{width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;border:1.5px solid transparent;user-select:none;border-left-width:4px;box-sizing:border-box}
.smap.is-admin .smap-seat{cursor:pointer}
.smap-seat.z-exclusivo{border-left-color:#8B5CF6}
.smap-seat.z-vip{border-left-color:#14B8A6}
.smap-seat.z-preferente{border-left-color:#F97316}
.smap-seat.z-discapacitados{border-left-color:#A0724A}
.smap-seat.disp{background:rgba(21,101,192,.15);color:#5b9bdb}
.smap-seat.pend{background:rgba(212,160,23,.18);color:#D4A017}
.smap-seat.ap{background:rgba(229,68,90,.18);color:#E5445A}
.smap-seat.usado{background:rgba(34,197,94,.18);color:#22c55e}
.smap-seat.bloq{background:rgba(122,122,122,.2);color:#aaa}
.smap-seat.sel{background:#EC4899;color:#fff;outline:2px solid #EC4899}
.smap-counts{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:13px;color:var(--t2)}
.smap-counts b{color:#fff}
.smap-legends{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;margin:8px 0;font-size:12px;color:var(--t2)}
.smap-legend-item{display:flex;align-items:center;gap:6px}
.smap-sw{width:14px;height:14px;border-radius:3px;flex-shrink:0}
.smap-panel{background:var(--g2);border:1px solid var(--g3);border-radius:var(--r8);padding:14px;margin-top:10px}
.smap-panel .form-c{margin-bottom:8px}
.smap-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
```

(Nota: `.sel` de `.smap-seat` y colores de estado reutilizan los hex de los estados ya definidos en `.staff-seat.*`.)

- [ ] **Step 2: Escribir `renderSeatMap`**

En `js/app.js`, tras el bloque de la capa de datos:

```js
var SMAP_ZONES={'Exclusivo':'z-exclusivo','VIP':'z-vip','Preferente':'z-preferente','Discapacitados':'z-discapacitados'};
var SMAP_STATE_LABELS=[['disp','Disponible','#1565C0'],['sel','Seleccionado','#EC4899'],['pend','Pendiente','#D4A017'],['ap','Comprado','#E5445A'],['usado','Usado','#22c55e'],['bloq','Bloqueado','#7a7a7a']];
var SMAP_ZONE_LABELS=[['Exclusivo','#8B5CF6'],['VIP','#14B8A6'],['Preferente','#F97316'],['Discapacitados','#A0724A']];

function smapCategoryName(seat){
  var p=smapState.prices[seat.price_category_id];
  return p?p.nombre:'';
}
function smapTooltip(seat){
  var parts=[seat.seat_label];
  var p=smapState.prices[seat.price_category_id];
  if(p) parts.push(p.nombre+' · $'+p.price);
  var t=smapState.tickets[seat.id];
  if(t) parts.push((t.checked_in_at?'Usado':(t.status==='aprobado'?'Comprado':'Pendiente'))+(t.buyer_nombre?': '+t.buyer_nombre:''));
  else if(smapState.blocked[seat.id]) parts.push('Bloqueado');
  return parts.join(' — ');
}

function smapBlockEl(seats){
  var b=document.createElement('div');b.className='smap-block';
  seats.forEach(function(s){
    var d=document.createElement('div');
    var catName=smapCategoryName(s);
    d.className='smap-seat '+(SMAP_ZONES[catName]||'')+' '+(smapState.selected[s.id]?'sel':smapSeatState(s));
    d.textContent=s.seat_number;
    d.title=smapTooltip(s);
    if(smapIsAdmin()) d.onclick=function(){smapToggle(s.id);};
    b.appendChild(d);
  });
  return b;
}

function renderSeatMap(){
  var root=document.getElementById('smapRoot');
  if(!root) return;
  clearEl(root);
  if(smapState.loading){var l=document.createElement('div');l.className='empty-note';l.textContent='Cargando mapa…';root.appendChild(l);return;}
  if(smapState.error){var e=document.createElement('div');e.className='empty-note';e.textContent=smapState.error;root.appendChild(e);return;}
  if(!smapState.seats.length){var n=document.createElement('div');n.className='empty-note';n.textContent='Esta función no tiene asientos cargados.';root.appendChild(n);return;}

  // Contadores + Actualizar
  var c=smapCounts();
  var bar=document.createElement('div');bar.className='smap-counts';
  [['Total',c.total],['Vendidos',c.vendidos],['Bloqueados',c.bloqueados],['Disponibles',c.disponibles]].forEach(function(x){
    var s=document.createElement('span');s.textContent=x[0]+': ';var b=document.createElement('b');b.textContent=x[1];s.appendChild(b);bar.appendChild(s);
  });
  var rf=document.createElement('button');rf.className='btn btn-o btn-sm';rf.textContent='Actualizar';
  rf.onclick=function(){smapLoad(smapState.prod,smapState.perf);};
  bar.appendChild(rf);root.appendChild(bar);

  // Agrupar por fila (A cerca del escenario → X al fondo)
  var rows={};
  smapState.seats.forEach(function(s){(rows[s.seat_row]=rows[s.seat_row]||[]).push(s);});
  var order=Object.keys(rows).sort();
  var wrap=document.createElement('div');wrap.className='smap-wrap';
  var map=document.createElement('div');map.className='smap'+(smapIsAdmin()?' is-admin':'');
  var stage=document.createElement('div');stage.className='smap-stage';stage.textContent='Escenario';map.appendChild(stage);
  order.forEach(function(rname){
    var list=rows[rname].slice().sort(function(a,b){return a.seat_number-b.seat_number;});
    var row=document.createElement('div');row.className='smap-row';
    var lab=document.createElement('div');lab.className='smap-row-label';lab.textContent=rname;row.appendChild(lab);
    // Fila J mezcla Discapacitados (izq/der) y Preferente (central): se agrupa por `lado`, no por zona.
    ['izquierda','central','derecha'].forEach(function(lado,i){
      var part=list.filter(function(s){return s.lado===lado;});
      if(i>0){var a=document.createElement('div');a.className='smap-aisle';row.appendChild(a);}
      row.appendChild(smapBlockEl(part));
    });
    var lab2=document.createElement('div');lab2.className='smap-row-label';lab2.textContent=rname;row.appendChild(lab2);
    map.appendChild(row);
  });
  wrap.appendChild(map);root.appendChild(wrap);

  // Leyendas
  var lg=document.createElement('div');lg.className='smap-legends';
  var l1=document.createElement('div');l1.className='smap-legends';
  SMAP_STATE_LABELS.forEach(function(x){var it=document.createElement('span');it.className='smap-legend-item';var sw=document.createElement('span');sw.className='smap-sw';sw.style.background=x[2];it.appendChild(sw);it.appendChild(document.createTextNode(x[1]));l1.appendChild(it);});
  var l2=document.createElement('div');l2.className='smap-legends';
  SMAP_ZONE_LABELS.forEach(function(x){var it=document.createElement('span');it.className='smap-legend-item';var sw=document.createElement('span');sw.className='smap-sw';sw.style.background=x[1];it.appendChild(sw);it.appendChild(document.createTextNode('Zona '+x[0]));l2.appendChild(it);});
  root.appendChild(l1);root.appendChild(l2);

  renderSeatPanel();
}

function smapToggle(seatId){
  if(!smapIsAdmin()) return;
  if(smapState.selected[seatId]) delete smapState.selected[seatId]; else smapState.selected[seatId]=true;
  renderSeatMap();
}
function renderSeatPanel(){} // se completa en Task 4
```

Conectar con Boletaje: en `renderBoletajeProductions`, reemplazar el `box` placeholder (las líneas desde `var cur=...` hasta `list.appendChild(box);`) por:

```js
  var root=document.createElement('div');root.id='smapRoot';list.appendChild(root);
  if(boletajeSel.prod && boletajeSel.perf){
    if(smapState.perf!==boletajeSel.perf) smapLoad(boletajeSel.prod,boletajeSel.perf); else renderSeatMap();
  } else {
    var none2=document.createElement('div');none2.className='empty-note';
    none2.textContent='Esta producción aún no tiene funciones. Créalas en Gestión de Producciones.';
    root.appendChild(none2);
  }
```

Cuidado: `renderBoletajeProductions` se vuelve a llamar por los `DB.subscribe` de producciones/funciones; la guarda `smapState.perf!==boletajeSel.perf` evita recargar de Supabase en cada llamada. Los `onchange` de los selectores ya ponen `boletajeSel.perf` y re-renderizan.

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check js/app.js`
Expected: sin salida.

- [ ] **Step 4: Verificar en el navegador (admin y staff)**

Servir en local y verificar con una sesión admin y luego staff (Johann entra o se usan las sesiones reales; yo no tengo credenciales): se ven 725 asientos (`document.querySelectorAll('.smap-seat').length === 725`), la fila J muestra 3 | 11 | 3, pasillos entre bloques, contadores `725/0/0/725`, zonas con franja de color distinta a los colores de estado, scroll horizontal a 500px de ancho, y con staff `document.querySelector('.smap').classList.contains('is-admin') === false` y clic en asiento no selecciona. Con admin, clic alterna rosa.

Prueba anti-XSS: sin crear datos, ejecutar en consola `smapState.tickets[smapState.seats[0].id]={status:'aprobado',buyer_nombre:'<img src=x onerror=alert(1)>'}; renderSeatMap()` y comprobar que no hay alerta y el tooltip (`title`) muestra el texto literal.

- [ ] **Step 5: Commit (solo si Johann lo pide)**

```bash
git add js/app.js css/styles.css
git commit -m "feat(staff): render real Showman seat map in Boletaje (read-only, zones and legends)"
```

---

### Task 4: Acciones de admin (bloquear, liberar, generar boleto, cancelar)

**Files:**
- Modify: `js/app.js` — completar `renderSeatPanel()`; añadir `smapDoBlock`, `smapDoRelease`, `smapDoSell`, `smapDoCancel`, `smapAfterAction`.

**Interfaces:**
- Consumes: `smapBlock`, `smapRelease`, `smapSell`, `smapCancelTicket`, `smapState`, `flash`, `smapLoad`.
- Produces: `renderSeatPanel()` (solo pinta si hay selección y es admin); botones Bloquear / Liberar / Generar Boleto; tras éxito o error muestra `flash` y recarga con `smapLoad`.

Reglas de UI (spec §3, §6):
- Bloquear: rechaza en el cliente si algún seleccionado tiene ticket activo ("Algunos asientos están vendidos: libera el boleto primero"); si el asiento ya está bloqueado se ignora (upsert).
- Liberar: sobre asientos solo bloqueados → `smapRelease`. Sobre un asiento **vendido** → `confirm('Este asiento está vendido a NOMBRE. ¿Cancelar el boleto y liberar el asiento?')` y luego `smapCancelTicket(ticket_id)`.
- Generar Boleto: requiere que **todos** los seleccionados estén disponibles; nombre y teléfono obligatorios; código de vendedor opcional; si la RPC falla, mostrar su mensaje y recargar el mapa (todo-o-nada).
- Tras generar: mostrar un resumen con orden, total y lista de asiento + QR (texto con `textContent`) para copiar/mostrar. (El boleto digital con QR dibujado es posterior; ver "Fuera de alcance".)

- [ ] **Step 1: Implementar el panel y las acciones**

```js
function smapSelectedSeats(){
  return smapState.seats.filter(function(s){return smapState.selected[s.id];});
}

async function smapAfterAction(res,okMsg){
  if(res.ok) flash(okMsg,'s'); else flash(res.error,'d');
  await smapLoad(smapState.prod,smapState.perf);
}

async function smapDoBlock(){
  var sel=smapSelectedSeats();
  if(sel.some(function(s){return smapState.tickets[s.id];})){flash('Algunos asientos están vendidos: cancela primero el boleto.','d');return;}
  var res=await smapBlock(sel.map(function(s){return s.id;}));
  await smapAfterAction(res,'Asientos bloqueados.');
}

async function smapDoRelease(){
  var sel=smapSelectedSeats();
  var sold=sel.filter(function(s){return smapState.tickets[s.id];});
  var blockedOnly=sel.filter(function(s){return !smapState.tickets[s.id] && smapState.blocked[s.id];});
  if(sold.length){
    var names=sold.map(function(s){return s.seat_label+' ('+(smapState.tickets[s.id].buyer_nombre||'sin nombre')+')';}).join(', ');
    if(!confirm('Estos asientos están vendidos: '+names+'.\n¿Cancelar los boletos y liberar los asientos?')) return;
    for(var i=0;i<sold.length;i++){
      var r=await smapCancelTicket(smapState.tickets[sold[i].id].ticket_id);
      if(!r.ok){await smapAfterAction(r,'');return;}
    }
  }
  if(blockedOnly.length){
    var r2=await smapRelease(blockedOnly.map(function(s){return s.id;}));
    if(!r2.ok){await smapAfterAction(r2,'');return;}
  }
  await smapAfterAction({ok:true},'Asientos liberados.');
}

async function smapDoSell(){
  var sel=smapSelectedSeats();
  if(sel.some(function(s){return smapSeatState(s)!=='disp';})){flash('Solo puedes generar boleto de asientos disponibles.','d');return;}
  var nombre=(document.getElementById('smapNombre').value||'').trim();
  var tel=(document.getElementById('smapTel').value||'').trim();
  var seller=(document.getElementById('smapSeller').value||'').trim();
  if(!nombre||!tel){flash('Nombre y teléfono del comprador son obligatorios.','d');return;}
  var res=await smapSell(sel.map(function(s){return s.id;}),nombre,tel,seller);
  if(res.ok){
    smapLastSale=res.data;
    flash('Boleto generado: '+res.data.order_code+' · $'+res.data.total,'s');
  } else flash(res.error,'d');
  await smapLoad(smapState.prod,smapState.perf);
}
var smapLastSale=null;

function renderSeatPanel(){
  var root=document.getElementById('smapRoot');
  if(!root||!smapIsAdmin()) return;
  var sel=smapSelectedSeats();
  if(smapLastSale){
    var done=document.createElement('div');done.className='smap-panel';
    var h=document.createElement('div');h.style.cssText='font-weight:800;color:#fff;margin-bottom:6px';
    h.textContent='Orden '+smapLastSale.order_code+' · Total $'+smapLastSale.total;done.appendChild(h);
    (smapLastSale.tickets||[]).forEach(function(t){
      var l=document.createElement('div');l.style.cssText='font-size:12px;color:var(--t2)';
      l.textContent=t.seat_label+' — QR: '+t.qr_token;done.appendChild(l);
    });
    var x=document.createElement('button');x.className='btn btn-o btn-sm';x.style.marginTop='8px';x.textContent='Cerrar';
    x.onclick=function(){smapLastSale=null;renderSeatMap();};done.appendChild(x);
    root.appendChild(done);
  }
  if(!sel.length) return;
  var p=document.createElement('div');p.className='smap-panel';
  var total=0;sel.forEach(function(s){var pr=smapState.prices[s.price_category_id];if(pr)total+=pr.price;});
  var info=document.createElement('div');info.style.cssText='font-size:13px;color:var(--t2);margin-bottom:8px';
  info.textContent=sel.length+' asiento(s): '+sel.map(function(s){return s.seat_label;}).join(', ')+' · Total informativo $'+total;
  p.appendChild(info);
  [['smapNombre','Nombre del comprador'],['smapTel','Teléfono del comprador'],['smapSeller','Código de vendedor (opcional)']].forEach(function(f){
    var i=document.createElement('input');i.type='text';i.id=f[0];i.className='form-c';i.placeholder=f[1];p.appendChild(i);
  });
  var acts=document.createElement('div');acts.className='smap-actions';
  [['Bloquear','btn btn-o btn-sm',smapDoBlock],['Liberar','btn btn-o btn-sm',smapDoRelease],['Generar Boleto','btn btn-a btn-sm',smapDoSell]].forEach(function(b){
    var el=document.createElement('button');el.className=b[1];el.textContent=b[0];el.onclick=b[2];acts.appendChild(el);
  });
  var cl=document.createElement('button');cl.className='btn btn-o btn-sm';cl.textContent='Limpiar selección';
  cl.onclick=function(){smapState.selected={};renderSeatMap();};acts.appendChild(cl);
  p.appendChild(acts);root.appendChild(p);
}
```

Importante: borrar el stub `function renderSeatPanel(){}` de Task 3 (la última declaración gana, pero no dejar duplicados). Como `renderSeatMap` se vuelve a pintar tras cada selección, los campos de nombre/teléfono se vaciarían al seleccionar otro asiento: guardar y restaurar su valor en `smapState.form={nombre,tel,seller}` (en el `oninput` de cada campo) y usarlo como `i.value` al crear los inputs. Implementar eso aquí (campos con `i.value=(smapState.form||{})[key]||''` y `i.oninput=function(){smapState.form=smapState.form||{};smapState.form[key]=i.value;}`, donde `key` es `'nombre'|'tel'|'seller'`), y leer los valores de `smapState.form` en `smapDoSell` en vez de `getElementById`.

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check js/app.js`
Expected: sin salida.

- [ ] **Step 3: Prueba en navegador con admin (Johann o sesión real)**

Con la migración 0021 aplicada y una función de Showman (sin fecha, `on_sale=false`):
1. Seleccionar 2 asientos → Bloquear → pasan a gris; contadores bloqueados=2. Recargar la página y confirmar que persisten.
2. Seleccionarlos → Liberar → vuelven a azul.
3. Seleccionar 1 disponible → Generar Boleto sin nombre → mensaje de error; con nombre/teléfono → pasa a rojo ("Comprado"), aparece el resumen con QR, contador vendidos=1.
4. Seleccionar el vendido → Liberar → aparece `confirm`; al aceptar vuelve a azul.
5. Doble venta: abrir dos pestañas con el mismo asiento seleccionado; vender en la primera; en la segunda "Generar Boleto" debe mostrar "ya no está disponible" y recargar el mapa (asiento rojo).
6. Con sesión staff: el panel y las selecciones no aparecen.

**Limpieza de datos de prueba:** estas pruebas crean filas reales en `orders`/`tickets`/`blocked_seats`. Antes de probar, avisar a Johann; al terminar, proponer el SQL exacto de limpieza (por `order_code` creado y `blocked_seats` de la función) y ejecutarlo solo con su "sí".

- [ ] **Step 4: Commit (solo si Johann lo pide)**

```bash
git add js/app.js
git commit -m "feat(staff): admin actions on seat map — block, release, generate ticket, cancel"
```

---

### Task 5: Check-in con la RPC `check_in_ticket`

**Files:**
- Modify: `js/app.js` — reemplazar `handleQrResult` (~L1614) y `simulateQrScan` (~L1644)
- Modify: `index.html` — quitar el botón "Simular Escaneo Válido" (~L923)

**Interfaces:**
- Consumes: `sb.rpc('check_in_ticket', {target_qr_token: text})` → `{result:'ok'|'ya_usado'|'no_encontrado'|'cancelado', seat_label, buyer_nombre, ...}`.
- Produces: `async function handleQrResult(code)` (misma firma, ahora async; sus llamadores `manualCheckIn` y el callback de `startQrScanner` no esperan retorno).

- [ ] **Step 1: Reescribir `handleQrResult`**

```js
async function handleQrResult(code){
  var f=document.getElementById('qrFrameText');
  var show=function(txt){ if(f) f.textContent=txt; };
  if(!sb){flash('No hay conexión con el servidor.','d');return;}
  var r=await sb.rpc('check_in_ticket',{target_qr_token:String(code||'')});
  if(r.error){flash(r.error.message,'d');show('❌ Error');return;}
  var d=r.data||{};
  var who=d.buyer_nombre||'Comprador';
  var seat=d.seat_label?('Asiento '+d.seat_label):'';
  if(d.result==='ok'){
    flash('ACCESO — '+who+(seat?' · '+seat:''),'s');
    if(f){clearEl(f);
      var l1=document.createElement('div');l1.textContent='✅ '+who;
      var l2=document.createElement('div');l2.textContent=seat;
      f.appendChild(l1);f.appendChild(l2);
    }
    if(document.getElementById('smapRoot') && smapState.perf) smapLoad(smapState.prod,smapState.perf);
  } else if(d.result==='ya_usado'){
    flash('Este boleto ya fue utilizado.'+(seat?' ('+seat+')':''),'d');show('⚠️ Ya utilizado');
  } else if(d.result==='cancelado'){
    flash('Este boleto fue cancelado.','d');show('❌ Cancelado');
  } else {
    flash('Código no reconocido.','d');show('❌ No reconocido');
  }
  setTimeout(function(){ show('Esperando código QR...'); },3000);
}
```

(El mensaje `flash` ya antepone su ícono; no incluir emojis en el texto de `flash`.)

- [ ] **Step 2: Quitar `simulateQrScan` y su botón**

Borrar la función `simulateQrScan` y la línea `<button class="btn btn-a btn-sm" onclick="simulateQrScan()">Simular Escaneo Válido</button>` en `index.html` (simulaba contra `localStorage`, ya no aplica). Comprobar que nadie más la usa: `rg -n "simulateQrScan"` debe quedar vacío.

- [ ] **Step 3: Verificar sintaxis y probar**

Run: `node --check js/app.js` → sin salida.
En navegador, como staff y como admin: pegar el QR de un boleto generado en Task 4 → "ACCESO" y el asiento pasa a verde al abrir el mapa (admin); repetir → "Ya utilizado"; pegar `  hola ` → "No reconocido"; cancelar el boleto y validar → "Cancelado". Como fan (sin acceso al panel) la RPC debe rechazar: en consola `await sb.rpc('check_in_ticket',{target_qr_token:'x'})` con sesión fan → error `No autorizado`.

- [ ] **Step 4: Commit (solo si Johann lo pide)**

```bash
git add js/app.js index.html
git commit -m "feat(staff): QR check-in via check_in_ticket RPC (replaces localStorage)"
```

---

### Task 6: Limpieza del prototipo, Vendedores y documentación

**Files:**
- Modify: `js/app.js`, `css/styles.css`, `index.html`
- Modify: `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `function renderSellersPanel()` (Vendedores, admin) en un contenedor `#sellersPanel` dentro de la sección Boletaje.

Hallazgo previo (importante): la gestión de vendedores (tabla + alta) vivía dentro de `buildBoletajeProdCard`, que el placeholder actual ya no renderiza, por lo que **hoy no es accesible desde la UI**. Se restaura aquí antes de borrar el código viejo. **Decisión pendiente de Johann** (ver preguntas abiertas): ubicación — este plan la coloca como bloque "Vendedores" bajo el mapa en Boletaje.

- [ ] **Step 1: Restaurar Vendedores**

Antes: `rg -n "addSellerFromStaff|renderSellersTable|deleteSeller|addSeller" js/app.js` y leer las firmas reales (`DB.addSeller(nombre,codigo)` → `{ok,error}`; confirmar `DB.deleteSeller`). Luego añadir en `index.html`, dentro de `#boletajeProdList`'s sección, tras ese `div`: `<div id="sellersPanel" style="margin-top:20px"></div>` y en `js/app.js`:

```js
function renderSellersPanel(){
  var box=document.getElementById('sellersPanel');
  if(!box) return;
  clearEl(box);
  if(AuthService.session.rol!=='admin') return;
  var h=document.createElement('div');h.style.cssText='font-weight:800;color:#fff;margin-bottom:8px';h.textContent='Vendedores';box.appendChild(h);
  var list=DB.getSellers();
  if(!list.length){var n=document.createElement('div');n.className='empty-note';n.textContent='No hay vendedores registrados.';box.appendChild(n);}
  list.forEach(function(s){
    var row=document.createElement('div');row.style.cssText='display:flex;gap:10px;align-items:center;font-size:13px;color:var(--t2);margin-bottom:4px';
    row.textContent=s.nombre+' — '+s.codigo+' ';
    var del=document.createElement('button');del.className='btn btn-o btn-sm';del.textContent='Eliminar';
    del.onclick=async function(){ if(!confirm('¿Eliminar a '+s.nombre+'?')) return; var r=await DB.deleteSeller(s.id); if(!r.ok) flash(r.error,'d'); renderSellersPanel(); };
    row.appendChild(del);box.appendChild(row);
  });
  var form=document.createElement('div');form.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
  var nom=document.createElement('input');nom.className='form-c';nom.placeholder='Nombre';
  var cod=document.createElement('input');cod.className='form-c';cod.placeholder='Código';
  var add=document.createElement('button');add.className='btn btn-a btn-sm';add.textContent='Agregar';
  add.onclick=async function(){ var r=await DB.addSeller(nom.value,cod.value); if(!r.ok) flash(r.error,'d'); else flash('Vendedor agregado.','s'); renderSellersPanel(); };
  form.appendChild(nom);form.appendChild(cod);form.appendChild(add);box.appendChild(form);
}
```

Llamar `renderSellersPanel()` desde donde se llama `renderBoletajeProductions()` al abrir el panel de staff (línea ~1023 `await Promise.all([DB.loadSellers(),...])` y su render posterior), y registrar `DB.subscribe(DB.KEYS.sellers, ...)` si no existe. Verificar en navegador (admin): lista, alta y baja funcionan; staff no ve el bloque.

- [ ] **Step 2: Retirar el prototipo 6×8 (localStorage)**

Borrar de `js/app.js`: `renderStaffSeatMap`, `blockSelectedSeats`, `releaseSelectedSeats`, `createStaffTicket`, `renderGeneratedTickets`, `renderPendingOrders`, `renderSalesControl`, `toggleBoletajeAcc`, `buildBoletajeProdCard`, `renderTicketsDatabase`, `addSellerFromStaff`, `renderSellersTable`, `clearStaffSelection` y variables `staffAccExpanded`, `staffDbOpen`, y el `DB.subscribe(DB.KEYS.orders, ...renderBoletajeProductions)`; en el módulo `DB` quitar `getBlockedSeats, blockSeats, releaseSeats, releaseSeatsFromOrders, checkInByQr` y la clave `blocked` de `KEYS` **solo si ya nadie las referencia**.

Antes de borrar cada símbolo: `rg -n "<símbolo>" js/app.js index.html` debe mostrar únicamente su definición y usos dentro del bloque que se borra. **No tocar** `SEAT_ROWS/SEAT_COLS/allSeatIds` ni `getSeatsTaken/getApprovedCount` mientras el checkout público (L~775) los use; el checkout público queda fuera de alcance. Quitar de `css/styles.css` las reglas `.staff-seatmap` y `.staff-seat.*` (L~513-528) solo si `rg -n "staff-seat" js/app.js index.html` queda vacío tras el paso anterior; si no, dejarlas y anotarlo.

- [ ] **Step 3: Verificación de no regresión**

Run: `node --check js/app.js` → sin salida.
Run: `rg -n "renderSalesControl|buildBoletajeProdCard|renderStaffSeatMap|checkInByQr|simulateQrScan|getBlockedSeats" js/app.js index.html` → sin resultados (o solo los que se decidió conservar y justificar).
En navegador: abrir Cartelera, Showman (oculto/concluido según estado), Mi cuenta, Staff (admin y staff) sin errores en la consola (`mcp__plugin_browser_browser__*` o DevTools); Boletaje, Vendedores, Control de Accesos y Gestión de Producciones cargan.

- [ ] **Step 4: Documentación**

- `docs/DATABASE.md`: columna `seats.lado`, las 3 RPCs (firmas, quién puede, resultados) y el hecho de que `admin_create_seated_order` no depende de `on_sale`.
- `docs/ARCHITECTURE.md`: flujo del mapa de staff (lectura directa por RLS, bloquear/liberar directo a `blocked_seats` admin-only, ventas/cancelación/check-in por RPC); roles admin vs staff.
- `docs/CHANGELOG.md`: entrada `2026-10-05 — Mapa interactivo de staff (0021)` con: migración 0021 (nombre registrado en Supabase `seat_map_rpcs`), mapa, acciones, check-in por RPC, retiro del prototipo localStorage, Vendedores restaurado, y fuera de alcance (checkout público, tiempo real, boleto PDF/Wallet, códigos de descuento).

- [ ] **Step 5: Commit (solo si Johann lo pide)**

```bash
git add js/app.js css/styles.css index.html docs/DATABASE.md docs/ARCHITECTURE.md docs/CHANGELOG.md
git commit -m "chore(staff): retire localStorage seat prototype, restore sellers panel, update docs"
```

---

## Preguntas abiertas para Johann

1. **Vendedores:** ¿bajo el mapa en Boletaje (como propone el plan) o en otra sección? Hoy esa gestión no es accesible desde la UI.
2. **Datos de prueba:** las pruebas de navegador (Task 4–5) crean órdenes/bloqueos reales en Supabase; ¿limpiarlos con un SQL aprobado al terminar (propuesto)?
3. **Boleto entregable:** el plan muestra el QR como texto tras generar; el boleto visual (QR dibujado/PDF/Wallet) queda fuera de este alcance.

## Auto-revisión contra el spec

- §1 roles → Task 4 (solo admin escribe), Task 3 (staff solo ve), Task 5 (staff valida QR).
- §3 RPCs y `lado` → Task 1. Bloquear/liberar directos → Task 2/4.
- §4 render, colores, leyendas, contadores, "Actualizar", tooltip, mapeo de estados → Task 3.
- §5 check-in → Task 5. §6 errores/seguridad/confirmación al liberar vendido/`textContent` → Tasks 3–5.
- §7 pruebas SQL y de navegador → Task 1 (SQL) y pasos de verificación de cada tarea.
- §8 orden de implementación → tareas 1–6 en el mismo orden. §9 fuera de alcance respetado.
- Desviación deliberada respecto al spec: `check_in_ticket` recibe `text` (no `uuid`) para que un QR mal formado devuelva `no_encontrado` en vez de error de conversión; no cambia el contrato observable.
- El guard de fecha obligatoria en `DB.createPerformance` ya se retiró (cambio sin commit en `js/app.js`); incluir en el commit de limpieza si Johann lo autoriza.
