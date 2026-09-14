# DARF Productions — Changelog

Historial de cambios significativos al proyecto (esquema de datos,
arquitectura, decisiones de producto). No es un changelog de cada commit —
para eso está `git log`. Este documento registra *por qué* cambió algo, no
solo *qué*.

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

**Decisiones de Johann que enmarcan Fase 1:**
- Compra invitado-primero, cuentas demo eliminadas por completo, 3 roles
  con panel diferenciado, config vía `js/config.js` commiteado, verificación
  de correo por enlace (no código), primer admin por promoción manual
  aprobada explícitamente.

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
