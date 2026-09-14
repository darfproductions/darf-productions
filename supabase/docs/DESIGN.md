# DARF Productions — Diseño Supabase (v5)

Estado: **el esquema `0001`–`0015` está EJECUTADO y VERIFICADO en el proyecto
Supabase real, y ahora también reflejado en GitHub (ver
`docs/CHANGELOG.md`).** El frontend (`index.html`/`js/app.js`) sigue siendo
100% `localStorage` — no hay ningún cliente Supabase conectado todavía; ver
`docs/ARCHITECTURE.md` para el plan de integración por fases.

**Venta de boletos: EN PAUSA.** `seats`, `price_categories` y
`performance_price_categories` están vacías a propósito — no se inventa el
mapa del teatro. Showman venderá boletos numerados y queda como *esqueleto*
hasta que exista el venue real y su mapa de asientos. Ninguna producción
futura se asume numerada por defecto: cada producción nueva elegirá admisión
general o por asiento cuando se cree.

v3 reemplazó la v2 en el punto donde una producción implicaba una sola
puesta en venta, introduciendo `performances` (funciones) entre
`productions` y `tickets`, y pasando el modelo de roles de dos a tres.
v4 no cambió ninguna tabla ni el modelo de performances — **redefinió y
endureció qué puede escribir cada rol** (ver sección E–G, la matriz de
permisos), separando "operar/ver" (staff) de "administrar" (admin) de forma
mucho más estricta que en v3.
v5 agrega el modelo de precios (`price_categories` +
`performance_price_categories`), el snapshot histórico `tickets.unit_price`,
y las RPCs `SECURITY DEFINER` de venta/gestión de órdenes — ver "v5 — qué
cambió respecto a v4" más abajo.

## Qué cambió respecto a v2

- **Nueva capa `performances`.** Una producción (p.ej. "Showman") puede
  tener varias funciones (sábado, domingo...). La disponibilidad y venta de
  un asiento se decide por **función**, no por producción: el mismo asiento
  físico se puede vender una vez por función.
- **Jerarquía conceptual:** `productions → performances → tickets → seats`.
  `seats` sigue colgando de `productions` (el mapa físico del venue no
  cambia entre funciones de la misma producción); lo que cambia por función
  es si ESE asiento está tomado, en ESA función.
- **`orders.production_id` desaparece.** Una orden ahora referencia
  `performance_id`; la producción se alcanza siempre vía
  `performances.production_id` — un solo lugar donde vive ese dato, para
  que nunca puedan desincronizarse.
- **`tickets.performance_id` se agrega**, sincronizado por trigger desde la
  orden padre (el cliente nunca lo escribe). Preferí derivarlo-y-mantenerlo
  sincronizado en vez de "solo derivarlo en cada lectura" porque así el
  índice anti-doble-reserva puede vivir como un índice único parcial normal
  sobre `tickets`, en lugar de una validación cruzada más frágil contra
  `orders` en cada INSERT.
- **El índice anti-doble-reserva pasa a ser compuesto:**
  `(performance_id, seat_id)` en vez de `seat_id` solo. El mismo asiento
  puede tener un ticket activo en la función del sábado y otro ticket
  activo distinto en la función del domingo — antes esto no era posible.
- **`blocked_seats` pasa a tener llave compuesta** `(performance_id,
  seat_id)` en vez de `seat_id` como llave primaria — un bloqueo es
  específico de una función, igual que una venta.
- **Nuevos triggers de integridad cruzada** (`sync_and_validate_ticket()`,
  `validate_blocked_seat_production()`) impiden que un ticket o un bloqueo
  mezclen el asiento de una producción con la función de otra producción
  distinta — un error que ninguna FK por sí sola puede detectar, porque
  `seats` y `performances` solo comparten `production_id` indirectamente.
- **Rol nuevo: `admin`.** El enum pasa de `('fan','staff')` a
  `('fan','staff','admin')`.

## v5 — Qué cambió respecto a v4

