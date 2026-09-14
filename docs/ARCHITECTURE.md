# DARF Productions — Arquitectura

Estado: **venta de boletos EN PAUSA.** Este documento describe la
arquitectura objetivo y el estado real de cada pieza — qué está construido,
qué está conectado, y qué sigue siendo simulado. No es un plan de trabajo
inmediato para el frontend; ver `docs/CHANGELOG.md` para lo que se hizo en
cada fase y `supabase/docs/DESIGN.md` para el detalle del esquema de datos.

## Arquitectura objetivo

```
GitHub (darfproductions/darf-productions)
    │  push a main
    ▼
Vercel (build + hosting estático)
    │  sirve
    ▼
Frontend (index.html + js/app.js + css/styles.css — HTML/CSS/JS vanilla)
    │  llamadas a
    ▼
Supabase (Postgres + Auth + RLS + RPC)
    │
    ├─ Auth: invitados (sin cuenta) + usuarios registrados (email o Google)
    └─ Postgres: fuente de verdad de todo dato de negocio
         (producciones, funciones, asientos, precios, órdenes, tickets)

WhatsApp — canal de pago manual (sin pasarela de pago por ahora).
GoDaddy — dominio de producción, apunta a Vercel.
```

**Principio rector:** Supabase es la única fuente de verdad para datos de
negocio. `localStorage` (cuando el frontend se conecte) queda reservado
exclusivamente para preferencias de UI y cache de sesión — nunca para
inventario, precios, órdenes ni tickets.

## Estado real de cada pieza (2026-09-13)

| Pieza | Estado |
|---|---|
| GitHub | Autoritativo desde esta fase — `main` refleja el esquema `0001`–`0015` ejecutado en Supabase (ver Hallazgo Crítico #1 en el historial de este proyecto, ya resuelto). |
| Vercel | No configurado todavía. |
| GoDaddy | No configurado todavía. |
| Frontend (`index.html`/`js/app.js`) | **100% `localStorage`.** Sin cliente Supabase — la librería `@supabase/supabase-js` está cargada por CDN en `index.html` pero nunca se instancia ni se usa. Catálogo de 3 producciones hardcodeado, rejilla de 48 asientos fija reutilizada para cualquier producción, precio plano, auth propia (SHA-256+salt), verificación de email simulada, usuarios demo, login de Google deshabilitado (stub). |
| Supabase — esquema | Ejecutado y verificado (`0001`–`0015`). Modelo: `productions → performances → (seats / price_categories) → tickets/orders`. Ver `docs/DATABASE.md`. |
| Supabase — datos reales | `seats`, `price_categories`, `performance_price_categories` están **vacías a propósito** — no existe el venue real ni su mapa de asientos todavía. |
| Supabase — conectado al frontend | **Nada.** Cero llamadas reales hoy. |
| WhatsApp | Enlaces estáticos ya presentes en `index.html` (`:1008`, `:1217`), sin integración con el flujo de compra real (ese flujo no existe todavía). |

## Por qué la venta está en pausa

Showman venderá boletos **numerados**, no admisión general. Vender boletos
numerados requiere que existan filas reales en `seats` (con su
`price_category_id`) y en `performance_price_categories` (precio por
función) — y esas filas requieren, a su vez, el venue confirmado y su mapa de
asientos real. Ninguno de los dos existe todavía. Por decisión explícita del
proyecto, **no se inventan asientos ni precios de relleno** para simular una
venta — la RPC de venta activa (`create_seated_ticket_order`, ver
`docs/DATABASE.md`) seguirá rechazando toda orden hasta que el mapa real se
cargue.

Producciones futuras (después de Showman) no heredan este modelo
automáticamente: cada producción nueva elegirá, al crearse, si vende por
asiento numerado o por admisión general. Ese flag por producción todavía no
existe como columna — se diseñará cuando haya una segunda producción real que
lo necesite.

## Roles y autenticación

Modelo de tres roles a nivel de base de datos: `fan` / `staff` / `admin`
(enum `user_role`, `profiles.rol`). Detalle completo de la matriz de permisos
en `supabase/docs/DESIGN.md`.

Cuando la venta se reactive, el orden de integración de autenticación es:

1. **Invitado primero.** Comprar sin cuenta: nombre + teléfono, la orden
   queda `pendiente` y el pago/confirmación se coordina por WhatsApp. Esto es
   lo que ya soportan `create_ticket_order`/`create_seated_ticket_order`
   (`buyer_user_id = null` cuando no hay sesión).
2. **Usuarios registrados + historial**, vía Supabase Auth (email).
3. **Google Login**, como método adicional de Supabase Auth — no reemplaza
   el registro por email, lo complementa.

No se fuerza login para comprar. Un usuario registrado obtiene historial de
órdenes/tickets y (a futuro) beneficios; un invitado obtiene exactamente lo
necesario para completar una compra por WhatsApp.

## Pago

Sin pasarela de pago por ahora. El flujo previsto: el comprador completa sus
datos (invitado o registrado), la orden se crea `pendiente` en Supabase, y la
confirmación de pago se coordina manualmente por WhatsApp; un miembro de
staff/admin aprueba o rechaza la orden desde el panel (`approve_order`/
`reject_order`, ver Hallazgo #6 en `docs/DATABASE.md` sobre quién puede hacer
esto hoy exactamente).

## Disponibilidad de boletos — cómo se deriva

La disponibilidad de un asiento para una función específica **nunca** es un
número plano de capacidad. Se deriva siempre de:

```
producción → función → mapa de asientos (seats) → bloqueos (blocked_seats)
    → tickets activos de esa función (tickets.is_active, por performance_id)
```

Un asiento está disponible en una función si: existe en `seats`, está activo,
no tiene una fila en `blocked_seats` para esa función, y no tiene un ticket
`is_active = true` para esa función. Este cálculo vive en
`create_seated_ticket_order` (valida cada condición antes de vender) — el
frontend, cuando se conecte, debe leer disponibilidad de la misma fuente, no
mantener su propio cálculo independiente.

## Precios — cómo se derivan

```
producción → categoría de precio (price_categories)
    → asiento (seats.price_category_id)
    → precio para ESA función (performance_price_categories)
    → tickets.unit_price (congelado al momento de la venta)
```

Cambiar el precio de una categoría a futuro nunca altera un ticket ya
vendido — `unit_price` es un snapshot histórico. Detalle completo en
`docs/DATABASE.md`.

## Seguridad — reglas que no cambian

- La `anon`/`public` key de Supabase puede vivir en el frontend (arquitectura
  normal de Supabase) — nunca la `service_role` key ni ningún secreto
  administrativo.
- Ninguna operación sensible (crear orden, aprobar/rechazar, bloquear
  asiento, cambiar rol) se hace con un `UPDATE`/`INSERT` directo desde el
  cliente — todo pasa por RLS + RPC `SECURITY DEFINER` de alcance mínimo
  (una función, una responsabilidad, ninguna columna de más). Ver
  `supabase/docs/DESIGN.md` para el patrón "RPC angosta, no UPDATE en
  bloque" y sus instancias ya construidas.
- Supabase es la autoridad final de disponibilidad y precio — el cliente
  nunca envía ni un precio ni un total; el servidor los calcula siempre.

## Qué falta para pasar de este estado al objetivo

Ver `supabase/docs/DESIGN.md`, secciones I y J, para el detalle exacto de qué
falta en la base de datos vs. qué falta en el frontend, y el orden de fases
(F1–F4) que sigue este proyecto una vez que se decida reactivar la venta.
