# DARF Productions — Changelog

Historial de cambios significativos al proyecto (esquema de datos,
arquitectura, decisiones de producto). No es un changelog de cada commit —
para eso está `git log`. Este documento registra *por qué* cambió algo, no
solo *qué*.

## 2026-10-06 — Zona General en Showman (migración 0024, pendiente de aplicar) y validación QR

- **Decisión de Johann:** filas J–Q siguen como Preferente a $300; filas R–X
  pasan a **General** a $250 c/u (227 asientos; Preferente queda en 242). Reemplaza
  la decisión del 2026-10-05 de que no existiera zona General.
- La migración `0024` crea la categoría, reasigna asientos (categoría, zona
  `Zona Verde` y etiqueta `General-…`) y agrega el precio a cada función. Se
  detiene si hubiera boletos en esas filas. Las pruebas 0021–0023 usan ahora
  asientos `Preferente-K-…`.
- El mapa muestra la zona General (verde lima) en la leyenda y en los asientos.
- Migración `0025` (pendiente): una función creada desde el panel hereda los
  precios de la función más reciente; antes nacía sin precios y no se podía comprar.
- Control de Accesos: el marco del escáner queda centrado y cuadrado, el
  estado ("Esperando…", nombre/asiento, "Ya utilizado") ya no se desplaza, y el
  área de lectura de la cámara se ajusta al marco.

## 2026-10-06 — Checkout público real (migración 0023, pendiente de aplicar)

- "En venta" de una función (con fecha) activa el botón "Comprar Boletos" en la
  página de Showman. Ya no depende de `productions.on_sale`.
- Checkout con los 725 asientos reales, precios por zona y selector de función;
  crea una orden `pendiente` con `create_seated_ticket_order` (requiere sesión).
  Las órdenes pendientes **apartan** sus asientos hasta que un admin las aprueba o
  rechaza. Máximo 3 pendientes por usuario. Código de vendedor opcional.
- `get_taken_seats(performance)`: lectura pública de ids de asientos no
  disponibles (sin datos de compradores).
- Staff: lista "Solicitudes pendientes" con Aprobar/Rechazar (admin) en Boletaje.
- Mis Boletos lee de Supabase (QR = `tickets.qr_token`); pendientes con botón de
  pago por WhatsApp.
- Ventas de Cartelera: conteo de Showman desde Supabase.
- Código del prototipo localStorage de órdenes (`DB.createOrder`, etc.) quedó sin uso.

## 2026-10-05 — Panel de staff: concluidas, eliminar función, bases de datos

- Gestión de Producciones: las producciones concluidas se agrupan en una carpeta
  colapsable "Producciones concluidas" al final.
- Eliminar función: botón por función y RPC `admin_delete_performance`
  (migración 0022, **pendiente de aplicar**). Solo admin; se rechaza si hay boletos
  activos. Los boletos cancelados y sus órdenes se borran con la función porque
  `orders`/`tickets` → `performances` no tienen cascade.
- Nueva sección "Bases de Datos" (solo lectura, Supabase): compradores (boletos con
  orden, teléfono, asiento, estado, vendedor, búsqueda) y estadísticas por zona
  (capacidad, vendidos, ingresos, disponibles, bloqueados) por función o todas.
  Reemplaza la "base de datos de boletos" del prototipo localStorage, retirada
  con el mapa interactivo.

## 2026-09-13 — Fase 1 (en curso): fundación Supabase en frontend + hardening

**Contexto:** con Fase 0 cerrada y GitHub como historia autoritativa, Johann
entregó un to-do maestro de 17 secciones para organizar el trabajo restante.
Una auditoría completa del frontend (`index.html`, `js/app.js`) confirmó que
la app seguía siendo 100% prototipo `localStorage` — el cliente Supabase
nunca se instanciaba a pesar de cargar el SDK — con varios hoyos de
seguridad reales (credenciales de staff en texto plano en la página, rol de
usuario confiado desde `localStorage` editable). Fase 1 ataca esa fundación
sin tocar la boletería de Showman, que permanece oculta hasta tener venue.

**Hecho en esta fase (hasta ahora):**
- **Paso 1:** creado `js/config.js` (URL + publishable key, público por
  diseño, commiteado) e instanciado el cliente Supabase real en `js/app.js`,
  reemplazando el stub comentado. Sin cambio de comportamiento todavía.