- **Precio deja de ser plano por producción.** El modelo pasa a ser
  `producción → categoría de precio → función → precio`:
  - `price_categories` — categorías nombradas por producción (p.ej. "Piso",
    "Balcón"), gestionadas exclusivamente por admin.
  - `performance_price_categories` — el precio de una categoría **para una
    función específica**; la misma categoría puede costar distinto entre la
    función del sábado y la del domingo.
  - `seats.price_category_id` — cada asiento pertenece a una categoría
    (nullable; un asiento sin categoría no es vendible por
    `create_seated_ticket_order`).
  - Dos triggers de integridad (`validate_seat_price_category()`,
    `validate_performance_price_category()`) impiden mezclar una categoría de
    una producción con asientos/funciones de otra.
- **`tickets.unit_price` — snapshot histórico del precio.** Se congela al
  momento de crear el ticket; cambiar el precio de una categoría a futuro
  nunca altera un ticket ya emitido. `NOT NULL`, `>= 0`.
  `recompute_order_total()` (0011) se reescribió para sumar `unit_price` en
  vez de `productions.price × cantidad` — ver Hallazgo #3 más abajo, la
  versión de 0009 queda como código muerto al reejecutar el esquema completo.
- **RPCs `SECURITY DEFINER` de venta y gestión de órdenes** (antes solo
  documentadas como pendientes, ahora implementadas):
  - `create_ticket_order(...)` (0011) — admisión general (sin asiento),
    invitado o autenticado. **Actualmente con `execute` revocado** de
    `anon`/`authenticated` (0015) — no es la vía de venta activa.
  - `create_seated_ticket_order(...)` (0015) — **la RPC de venta activa.**
    Recibe función + lista de `seat_id`; bloquea cada asiento (`for update`)
    para serializar reservas concurrentes; valida existencia, producción,
    actividad, no-bloqueado, sin-ticket-activo, categoría de precio y precio
    para esa función; calcula el total en servidor; inserta orden + tickets
    con `unit_price` congelado. Máximo 20 asientos por orden.
  - `approve_order(target_order_id)` / `reject_order(target_order_id)`
    (0013) — transicionan una orden `pendiente` a `aprobado`/`rechazado`;
    rechazar desactiva los tickets de la orden. **Ver Hallazgo #6 (RIESGO
    ABIERTO) inmediatamente abajo — su autorización no coincide con la
    matriz de permisos.**
  - `mark_contact_message_read(target_id)` (0009) — sin cambios respecto a
    v4.
- **`orders.expires_at`** (0012) — columna agregada, **sin uso todavía**;
  reservada para un futuro job que libere órdenes pendientes no pagadas. No
  hay ningún trigger ni cron que la lea aún.
- **Visibilidad de tickets para el comprador** (0011): `tickets_owner_read`
  ahora exige `orders.status = 'aprobado'` — un comprador ya no puede ver los
  tickets de su propia orden mientras está `pendiente` o si fue `rechazado`.

### Hallazgo #6 (RIESGO ABIERTO — decisión tomada, corrección pendiente)

`approve_order()`/`reject_order()` (0013) autorizan con `is_staff()` (true
para `staff` Y `admin`), pero la policy `orders_admin_write` (0010) y esta
misma matriz de permisos dicen que aprobar/rechazar órdenes es **exclusivo de
admin**. Es una contradicción real entre lo documentado y lo ejecutado: hoy,
`staff` SÍ puede aprobar/rechazar órdenes vía RPC, aunque no puede tocar la
tabla `orders` directamente.

**Decisión del usuario:** admin-only es la regla correcta; el comportamiento
actual de las RPCs es un bug. **Corrección planeada para una migración
futura `0016`** (cambiar `is_staff()` → `is_admin()` en ambas funciones) —
no se edita `0013` retroactivamente porque ya fue ejecutada contra Supabase.
Hasta que `0016` se aplique, **staff conserva esta capacidad en la práctica**,
fuera de lo que dice esta matriz.

