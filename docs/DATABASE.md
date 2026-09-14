# DARF Productions — Base de datos (Supabase / Postgres)

Fuente de verdad real: los archivos en `supabase/migrations/`. Este documento
resume esa fuente para no tener que leer 15 archivos cada vez; si algo aquí y
el SQL se contradicen, **el SQL gana** — avisar para corregir este documento.
Para la matriz de permisos completa por rol, ver `supabase/docs/DESIGN.md`.

Estado: esquema `0001`–`0015` ejecutado y verificado contra el proyecto
Supabase real. `seats`, `price_categories` y `performance_price_categories`
están vacías a propósito (sin venue real todavía) — ver
`docs/ARCHITECTURE.md`.

## Inventario de migraciones

| # | Archivo | Contenido |
|---|---|---|
| 0001 | `extensions_and_enums.sql` | Extensiones + enums `order_status`, `user_role` (`fan`/`staff`/`admin`) |
| 0002 | `productions.sql` | Tabla `productions` |
| 0003 | `performances.sql` | Tabla `performances` |
| 0004 | `seats.sql` | Tabla `seats` (vacía, sin seed) |
| 0005 | `profiles.sql` | Tabla `profiles` + trigger de alta automática desde `auth.users` |
| 0006 | `sellers_and_contact.sql` | Tablas `sellers`, `contact_messages` |
| 0007 | `orders_and_tickets.sql` | Tablas `orders`, `tickets` |
| 0008 | `blocked_seats.sql` | Tabla `blocked_seats`, llave compuesta `(performance_id, seat_id)` |
| 0009 | `helper_functions_and_triggers.sql` | `is_staff()`, `is_admin()`, `current_profile_role()`, `mark_contact_message_read()`, generación de `order_code`, triggers de sincronización/validación, `recompute_order_total()` (versión superada, ver Hallazgo #3), grants/revokes de ejecución |
| 0010 | `rls_policies.sql` | Políticas RLS de todas las tablas + grants de ejecución de helper functions (ver Hallazgo #4) |
| 0011 | `ticketing_rpcs.sql` | `tickets.unit_price`, `recompute_order_total()` (versión final), `tickets_owner_read` restringida a órdenes `aprobado`, `create_ticket_order()` (admisión general) |
| 0012 | `order_expiration.sql` | `orders.expires_at` (scaffold sin uso) |
| 0013 | `manual_order_management.sql` | `orders.rejected_at`, `approve_order()`, `reject_order()` (ver Hallazgo #6) |
| 0014 | `ticket_pricing.sql` | `price_categories`, `performance_price_categories`, `seats.price_category_id` |
| 0015 | `seat_reservation.sql` | `create_seated_ticket_order()` (RPC de venta activa), revoca `create_ticket_order()` |

Todas ejecutables en orden contra un proyecto Supabase vacío. Regla del
proyecto: **nunca editar una migración ya ejecutada** — un cambio futuro se
agrega como `0016` en adelante, nunca reescribiendo `0001`–`0015`.

## Tablas y relaciones

```
productions
  id (text, pk), nombre, descripcion, venue, on_sale, price (legado, ver nota), ...

performances                        -- funciones de una producción
  id (uuid, pk), production_id → productions,
  starts_at, venue (opcional), on_sale

seats                                -- mapa físico, por producción (no por función)
  id (uuid, pk), production_id → productions,
  seccion/fila/numero (numeración real, aún sin seed),
  is_active, price_category_id → price_categories (nullable)

price_categories                     -- categorías de precio, por producción
  id (uuid, pk), production_id → productions, nombre, descripcion, is_active
  unique (production_id, nombre)

performance_price_categories         -- precio de una categoría PARA una función
  performance_id → performances, price_category_id → price_categories,
  price numeric(10,2) >= 0
  primary key (performance_id, price_category_id)

orders
  id (uuid, pk), order_code (autogenerado, "DARF-XXXXXX"),
  performance_id → performances, status (pendiente/aprobado/rechazado),
  buyer_nombre, buyer_telefono, buyer_user_id → auth.users (null = invitado),
  total (recalculado por trigger, nunca confiado del cliente),
  approved_by/approved_at, rejected_by/rejected_at, expires_at (sin uso)

tickets
  id (uuid, pk), order_id → orders, performance_id → performances (sincronizado por trigger),
  seat_id → seats (nullable = admisión general),
  unit_price numeric(10,2) not null >= 0 (snapshot histórico de precio),
  is_active, checked_in_at, checked_in_by

blocked_seats
  performance_id → performances, seat_id → seats
  primary key (performance_id, seat_id)

sellers, contact_messages, profiles  -- sin cambios de forma en esta fase
```

```
productions ← performances ← orders ← tickets → seats → price_categories
                    │                              │           ↑
                    │                              │      (seats.price_category_id)
                    └────────── blocked_seats ──────┘           │
                    └── performance_price_categories ───────────┘
```

- `seats.production_id → productions` — el mapa físico es por producción,
  no por función.
- `seats.price_category_id → price_categories` (nullable) — sin categoría,
  el asiento no es vendible por `create_seated_ticket_order`.
- `price_categories.production_id → productions`.
- `performance_price_categories.(performance_id, price_category_id)` — el
  precio de una categoría es específico de una función.
- `orders.performance_id → performances` (no hay `orders.production_id`;
  la producción se alcanza siempre vía `performances.production_id`).
- `tickets.performance_id` — sincronizado por trigger desde
  `orders.performance_id`, el cliente nunca lo escribe directamente.
- `tickets.seat_id → seats` (nullable = admisión general).
- Anti-doble-reserva: índice único parcial sobre
  `tickets(performance_id, seat_id) where is_active and seat_id is not null`
  — el mismo asiento físico puede tener un ticket activo en la función del
  sábado y otro distinto en la del domingo, pero nunca dos activos en la
  misma función.

## Modelo de precios

```
producción → categoría de precio → asiento → precio para ESA función → unit_price (congelado)
```

- Definir el precio de una categoría en una función no altera tickets ya
  vendidos con esa categoría — cada ticket guarda su propio `unit_price` al
  momento de crearse.
- Cambiar `performance_price_categories.price` a futuro solo afecta ventas
  posteriores a ese cambio.
- `productions.price` (columna legada, previa a este modelo) ya no
  determina el precio de venta por asiento — solo la usa `create_ticket_order`
  (admisión general, hoy con `execute` revocado).

## RPCs (`SECURITY DEFINER`)

| Función | Rol requerido | Qué hace | Quién puede ejecutarla hoy |
|---|---|---|---|
| `is_staff()` | — (lectura) | `true` si el caller es `staff` o `admin` | `authenticated` (0009) y también `anon` por el grant de 0010 — ver Hallazgo #4 |
| `is_admin()` | — (lectura) | `true` solo si `admin` | idem |
| `current_profile_role()` | — (lectura) | Devuelve el `rol` almacenado del caller | idem |
| `mark_contact_message_read(target_id)` | staff (verificado dentro de la función) | Actualiza únicamente `contact_messages.leido` — nunca otra columna | `authenticated` |
| `generate_order_code()` / `set_order_code()` | interno (trigger) | Genera `order_code` único al insertar una orden | nadie directamente — solo vía trigger |
| `create_ticket_order(performance_id, nombre, telefono, cantidad)` | público (invitado o autenticado) | Crea orden + N tickets de admisión general (`seat_id null`), precio server-side desde `productions.price` | **nadie hoy** — `execute` revocado por 0015 |
| `create_seated_ticket_order(performance_id, nombre, telefono, seat_ids[])` | público (invitado o autenticado) | Crea orden + un ticket por asiento, bloqueando cada asiento (`for update`) para reservas concurrentes seguras; valida producción/actividad/bloqueo/duplicado/categoría/precio; precio server-side desde `performance_price_categories`; máx. 20 asientos | `anon`, `authenticated` — **RPC de venta activa** (sin inventario real todavía) |
| `approve_order(target_order_id)` | staff (verificado dentro de la función) | `pendiente → aprobado` | `authenticated` — **ver Hallazgo #6: debería ser admin-only** |
| `reject_order(target_order_id)` | staff (verificado dentro de la función) | `pendiente → rechazado` + desactiva sus tickets | `authenticated` — **ver Hallazgo #6** |

No existen todavía (documentadas como pendientes, no construidas):
- `checkin_by_qr()` — check-in atómico de un ticket vía QR (Hallazgo #5).
- RPC de bloqueo/liberación de asientos para staff (hoy `blocked_seats` es
  admin-only a nivel de policy).

## RLS por tabla (resumen — detalle línea por línea en `0010`/`0011`/`0013`/`0014`)

| Tabla | Lectura | Escritura directa de tabla |
|---|---|---|
| `productions` | Pública | admin-only |
| `performances` | Pública | admin-only |
| `seats` | Pública | admin-only |
| `price_categories` | Pública, solo `is_active = true` | admin-only |
| `performance_price_categories` | Pública, solo funciones `on_sale` | admin-only |
| `orders` | Propietario (`buyer_user_id`) + staff (todas) | admin-only a nivel de tabla; mutación real vía RPC (ver arriba) |
| `tickets` | Propietario, solo si la orden está `aprobado` (0011) + staff (todas) | admin-only a nivel de tabla; mutación real vía RPC |
| `blocked_seats` | Staff | admin-only |
| `sellers` | Staff | admin-only |
| `contact_messages` | Pública puede `INSERT`; staff puede `SELECT` | Sin `UPDATE` para nadie salvo `mark_contact_message_read()`; `DELETE` admin-only |
| `profiles` | Propia fila; staff puede leer todas | Propia fila (nunca el propio `rol`); admin puede escribir cualquier fila (única vía de otorgar/revocar roles) |

`is_staff()` gatea únicamente lectura interna + las dos RPCs de una sola
columna (`mark_contact_message_read`, y a futuro `checkin_by_qr`).
`is_admin()` gatea toda escritura de gestión a nivel de policy — con la
excepción documentada en Hallazgo #6.

## Triggers de integridad

- `trg_set_order_code` (orders, `before insert`) — asigna `order_code` único.
- `trg_sync_and_validate_ticket` (tickets, `before insert/update`) —
  sincroniza `performance_id` desde la orden padre; rechaza un asiento que no
  pertenezca a la producción de la función.
- `trg_validate_blocked_seat_production` (blocked_seats, `before
  insert/update`) — misma validación cruzada para bloqueos.
- `trg_validate_seat_price_category` (seats, `before insert/update`) —
  rechaza asignar una categoría de precio de otra producción.
- `trg_validate_performance_price_category` (performance_price_categories,
  `before insert/update`) — rechaza mezclar categoría/función de
  producciones distintas.
- `trg_recompute_total_ins` (tickets, `after insert/update/delete`) —
  recalcula `orders.total` desde `sum(tickets.unit_price)` de tickets
  activos. **Definida dos veces** (0009 y 0011) — ver Hallazgo #3.

## Hallazgos abiertos (deuda técnica, corrección planeada en `0016`)

- **#3 — `recompute_order_total()` duplicada.** 0009 usa
  `productions.price × cantidad`; 0011 la redefine con `sum(unit_price)`. Al
  reejecutar el esquema completo, la de 0011 es la vigente; la de 0009 queda
  como código muerto. No rompe nada, es solo ruido a limpiar.
- **#4 — Grants contradictorios de `is_staff()`/`is_admin()`/
  `current_profile_role()`.** 0009 revoca de `public` y otorga solo a
  `authenticated`; 0010 otorga también a `anon`. Gana 0010 (corre después) —
  `anon` sí puede ejecutarlas hoy. Inofensivo (son de solo lectura, sin
  efectos secundarios) pero incoherente con el comentario de 0009.
- **#5 — No existe RPC de check-in/QR.** Documentado el patrón a seguir
  (RPC de una sola columna, no `UPDATE` en bloque) en `supabase/docs/
  DESIGN.md`, no construido todavía.
- **#6 — `approve_order`/`reject_order` autorizan con `is_staff()`, no
  `is_admin()`.** Contradice `orders_admin_write` (0010) y la matriz de
  permisos documentada, que hacen aprobar/rechazar exclusivo de admin.
  **Decisión del usuario:** admin-only es la regla correcta; corregir en una
  futura `0016` cambiando ambas funciones a `is_admin()`. Hasta entonces,
  staff conserva esta capacidad en la práctica.
- **#7 — `EXECUTE` otorgado a `PUBLIC` en `approve_order`/`reject_order`.**
  Verificado en vivo contra el proyecto real: además del grant a
  `authenticated` (documentado en #6), ambas funciones tienen `EXECUTE`
  otorgado al pseudo-rol `PUBLIC`. No amplía el acceso real hoy (`anon`/
  `authenticated` ya heredan de `public`; el advisor de seguridad de Supabase
  confirma que solo `authenticated` puede invocarlas vía REST) pero es un
  grant de más que conviene revocar al mismo tiempo que se corrija #6.
- **#8 — `EXECUTE` público en los triggers de validación de 0014.**
  `validate_seat_price_category()` y `validate_performance_price_category()`
  tienen `EXECUTE` otorgado a `PUBLIC` (confirmado vía advisor de seguridad
  de Supabase — categoría `anon_security_definer_function_executable`).
  Son funciones de trigger, no pensadas para invocarse como RPC directa, y el
  resto de las funciones de trigger (`sync_and_validate_ticket`,
  `validate_blocked_seat_production`, `recompute_order_total`, etc.) están
  correctamente restringidas a `postgres`/`service_role`. Revocar `EXECUTE`
  de `public` sobre estas dos en la futura `0016`, para consistencia con el
  patrón del resto de los triggers.

Ninguno de estos hallazgos se corrige editando `0009`–`0015` retroactivamente
— la corrección, cuando se haga, será una migración `0016` nueva.