- **Paso 2 — migración `0016_security_hardening.sql`** (aplicada tras
  aprobación explícita de Johann, verificada con `get_advisors` antes/
  después): corrige los Hallazgos **#6** (`approve_order`/`reject_order`
  ahora autorizan con `is_admin()`, no `is_staff()`) y **#7/#8** (revocado
  `EXECUTE` de `PUBLIC` sobre esas dos funciones y sobre los triggers de
  validación de precio de `0014`). Hallazgos #3 y #4 quedaron documentados
  sin cambio de SQL (decisiones ya tomadas: código muerto inofensivo y
  grant a `anon` intencional, respectivamente).
- **Pasos 3+4 — Auth real + rol server-trusted:** `AuthService` reescrito
  contra `sb.auth` (`signUp`/`signInWithPassword`/`signOut`/`updateUser`/
  `resend`/`getSession`/`onAuthStateChange`); verificación de correo por
  enlace en vez de código. El rol ya no se lee de `localStorage` — se lee
  siempre de `profiles.rol` vía `fetchProfile()` tras cada login/restauración
  de sesión.
- **Paso 5:** eliminado el recuadro de credenciales demo en `index.html` y
  la función `seedDemoUsers` (ya sin uso desde el rewrite de Auth).
- **Paso 6 — Google OAuth:** `loginGoogle()` ahora llama
  `sb.auth.signInWithOAuth({provider:'google'})`; provider configurado por
  Johann en el dashboard de Supabase.
- **Paso 7 — catálogo desde Supabase (con seed aprobado):** `DB.getProductions`/
  `getProduction` ahora leen de la tabla `productions` vía
  `sb.from('productions').select()` (antes: objeto hardcodeado en
  `js/app.js`). Insertadas las 3 filas reales tras aprobación explícita de
  Johann: Showman ($250, venue por confirmar, `on_sale=false`), Mamma Mia!
  ($150, Teatro UVM Juriquilla, `on_sale=false`), High School Musical ($50,
  Teatro Universidad Humanitas Querétaro, `on_sale=false`). No se tocó
  `seats`/`price_categories`/`performance_price_categories` — siguen vacías.
- **Paso 8 — panel staff: buzón de contacto + vendedores:** `DB` swap
  completo de `contact_messages` y `sellers` de `localStorage` a Supabase.
  Formulario público de contacto → `INSERT` (RLS pública); buzón del panel
  staff → `SELECT` (RLS staff); eliminar mensaje → `DELETE` (RLS admin-only).
  Alta de vendedor → `INSERT` en `sellers` (RLS admin-only, un `staff` sin
  rol admin verá el error de RLS al intentarlo — comportamiento esperado,
  no una regresión). Ambas cachés se recargan al abrir el panel staff (sin
  Realtime todavía, como estaba previsto para Fase 1).
- **Paso 9 — confirmar boletería de Showman oculta:** verificación (sin
  cambio de código): `currentOnSaleProduction()` depende de
  `productions.on_sale` (Supabase, `false` en la fila real; el único camino
  de escritura, `toggleShowmanOnSale`, está protegido por
  `productions_admin_write`, admin-only). `renderShowmanBanner` solo crea el
  botón "Comprar Boletos" cuando hay producción en venta; `renderCheckout`
  oculta el mapa de asientos y muestra el aviso "aún no están a la venta"
  cuando no la hay; `proceedToPayment` retorna de inmediato si no hay
  producción en venta. Ninguna ruta de UI llega al mapa de asientos ni al
  pago mientras `on_sale=false`. `seats`/`price_categories`/
  `performance_price_categories` confirmadas en 0 filas. **Fase 1 completa.**

## 2026-10-05 — Mapa interactivo de staff (0021)

**Qué:** el Boletaje del panel de staff muestra el mapa real de 725 asientos de
Showman por función. Admin: bloquear, liberar (también asientos vendidos, con
confirmación), generar boleto y cancelar. Staff: ver el mapa y validar QR.

**Base de datos (migración 0021, aplicada como `seat_map_rpcs`):** `seats.lado`
(poblado desde los cortes por fila) y tres RPCs `security definer` con el rol
validado dentro: `admin_create_seated_order` (no depende de `on_sale`),
`admin_cancel_ticket` y `check_in_ticket(text)`. Validada antes de aplicar con una
transacción que simula anon/fan/staff/admin y termina en rollback
(`supabase/tests/0021_seat_map_rpcs_test.sql`).