## v4 — Matriz de permisos (staff vs. admin, endurecida)

**staff ya NO es superconjunto operativo de admin-lite.** A partir de v4,
`staff` es de **solo lectura interna** más un puñado de acciones puntuales
sin riesgo de integridad (check-in, marcar mensaje como leído). Todo lo que
modifica catálogo, boletería o cuentas es **exclusivo de `admin`**.

### FAN

- Su perfil y datos personales (`profiles`, propia fila).
- Su historial de órdenes/tickets (`orders`/`tickets`, propias filas vía
  `buyer_user_id`).
- Solicitud/compra de boletos (vía RPC futura, no tabla directa).
- Sin acceso a nada de Staff ni Admin.
- (Producciones/funciones privadas con autorización: fuera de alcance de
  este paso — no hay hoy una columna que distinga producción pública vs.
  privada; se diseñará cuando exista ese requisito real.)

### STAFF — solo lectura interna + check-in + triage de contacto

Puede:
- Leer `orders`, `tickets`, `profiles` (todas las filas — para atribuir
  nombres a ventas/check-ins), `sellers`, `blocked_seats`.
- Check-in de tickets — **RPC autoritativa futura, no implementada aún**
  (p.ej. `checkin_by_qr()`), nunca un `UPDATE` directo a `tickets`: no hay
  ninguna policy de `UPDATE` para staff en esa tabla, precisamente para que
  dos escáneres compitiendo por el mismo QR no puedan los dos "ganar" y
  para que staff no pueda tocar ninguna otra columna del ticket; ver
  `0010_rls_policies.sql`.
- Leer `contact_messages` y marcarlos como leídos — vía
  `mark_contact_message_read(target_id)` (0009), una función
  `SECURITY DEFINER` que solo puede cambiar `leido`, nunca vía `UPDATE`
  directo (no existe esa policy).

NO puede (a nivel RLS, no solo de UI):
- Aprobar/rechazar órdenes — **esta es la regla; ver Hallazgo #6: hoy lo
  puede hacer vía RPC por un bug pendiente de corregir en `0016`.**
- Bloquear/desbloquear asientos.
- Modificar `productions` ni `performances`.
- Gestionar boletería (crear/editar/desactivar `sellers`, crear tickets de
  taquilla).
- Eliminar `contact_messages`, ni modificar ningún campo suyo distinto de
  `leido`.
- Crear/promover/revocar usuarios ni cambiar `rol` de nadie (incluido el
  suyo).
- Escribir la fila `profiles` de otro usuario.

### ADMIN — control administrativo completo

Todo lo de staff, **más**:
- Gestionar usuarios y roles: escribir `profiles.rol` de cualquier usuario
  (promover fan→staff, revocar staff→fan, gestionar cuentas admin).
- Gestionar `productions`, `performances`, `seats`.
- Gestionar boletería: `sellers` (crear/editar/desactivar), `orders`
  (aprobar/rechazar), `tickets` (crear, anular).
- Bloquear/desbloquear asientos (`blocked_seats`).
- Eliminar `contact_messages`.

`is_staff()` sigue siendo true para AMBOS roles (`staff`, `admin`) — sigue
existiendo porque staff y admin comparten la misma superficie de LECTURA;
lo que cambió es que `is_staff()` **ya no gatea ninguna policy de escritura
sobre tablas**. Las dos únicas escrituras de staff (marcar mensaje leído
hoy; check-in cuando se implemente) ocurren dentro de funciones
`SECURITY DEFINER` de una sola columna que verifican `is_staff()` en su
cuerpo — no vía una policy `USING (is_staff())` en la tabla misma (ver
`0009_helper_functions_and_triggers.sql` y `0010_rls_policies.sql`).
`is_admin()` gatea toda escritura de gestión a nivel de policy, incluyendo
la de `profiles.rol` — la única vía para otorgar/revocar staff/admin, así
que un staff nunca puede autoascenderse ni ascender a otros.

## Tablas (archivos en `supabase/migrations/`)

