# DARF Productions — Diseño Supabase (v2)

Estado: **diseño para revisión — nada de esto se ha ejecutado contra Supabase.**
`localStorage` y `js/app.js` siguen intactos y en producción sin cambios.

Este documento reemplaza la propuesta anterior en el punto donde dependía de
conocer la numeración física de asientos. Esa numeración sigue sin
confirmarse (venue pendiente) y **no bloquea** el resto de la arquitectura.

## Qué cambió respecto a la primera propuesta

- `seats` pasa de "tabla derivada de un grid fijo" a **tabla vacía por
  diseño**. No se asume ninguna fila/columna/sección en el esquema ni en
  ningún seed.
- `productions.capacity` es un campo informativo opcional — nunca se usa
  para calcular cuántos asientos debe tener una producción. Ya no hay
  "capacidad fija asumida para Showman" en ningún lado del esquema.
- La tabla que antes se llamaba `order_seats` pasa a llamarse **`tickets`**
  y generaliza el concepto: cada ticket es una unidad de admisión con
  `seat_id` **opcional**. Con `seat_id = null` el ticket es de admisión
  general (sin butaca asignada) — este es el modo por defecto mientras no
  haya venue confirmado.
- Nada en el esquema falla ni se comporta distinto si `seats` tiene 0 filas:
  las políticas RLS de `seats` (lectura pública) simplemente devuelven un
  conjunto vacío; los triggers y constraints de `tickets`/`orders` no
  consultan `seats` salvo cuando un ticket sí trae `seat_id`.

## Tablas (archivos en `supabase/migrations/`)

| Migración | Tabla(s) | Depende del venue |
|---|---|---|
| `0001_extensions_and_enums.sql` | tipos `order_status`, `user_role` | No |
| `0002_productions.sql` | `productions` | No |
| `0003_seats.sql` | `seats` (vacía, sin seed) | Sí — solo el **seed**, no la tabla |
| `0004_profiles.sql` | `profiles` + trigger de alta automática | No |
| `0005_sellers_and_contact.sql` | `sellers`, `contact_messages` | No |
| `0006_orders_and_tickets.sql` | `orders`, `tickets` | No |
| `0007_blocked_seats.sql` | `blocked_seats` | No (útil solo si hay seats, pero no requiere que existan) |
| `0008_helper_functions_and_triggers.sql` | `is_staff()`, `current_profile_role()`, código de orden autogenerado, recálculo de `total` | No |
| `0009_rls_policies.sql` | políticas RLS de todas las tablas | No |

Todas ejecutables hoy, en orden, contra un proyecto Supabase vacío, sin
tener el venue.

## B. Columnas / tipos — ver los archivos `.sql`, son la fuente de verdad

No los repito aquí para no arriesgar que el documento y el SQL se
desincronicen. Resumen de las diferencias clave respecto a la v1:

```
seats
  ... (igual que v1, section/seat_row/seat_number/seat_label nullable donde aplica)
  is_active boolean default true   -- nuevo: permite retirar un asiento sin borrarlo
  -- SIN seed. 0 filas hasta que se corra una migración de seed dedicada.

tickets                             -- antes "order_seats"
  id, order_id, seat_id (NULL-able), qr_token, is_active,
  checked_in_at, checked_in_by, created_at
  -- seat_id NULL = admisión general. Es el estado por defecto hoy.
```

## C. Relaciones

`orders.production_id → productions`, `tickets.order_id → orders`,
`tickets.seat_id → seats` (**nullable**), `blocked_seats.seat_id → seats`,
`orders.seller_id → sellers`, `orders.buyer_user_id → auth.users`,
`profiles.id → auth.users` (1:1).

## D. Estados

- Orden: `pendiente → aprobado | rechazado` (sin cambios).
- Ticket: `activo` (`is_active=true`, `checked_in_at NULL`) →
  `usado` (`checked_in_at` set) — y `is_active=false` si la orden padre se
  rechaza. Ya no existe un "estado de asiento" propio: si el ticket no
  tiene `seat_id`, no hay estado de asiento que reportar (es admisión
  general); si lo tiene, su estado se deriva del ticket igual que antes
  (disponible/pendiente/aprobado/usado/bloqueado).

## E–G. Público / autenticado / staff

Sin cambios respecto a la v1: disponibilidad y catálogo son públicos sin
PII; "mis boletos" requiere ser el dueño (por sesión o por código+teléfono
vía RPC, a definir en la integración); todo lo administrativo es
staff-only. `seats` se agrega a la lista de "público, lectura" — es
metadata de mapa, no PII, y estar vacía no cambia su clasificación.

## H. RLS — resumen (detalle en `0009_rls_policies.sql`)

- `productions`, `seats`: lectura pública, escritura solo staff.
- `orders`, `tickets`: **sin INSERT/UPDATE de cliente en absoluto** —  todo
  mutación pasa por funciones `SECURITY DEFINER` (a diseñar en la
  integración, no en este paso). Esto es lo que impide que un comprador
  edite la orden de otro, cambie su propio `total`, o marque un ticket como
  usado.
- `tickets`: doble reserva de asiento evitada con índice único parcial
  (`uq_tickets_active_seat`, solo cuando `seat_id is not null and
  is_active`) — a nivel base de datos, no de aplicación. Con `seats` vacía
  este índice simplemente no tiene nada que restringir todavía.
- `profiles`: el propio usuario puede leer/editar su fila, **nunca su
  `rol`** — el `WITH CHECK` de la política reafirma el rol ya almacenado
  (vía `current_profile_role()`), así que un `UPDATE` que intente incluir
  `rol:'staff'` desde devtools es rechazado por la base de datos, no por
  el frontend.
- `sellers`: sin SELECT público de la tabla completa.
- `contact_messages`: INSERT público, SELECT/UPDATE/DELETE solo staff.

## I. Qué falta para conectar el frontend (fuera de alcance de este paso)

No incluido todavía, a propósito:
- RPCs de mutación (`create_order`, `approve_order`, `reject_order`,
  `checkin_by_qr`, `create_staff_ticket`, etc.) — se diseñan cuando se
  aborde la integración real del cliente, no antes.
- Cliente Supabase en `js/app.js` / `index.html`.
- Seed de `seats` por producción.

## J. Qué falta específicamente para `seats` cuando haya venue

1. Confirmar el venue de cada producción (Showman, Mamma Mia!, HSM).
2. Obtener el plano/numeración real: secciones, filas, asientos por fila.
3. Escribir una migración de **seed** dedicada (`0010_seed_seats_<produccion>.sql`
   o similar), separada de este esquema, que inserte filas en `seats`.
4. Solo entonces tiene sentido decidir si el checkout de esa producción usa
   mapa de asientos o sigue en admisión general (`seat_id null`).

Nada de esto bloquea correr `0001`–`0009` hoy.