**Frontend:** el check-in pasa de `localStorage` a la RPC. Se retiró el mapa
prototipo 6×8 y su código (`localStorage`), incluido el botón "Simular Escaneo".
La gestión de Vendedores (que quedó inalcanzable al deshabilitar el Boletaje
prototipo) se restauró en un bloque bajo el mapa. `DB.createPerformance` ya no exige
fecha (coherente con 0019).

**Fuera de alcance / pendiente:** checkout público, tiempo real, boleto visual
(QR dibujado/PDF/Wallet), códigos de descuento.

## 2026-10-05 — Mapa de Showman y pendientes futuros

**Decisiones de Johann (Teatro de la Ciudad):** zonas Roja/Exclusivo (50, $400), Azul/VIP (200, $350), Rosa/Preferente (469,
$300) y Marrón/Discapacitados ($300, solo 6 espacios habilitados de los 10 de
la fila J). No existen la zona Naranja/Especial (filas Y–DD) ni General.
Migraciones `0018` (categorías + 725 asientos), `0019` (funciones con fecha por
definir) y `0020` (venue, 2 funciones y precios) preparadas, **no ejecutadas**.

**Pendiente futuro (sin número asignado):** capacidad por categoría para
boletos sin asiento (admisión general). Hoy no hace falta: Showman no vende
General. Se retoma cuando una producción lo necesite.

## 2026-10-05 — Auth en producción + responsive

**Contexto:** Johann probó el sitio publicado: la cuenta nueva no aparecía en
Supabase y una contraseña incorrecta daba acceso. Causa verificada: Vercel
seguía sirviendo el prototipo `localStorage` (los commits de Fase 1 y 2 no
estaban en `origin/main`). Tras el push (`f50409f..12d61b2`), el registro real
quedó verificado por Johann: usuario en `auth.users`, fila en `profiles` por el
trigger `handle_new_user`, confirmación por enlace y sesión iniciada. El primer
admin se promovió con un `UPDATE profiles` aprobado explícitamente, y la
sección "Gestión de Producciones" (Fase 2) funcionó con esa cuenta.

**Hecho:**
- **Auth:** `signUp`/`resend` pasan `emailRedirectTo` (el enlace vuelve al
  sitio); se detecta correo ya registrado (`identities` vacío) y el caso de
  sesión directa si "Confirm email" estuviera desactivado.
- **Responsive (sin verificar en navegador real):** navbar pasa a hamburguesa
  bajo 1180px (antes 680px: con 4 enlaces + 4 botones de staff los botones se
  cortaban); `#navAuth` con `flex-wrap`/`gap`; el toggle del submenú en JS usa
  la misma media query; `calc()` inválido del aviso flotante corregido;
  `100svh` para hero y login; chat y tarjeta de login fluidos; breakpoint de
  480px; inputs a 16px bajo 768px (evita zoom de iOS).

**Pendiente de Johann:** Google OAuth (lo está arreglando), y revisar el
responsive en dispositivos reales a 320/375/768/1024/1280px.

**Decisiones de Johann que enmarcan Fase 1:**
- Compra invitado-primero, cuentas demo eliminadas por completo, 3 roles
  con panel diferenciado, config vía `js/config.js` commiteado, verificación
  de correo por enlace (no código), primer admin por promoción manual
  aprobada explícitamente.

## 2026-09-13 — Fase 2: gestión admin de producciones y funciones

**Contexto:** con Fase 1 cerrada, Fase 2 conecta el resto del catálogo al
panel administrativo — crear/editar producciones y sus funciones
(`performances`), sin depender todavía del venue real de Showman (crear una
función no requiere numeración de asientos).

**Hecho en esta fase (hasta ahora):**
- **`DB` (js/app.js):** `createProduction`/`updateProduction` (INSERT/UPDATE
  contra `productions`, protegidos por `productions_admin_write`); cache +
  `loadPerformances`/`getPerformances`/`getPerformancesForProduction` +
  `createPerformance`/`updatePerformance` (contra `performances`, protegidos
  por `performances_admin_write`) — ambas policies ya existían desde `0010`,
  sin migración nueva.
- **UI:** nueva sección "Gestión de Producciones" en el panel staff
  (`index.html` `#admProdSec`), oculta client-side salvo `rol==='admin'` (RLS
  es la autoridad real). Edición inline de producciones existentes y de sus
  funciones; formularios para crear una producción nueva y agregar funciones
  a una producción existente.
