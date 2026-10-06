# Mapa interactivo de asientos en el panel de staff — Diseño

Fecha: 2026-10-05
Estado: **diseño aprobado en conversación; spec pendiente de revisión por Johann. Sin código escrito.**
Siguiente paso: invocar `superpowers:writing-plans` (solo tras aprobación de este spec).

## 1. Objetivo

Mostrar en la sección **Boletaje** del panel de staff el mapa real de los 725
asientos de Showman (Teatro de la Ciudad), por función, y permitir operar sobre
él con roles estrictos:

| Rol | Puede |
|---|---|
| `admin` | Ver el mapa, bloquear, liberar (incluso asientos vendidos), generar boleto, validar QR |
| `staff` | Ver el mapa (sin selección ni botones de acción) y validar QR en la entrada |
| `fan` / anónimo | Nada de esto |

Decisión explícita de Johann: **solo admin escribe** (bloquear, liberar, generar
boleto). Staff solo ve y valida QR.

## 2. Estado actual (punto de partida)

- Boletaje en [js/app.js](../../../js/app.js) (`renderBoletajeProductions`, ~L1326):
  hoy es un **placeholder** con selector de producción + función y el texto
  "pendientes del mapa real". Ya filtra producciones `concluded`.
- Existe un mapa **prototipo** de 6×8 (`allSeatIds`, `SEAT_ROWS`, `SEAT_COLS`,
  `renderStaffSeatMap`, `buildBoletajeProdCard`) sobre `localStorage`
  (`DB.getSeatsTaken`, `blockSeats`, `releaseSeats`, `createStaffTicket`,
  `checkInByQr`). Este prototipo se retira.
- Supabase ya tiene el venue cargado (migraciones aplicadas en esta sesión):
  - `seats`: 725 filas de Showman (Preferente 469, VIP 200, Exclusivo 50,
    Discapacitados 6) con `section`, `seat_row`, `seat_number`, `seat_label`,
    `price_category_id`.
  - `price_categories` (4) y `performance_price_categories` (8 precios: Exclusivo
    $400, VIP $350, Preferente $300, Discapacitados $300).
  - `performances`: 2 funciones de Showman con `starts_at = null` y
    `on_sale = false`. `productions.showman`: `venue = 'Teatro de la Ciudad'`,
    `on_sale = false`.
- RLS relevante (migración 0010):
  - `seats_public_read`, `seats_admin_write`.
  - `orders_staff_read`, `orders_admin_write`; `tickets_staff_read`,
    `tickets_admin_write`.
  - `blocked_seats_staff_read`, `blocked_seats_admin_write`.
- RPC de venta existente `create_seated_ticket_order` (0015) **no sirve** para
  staff/admin: exige `performance.on_sale` y `production.on_sale`, crea órdenes
  `pendiente` y no tiene bypass de rol. `approve_order`/`reject_order` son
  `is_admin()` desde 0016.
- Anti-doble-reserva: índice único parcial sobre
  `tickets(performance_id, seat_id) where is_active and seat_id is not null`.
  Triggers existentes validan producción/precio de tickets y recalculan el total
  de la orden (0009, 0011, 0014). El cliente nunca manda precios.

## 3. Permisos y flujo de datos

| Acción | Quién | Mecanismo |
|---|---|---|
| Ver mapa, estados, compradores | staff, admin | Lectura directa (RLS ya lo permite) |
| Bloquear / liberar bloqueo | admin | Escritura directa a `blocked_seats` (ya admin-only; sin migración) |
| Generar boleto | admin | RPC nueva `admin_create_seated_order` |
| Liberar asiento vendido | admin | RPC nueva `admin_cancel_ticket` (pone `is_active = false`); con confirmación en UI |
| Validar QR | staff, admin | RPC nueva `check_in_ticket(qr_token)` |

### RPCs nuevas (migración `0021`)

Todas: `security definer`, `set search_path = public`, validación de rol dentro de
la función, `revoke execute ... from public, anon`, `grant execute ... to
authenticated` (lección de 0016).

