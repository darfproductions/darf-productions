# DARF Productions — Changelog

Historial de cambios significativos al proyecto (esquema de datos,
arquitectura, decisiones de producto). No es un changelog de cada commit —
para eso está `git log`. Este documento registra *por qué* cambió algo, no
solo *qué*.

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