- **Fuera de alcance de esta ronda, por decisión de Johann:** sin borrado (de
  producciones ni de funciones) — cualquier corrección se hace vía SQL
  aprobado, como en fases anteriores; sin página pública de marketing para
  producciones creadas desde el panel — el diseño de esa plantilla se hace
  cuando exista una producción real que la necesite.

## 2026-09-13 — Fase 0: coherencia repo↔DB + documentación

**Contexto:** el esquema Supabase (`0001`–`0015`) ya había sido diseñado,
ejecutado y verificado contra el proyecto real en sesiones anteriores, pero
GitHub no lo reflejaba completo: `0009`/`0010` tenían cambios sin commitear y
`0011`–`0015` nunca se habían commiteado (existían solo en disco). Esto
rompía la regla de que la base de datos debe ser reconstruible únicamente
desde el historial del repositorio.

**Hecho en esta fase:**
- Commiteado el esquema ejecutado a GitHub, en 5 commits separados por tema
  (grants/revokes 0009-0010; RPCs de ticketing + `unit_price` 0011; gestión
  manual de órdenes 0012-0013; categorías de precio 0014; reserva de
  asientos concurrency-safe 0015). Barrido de secretos antes de cada commit
  — cero hallazgos.
- Descubierto y decidido el **Hallazgo #6**: `approve_order()`/
  `reject_order()` (0013) autorizan con `is_staff()`, contradiciendo la
  política `orders_admin_write` (admin-only) y la matriz de permisos
  documentada. Decisión: admin-only es la regla correcta; corregir en una
  futura `0016` (no se edita `0013` retroactivamente). Hasta entonces, staff
  conserva esta capacidad en la práctica — riesgo conocido y documentado.
- Actualizado `supabase/docs/DESIGN.md` a v5: modelo de precios
  (`price_categories`/`performance_price_categories`), `tickets.unit_price`
  como snapshot histórico, las RPCs de venta/gestión ya implementadas, y los
  Hallazgos #3/#4/#6 como deuda técnica documentada (no corregida
  retroactivamente).
- Creados `docs/ARCHITECTURE.md` y `docs/DATABASE.md` (este documento y sus
  hermanos) como documentación viva del sistema completo.

**Decisiones de producto confirmadas en esta fase:**
- **Venta de boletos EN PAUSA.** Showman venderá boletos numerados pero
  queda como esqueleto hasta tener el venue real y su mapa de asientos. No
  se inventan asientos ni precios de relleno. Producciones futuras elegirán,
  cada una, admisión general o asiento numerado — ese flag por producción
  no existe todavía como columna.
- **Invitado primero.** Cuando se reactive la venta, la primera integración
  de compra será invitado (nombre + teléfono → WhatsApp), no login. Supabase
  Auth (email + Google) es una fase posterior.
- **Fase 0 antes que frontend.** Coherencia repo↔DB y documentación se
  resuelven antes de tocar `index.html`/`js/app.js`/`css/styles.css` o
  cablear cualquier cliente Supabase.

**No se tocó en esta fase:** ningún archivo de frontend, ninguna
migración histórica (`0001`–`0015` permanecen exactamente como fueron
ejecutadas contra Supabase), ningún dato en Supabase (no se ejecutó SQL
alguno contra la instancia real durante esta fase — todo el trabajo fue
`git`/documentación local).

## Antes de esta fase (resumen retroactivo, sin fecha exacta registrada)

- Diseño y ejecución del esquema base: enums de 3 roles, `productions`,
  capa `performances` (una producción puede tener varias funciones),
  `seats`, `profiles` con alta automática, `sellers`/`contact_messages`,
  `orders`/`tickets` con índice anti-doble-reserva compuesto
  `(performance_id, seat_id)`, `blocked_seats` con llave compuesta.
- Endurecimiento de la matriz de permisos: `staff` pasó de "operar" a
  "solo lectura interna + excepciones puntuales vía RPC angosta"; `admin`
  quedó como único rol con escritura real sobre catálogo/boletería/roles.
- Hallazgo de seguridad real y corregido: la policy original de
  `contact_messages` permitía a staff reescribir cualquier columna al
  "marcar como leído" — reemplazada por `mark_contact_message_read()`, una
  RPC `SECURITY DEFINER` que solo toca `leido`. Este patrón (RPC angosta en
  vez de `UPDATE` en bloque) quedó documentado como el estándar a seguir
  para cualquier escritura futura de staff (p. ej. check-in por QR).