1. `admin_create_seated_order(target_performance_id uuid, target_buyer_nombre
   text, target_buyer_telefono text, target_seat_ids uuid[], target_seller_codigo
   text default null) returns json`
   - `is_admin()` o excepción "No autorizado".
   - Validaciones equivalentes a 0015 (nombre/teléfono obligatorios, 1–20
     asientos, sin duplicados, asiento existe/activo/de la misma producción/con
     categoría y precio para esa función) **excepto** que **no** exige `on_sale`.
   - Rechaza asientos con ticket activo en esa función o presentes en
     `blocked_seats` de esa función. Bloquea filas de `seats` con `for update`
     para serializar concurrencia, como 0015.
   - Crea `orders` con `status = 'aprobado'`, `approved_by/approved_at`,
     `created_by_staff_id = auth.uid()`, `seller_id` si viene código válido, y un
     `tickets` por asiento (los triggers existentes calculan `unit_price` y total).
   - Devuelve `order_id`, `order_code`, `total` y por ticket `ticket_id`,
     `seat_id`, `seat_label`, `qr_token`.
2. `admin_cancel_ticket(target_ticket_id uuid) returns json`
   - `is_admin()`; pone `tickets.is_active = false` (libera el asiento en esa
     función). No borra filas (historial). Si la orden queda sin tickets activos,
     queda en su estado actual (no se reescribe historial de órdenes).
3. `check_in_ticket(target_qr_token uuid) returns json`
   - `is_staff()` (que incluye admin; verificar en `0009`).
   - Resultado: `ok`, `ya_usado`, `no_encontrado`, `cancelado` (ticket inactivo),
     más datos para mostrar (asiento, función, comprador). Si es `ok`, setea
     `checked_in_at = now()`, `checked_in_by = auth.uid()` de forma atómica (update
     condicionado `where checked_in_at is null and is_active`).

### Cambio de esquema

- `alter table seats add column if not exists lado text check (lado in
  ('izquierda','central','derecha'))`.
- Poblado en la misma migración a partir de los cortes por fila de
  [supabase/seeds/gen_showman_seats.py](../../../supabase/seeds/gen_showman_seats.py)
  (`fin_izq`, `fin_centro`, `fin_der`): `lado = izquierda` si
  `seat_number <= fin_izq`, `central` si `<= fin_centro`, si no `derecha`.
  Fila J de Preferente es `(0, 11, 11)` → todos centrales. Discapacitados J1–J3
  `izquierda`, J4–J6 `derecha`.
- Verificación interna con `do $$` (conteo de asientos sin `lado` = 0), al estilo
  de 0018/0020.

## 4. Mapa: render e interacción

- **HTML** (no SVG). Una fila por `seat_row`, centrada; tres bloques
  (`izquierda` / `central` / `derecha`) separados por pasillo. Escenario arriba
  ("— Escenario —", como `.stage-screen` del mapa del comprador). Orden de filas
  de A (cerca del escenario) a X (fondo). Scroll horizontal en pantallas chicas.
- Fila J: Discapacitados (3) | Preferente (11) | Discapacitados (3).
- Cada asiento muestra su número; tooltip/`title` con `seat_label`, categoría,
  precio de esa función y, si está vendido, nombre del comprador.
- **Selección** (solo admin): clic alterna; cualquier estado es seleccionable
  (como el prototipo). Panel de resumen: asientos elegidos, categoría, total
  informativo (el real lo calcula la RPC) y botones **Bloquear**, **Liberar**,
  **Generar Boleto** (nombre y teléfono del comprador obligatorios, código de
  vendedor opcional). Staff ve el mapa sin selección ni panel de acciones.
- Encabezado por función: total / vendidos / bloqueados / disponibles.
- Botón **Actualizar**; recarga automática tras cada acción. Sin tiempo real
  (YAGNI).

### Colores

Relleno del asiento = **solo** color de estado (los ya definidos, sin cambios):

| Estado | Color | Clase CSS existente |
|---|---|---|
| Disponible | azul `#1565C0` | `.disp` |
| Seleccionado | rosa `#EC4899` | `.sel` |
| Pendiente | dorado `#D4A017` | `.pend` |
| Comprado | rojo `#E5445A` | `.ap` |
| Usado | verde `#22c55e` | `.usado` |
| Bloqueado | gris `#7a7a7a` | `.bloq` |

La **zona** se marca en un canal separado (franja lateral + etiqueta de fila),
con colores que no chocan con los de estado:

| Zona | Color |
|---|---|
| Exclusivo (antes roja) | violeta `#8B5CF6` |
| VIP (antes azul) | turquesa `#14B8A6` |
| Preferente (antes rosa) | naranja `#F97316` |
| Discapacitados (antes marrón) | café `#A0724A` |

Dos leyendas separadas: estados y zonas. Nota: el naranja es el más cercano al
dorado/rojo; por eso la zona nunca se usa como relleno de asiento. Verificar
contraste visualmente al implementar.

### Mapeo de estado (por función)

Ticket activo con orden `pendiente` → pendiente · orden `aprobado` → comprado ·
ticket con `checked_in_at` → usado · fila en `blocked_seats` → bloqueado · resto →
disponible.

### Carga de datos

Al elegir producción + función: `seats` (por producción), `blocked_seats`
(por función), `tickets` activos con `orders` (por función) y
`performance_price_categories`. Se reutiliza el cliente `sb` y el patrón de caché
+ `notify` de `DB` en [js/app.js](../../../js/app.js).

## 5. Check-in (staff y admin)

El escáner/validador de QR de staff pasa de `DB.checkInByQr` (localStorage) a la
RPC `check_in_ticket`. Un QR por asiento (`tickets.qr_token`), igual que
`seatQrs` del prototipo.

## 6. Errores y seguridad

- RPCs todo-o-nada. Si un asiento cambió de estado mientras el admin elegía, la
  RPC rechaza toda la operación; la UI recarga el mapa y muestra el mensaje (en
  español) con el `flash` existente.
- "Liberar" sobre asiento vendido pide confirmación.
- Nombres de compradores y cualquier dato de BD se pintan con `textContent`,
  nunca `innerHTML`.
- El rol efectivo siempre viene de `profiles.rol` (ya es así en Fase 1); la
  ocultación de botones para staff es UX, la autorización real es RLS/RPC.

## 7. Pruebas

- **SQL (antes de aplicar a producción):** ejecutar `0021` dentro de una
  transacción con `rollback` y simular roles (anon, fan, staff, admin) con
  `set local role` + `request.jwt.claims`. Casos: cada RPC rechaza el rol
  incorrecto; `admin_create_seated_order` cobra precios de la BD, no acepta
  asientos bloqueados/ocupados, no depende de `on_sale`; vender el mismo asiento
  dos veces falla; `admin_cancel_ticket` libera el asiento; `check_in_ticket` dos
  veces → `ya_usado`; QR inválido y ticket cancelado.
- **Frontend (navegador):** con admin y con staff. 725 asientos renderizados,
  pasillos correctos, contadores cuadran, bloquear/liberar/generar/cancelar,
  check-in, y que staff no vea acciones.

## 8. Orden de implementación

1. Migración `0021` (`seats.lado` + 3 RPCs), validada en transacción con rollback.
2. Capa de datos de asientos en `js/app.js` (carga + caché + llamadas a RPC).
3. Render del mapa + CSS (franjas y leyendas de zona).
4. Acciones de admin (bloquear, liberar, generar, cancelar).
5. Check-in de staff conectado a la RPC.
6. Limpieza: retirar el mapa 6×8 y su código `localStorage`; quitar el guard de
   fecha obligatoria en `DB.createPerformance` (contradice 0019); actualizar
   `docs/DATABASE.md`, `docs/ARCHITECTURE.md` y `docs/CHANGELOG.md`.

## 9. Fuera de alcance

Checkout público de compradores (sigue oculto hasta activar la venta), tiempo
real, soporte de otros teatros, edición del mapa desde la UI.

## 10. Notas operativas

- Las migraciones `0017`–`0020` ya están aplicadas en Supabase, pero el historial
  de Supabase las registró como `productions_add_concluded`,
  `showman_categories_and_seats`, `performances_date_tbd` y
  `showman_functions_and_prices` (versiones 20261006…), no con los números del
  repo. Solo importa si se usa el CLI (`supabase migration repair`).
- Regla del proyecto: no editar migraciones ya ejecutadas; el cambio nuevo es
  `0021`.
- Revisar en `0009` que `is_staff()` incluya al rol admin antes de depender de
  ello en `check_in_ticket`.
- Vercel despliega `main` al hacer push; no se hace commit/push sin que Johann lo
  pida.