| Migración | Tabla(s) / objetos | Depende del venue |
|---|---|---|
| `0001_extensions_and_enums.sql` | tipos `order_status`, `user_role` (`fan`/`staff`/`admin`) | No |
| `0002_productions.sql` | `productions` | No |
| `0003_performances.sql` | `performances` (vacía, sin seed) | No — depende de tener fechas, no del venue |
| `0004_seats.sql` | `seats` (vacía, sin seed) | Sí — solo el **seed**, no la tabla |
| `0005_profiles.sql` | `profiles` + trigger de alta automática | No |
| `0006_sellers_and_contact.sql` | `sellers`, `contact_messages` | No |
| `0007_orders_and_tickets.sql` | `orders`, `tickets` | No |
| `0008_blocked_seats.sql` | `blocked_seats` | No (útil solo si hay seats, pero no requiere que existan) |
| `0009_helper_functions_and_triggers.sql` | `is_staff()`, `is_admin()`, `current_profile_role()`, código de orden autogenerado, sincronización/validación de `tickets`/`blocked_seats`, recálculo de `total` (versión superada por 0011, ver Hallazgo #3), grants/revokes de ejecución | No |
| `0010_rls_policies.sql` | políticas RLS de todas las tablas + grants de ejecución de helper functions (ver Hallazgo #4) | No |
| `0011_ticketing_rpcs.sql` | `tickets.unit_price`, `recompute_order_total()` (versión final, por `unit_price`), `tickets_owner_read` (solo `aprobado`), `create_ticket_order()` (admisión general, hoy revocada) | No |
| `0012_order_expiration.sql` | `orders.expires_at` (scaffold sin uso) | No |
| `0013_manual_order_management.sql` | `orders.rejected_at`, `approve_order()`, `reject_order()` (ver Hallazgo #6) | No |
| `0014_ticket_pricing.sql` | `price_categories`, `performance_price_categories`, `seats.price_category_id`, triggers de validación de categoría | No |
| `0015_seat_reservation.sql` | `create_seated_ticket_order()` (RPC de venta activa), revoca `create_ticket_order()` | Sí — la RPC no tiene inventario que reservar hasta que existan `seats`/`price_categories` reales |

Todas ejecutadas ya contra el proyecto Supabase real, en orden. `0001`–`0013`
no dependen del venue; `0014` tampoco (son categorías abstractas, no un
mapa); `0015` define la RPC de venta pero esa RPC no tiene nada que vender
hasta que `seats` y `price_categories` tengan filas reales — ver "Venta de
boletos: EN PAUSA" al inicio de este documento.

### Deuda técnica conocida (no se corrige editando migraciones históricas)

- **Hallazgo #3 — `recompute_order_total()` duplicada.** `0009` la define
  usando `productions.price × cantidad`; `0011` la redefine (`create or
  replace`) usando `sum(unit_price)`. Al reejecutar el esquema completo en
  orden, la versión de `0011` es la que queda vigente — la de `0009` es
  código muerto desde el momento en que `0011` corre. No rompe nada, pero es
  confuso de leer sin este apunte. Limpieza planeada: en una futura `0016`,
  simplificar `0009` para no redefinir una función que se va a reemplazar
  dos migraciones después (o dejar un comentario explícito en `0009` mismo).
- **Hallazgo #4 — grants contradictorios sobre `is_staff()`/`is_admin()`/
  `current_profile_role()`.** `0009` las revoca de `public` y las otorga
  solo a `authenticated`; `0010` las otorga también a `anon`. Como `0010`
  corre después, `anon` **sí** puede ejecutarlas hoy. Es inofensivo (son
  `SECURITY DEFINER`, `stable`, sin efectos secundarios, y devuelven `false`/
  `NULL` para un caller sin sesión), pero es incoherente con la intención
  documentada en `0009`. Limpieza planeada: unificar el grant en una futura
  `0016`, decidiendo explícitamente si `anon` debe poder ejecutarlas
  directamente (hoy no tiene necesidad real de hacerlo fuera de RLS).

## A/B. Tablas y columnas — los archivos `.sql` son la fuente de verdad

No repito columna por columna para no arriesgar que este documento y el SQL
se desincronicen. Cambios de forma respecto a v2:

```
performances                        -- nueva
  id, production_id → productions,
  starts_at timestamptz not null,   -- fecha/hora de la función
  venue text,                       -- opcional: solo si la función corre en otro lugar que productions.venue
  on_sale boolean default false,
  created_at, updated_at
  -- SIN seed. 0 filas hasta que staff/admin cree una función real.

orders
  ... igual que v2, PERO:
  performance_id uuid not null references performances(id)   -- reemplaza production_id
  -- production_id fue ELIMINADO de orders; se alcanza vía performances.production_id

tickets
  ... igual que v2 (seat_id sigue NULL-able = admisión general), PERO:
  performance_id uuid not null references performances(id)
  -- sincronizado por trigger desde orders.performance_id; el cliente no lo escribe

blocked_seats
  performance_id uuid not null references performances(id),  -- nueva columna
  seat_id uuid not null references seats(id),
  primary key (performance_id, seat_id)                       -- antes: seat_id solo
```

## C. Relaciones

```
productions ← performances ← orders ← tickets → seats
                    ↑                              ↑
                    └────────── blocked_seats ──────┘
```

- `performances.production_id → productions`
- `orders.performance_id → performances` (ya no hay `orders.production_id`)
- `tickets.order_id → orders`, `tickets.performance_id → performances` (sincronizado, no independiente)
- `tickets.seat_id → seats` (**nullable** — admisión general)
- `blocked_seats.(performance_id, seat_id) → performances, seats`
- `seats.production_id → productions` (el mapa físico sigue siendo por producción, no por función)
- `orders.seller_id → sellers`, `orders.buyer_user_id → auth.users`, `profiles.id → auth.users` (1:1)

## D. Estados

- Orden: `pendiente → aprobado | rechazado` (sin cambios).
- Ticket: `activo` (`is_active=true`, `checked_in_at NULL`) →
  `usado` (`checked_in_at` set) — `is_active=false` si la orden padre se
  rechaza. El "estado de un asiento" en una función específica sigue
  derivándose de sus tickets/bloqueos activos **dentro de esa función**;
  el mismo asiento en otra función es un cálculo independiente.

## E–G. Público / autenticado / staff / admin

- **Público (sin login):** catálogo de producciones, lista de funciones
  (`performances`, para elegir "sábado vs. domingo" en el checkout), y mapa
  de asientos (`seats`) — todo sin PII. Estar `seats`/`performances` vacías
  no cambia esta clasificación, solo el resultado (0 filas).
- **Autenticado:** ver sus propias órdenes/tickets.
- **Staff:** solo lectura interna (`orders`, `tickets`, `profiles`,
  `sellers`, `blocked_seats`) + check-in + marcar `contact_messages` como
  leído. Ninguna escritura de gestión — ver matriz completa en la sección
  "v4 — Matriz de permisos" más arriba.
- **Admin (exclusivo):** todo lo de staff, **más** toda escritura de
  gestión — `productions`, `performances`, `seats`, `orders`, `tickets`,
  `blocked_seats`, `sellers`, eliminar `contact_messages`, y la capacidad de
  escribir la fila `profiles` de cualquier otro usuario (única forma de
  otorgar/revocar `staff`/`admin`).

## H. RLS — resumen (detalle en `0010_rls_policies.sql`)

- `productions`, `performances`, `seats`: lectura pública, escritura
  **admin-only** (`productions_admin_write`, `performances_admin_write`,
  `seats_admin_write`). Staff no tiene ninguna policy de escritura sobre
  estas tablas.
- `orders`, `tickets`: lectura para el propietario (`buyer_user_id`, y solo
  de órdenes `aprobado` en el caso de `tickets` — ver v5) y para staff
  (`orders_staff_read`, `tickets_staff_read`); **ninguna escritura directa de
  tabla para cliente ni para staff** — toda mutación pasa por RPC
  `SECURITY DEFINER`: crear orden (`create_ticket_order`/
  `create_seated_ticket_order`), aprobar/rechazar (`approve_order`/
  `reject_order`, 0013 — **ver Hallazgo #6**, autorizan con `is_staff()` en
  vez de `is_admin()`, contradiciendo `orders_admin_write` a nivel de tabla).
  `orders_admin_write`/`tickets_admin_write` siguen existiendo para permitir
  a admin una intervención directa de emergencia sin pasar por RPC.
  **Check-in no tiene ninguna policy de `UPDATE` para staff** — ni siquiera
  restringida a columnas, porque RLS por sí sola no puede limitar un
  `UPDATE` a columnas específicas. Cuando se construya (fase posterior, no
  incluida aquí), será una RPC `SECURITY DEFINER` (p.ej. `checkin_by_qr()`)
  que solo puede tocar `checked_in_at`/`checked_in_by` de forma atómica —
  mismo patrón que `mark_contact_message_read()` (0009) para
  `contact_messages`.
- **Doble reserva evitada por función:** índice único parcial
  `uq_tickets_active_seat_per_performance` sobre
  `(performance_id, seat_id)` — el mismo asiento puede tener, como máximo,
  un ticket activo *por función*; nada le impide tener un ticket activo
  distinto en otra función. Con `seats`/`performances` vacías, el índice
  simplemente no tiene nada que restringir todavía.
- **Integridad cruzada producción↔función↔asiento:** los triggers
  `sync_and_validate_ticket()` (en `tickets`) y
  `validate_blocked_seat_production()` (en `blocked_seats`) rechazan con
  excepción cualquier intento de asociar el asiento de una producción con
  la función de otra producción distinta.
- `blocked_seats`: lectura staff (`blocked_seats_staff_read`), escritura
  **admin-only** (`blocked_seats_admin_write`).
- `profiles`: el propio usuario puede leer/editar su fila, **nunca su
  `rol`** — el `WITH CHECK` reafirma el rol ya almacenado
  (`current_profile_role()`). **Staff puede leer todos los perfiles pero no
  escribirlos; solo admin puede escribir la fila de otro usuario** — esta es
  la asimetría staff/admin de mayor riesgo en todo el esquema: es el único
  punto donde otorgar el permiso equivaldría a poder auto-ascender a
  alguien (incluido uno mismo, indirectamente, pidiéndole a otro staff).
- `sellers`: lectura staff (`sellers_staff_read`), escritura **admin-only**
  (`sellers_admin_write`) — sin SELECT público de la tabla completa.
- `contact_messages`: INSERT público; SELECT por staff
  (`contact_messages_staff_read`); DELETE **admin-only**
  (`contact_messages_admin_delete`). **Sin policy de `UPDATE` para staff en
  absoluto** — un `UPDATE ... USING (is_staff())` habría dejado a staff
  reescribir `nombre`/`correo`/`telefono`/`mensaje`/`created_at`, no solo
  `leido`. Marcar como leído es la función `SECURITY DEFINER`
  `mark_contact_message_read(target_id)` (0009): verifica `is_staff()`
  internamente y ejecuta un `UPDATE ... SET leido = true` de una sola
  columna — es imposible, por construcción, que cambie cualquier otro
  campo.

## I. Qué falta para conectar el frontend (fuera de alcance de esta fase)

Ya implementado en Supabase (no falta en la DB, falta conectarlo):
`create_ticket_order`, `create_seated_ticket_order`, `approve_order`,
`reject_order`, `mark_contact_message_read`.

Todavía no existe en ningún lado, a propósito:
- `checkin_by_qr()` (o equivalente) — check-in atómico de un ticket vía QR,
  mismo patrón de RPC de una sola columna que `mark_contact_message_read`.
  Diseñado en la sección H, no construido (Hallazgo #5).
- RPC de bloqueo/liberación de asientos para staff (hoy `blocked_seats` es
  admin-only por policy; si se quiere que staff bloquee asientos sin ser
  admin, hace falta una RPC narrow análoga a las anteriores).
- Cliente Supabase en `js/app.js` / `index.html` — el frontend sigue siendo
  100% `localStorage`, la librería `@supabase/supabase-js` está cargada por
  CDN pero nunca se usa.
- UI para elegir función y para mostrar categorías/precios por función (hoy
  el checkout de `js/app.js` solo conoce una "producción" con precio plano).
- Seed real de `performances` (fechas), `seats` (numeración real del venue),
  `price_categories` y `performance_price_categories` (precios reales).

## J. Qué falta específicamente antes de vender de verdad

1. **Funciones:** para cada producción, crear sus filas reales en
   `performances` (fecha/hora, venue si aplica, `on_sale`). Sin venue
   confirmado esto ya se puede hacer — una función no requiere saber la
   numeración de asientos.
2. **Asientos + precios** (para producciones que venden por asiento
   numerado, como Showman):
   - Confirmar el venue.
   - Obtener el plano/numeración real: secciones, filas, asientos por fila.
   - Escribir una migración de **seed** dedicada (p.ej.
     `0017_seed_seats_showman.sql`, después de que `0016` limpie la deuda
     técnica), separada de este esquema.
   - Crear las `price_categories` reales de esa producción y sus precios
     por función en `performance_price_categories`.
3. Para producciones futuras que elijan admisión general en vez de asiento
   numerado: no requieren seed de `seats`/`price_categories` — pero
   `create_ticket_order` está **revocado** hoy (0015); habría que
   re-otorgarle `execute` a `anon`/`authenticated` cuando exista al menos una
   producción de admisión general real (no antes, para no abrir una vía de
   compra que no corresponde a ningún producto real).
4. Solo entonces tiene sentido activar el checkout del frontend contra estas
   RPCs, por producción, según su modalidad de venta.

Nada de esto bloquea correr `0001`–`0015` hoy; el esquema completo ya está
ejecutado y verificado — lo que falta es dato real (venue/precios) y el
cliente frontend, no más tablas ni RPCs base.

## K. Preparado para (fase posterior, no implementado todavía)

El esquema actual ya soporta, sin cambios adicionales de tablas, lo
siguiente — queda documentado como trabajo futuro, no como parte de este
paso:

- **Panel Admin de gestión de cuentas:** listar `profiles` (staff ya puede
  leerlas todas vía `profiles_staff_read`) y escribir `rol` vía
  `profiles_admin_write`. No requiere columnas nuevas.
- **Creación/invitación de Staff:** hoy no existe un flujo de invitación —
  la única vía es que un admin cree el `auth.users` (o el usuario se
  registre como `fan` vía `handle_new_user()`) y luego un admin promueva
  `rol='staff'` escribiendo `profiles` vía `profiles_admin_write`. Un flujo
  de invitación por correo (tabla `invitations` + Edge Function) es una
  fase separada, no incluida aquí.
- **Revocación de Staff:** ya soportado hoy — un admin hace
  `update profiles set rol='fan' where id = ...`, cubierto por la misma
  policy `profiles_admin_write`. No requiere ninguna tabla nueva.
- **Registro de actividad administrativa (audit log):** **no implementado
  en este paso.** Ninguna tabla `audit_log` existe todavía. Cuando se
  aborde, el diseño previsto es una tabla `audit_log (id, actor_id,
  action, target_table, target_id, before, after, created_at)` poblada por
  triggers `AFTER` sobre las tablas sensibles a escritura admin
  (`profiles`, `orders`, `tickets`, `blocked_seats`, `sellers`,
  `productions`, `performances`) — o por las RPCs `SECURITY DEFINER`
  cuando se diseñen, para no duplicar lógica entre trigger y RPC. Queda
  fuera de alcance de esta migración; se documenta aquí solo para que la
  fase de RLS actual (v4) no cierre esa puerta.
