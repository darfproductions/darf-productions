# DARF 2.0 — Fase 4: boletería y compra (decisiones de Diego, 2026-10-12)

Toca la lógica de compra e inventario. Diego aprobó la propuesta (visión §8 y §17.2).
Regla: **no reescribir las funciones de compra** (`create_seated_ticket_order`,
`admin_create_seated_order`) si no es necesario. Lo nuevo va alrededor de ellas, y las
pruebas de boletería anteriores se vuelven a correr en cada bloque.

## Decisiones

| Tema | Decisión |
|---|---|
| Plazo para pagar | 24 horas y nunca después de 3 horas antes de la función; mínimo 30 minutos si se compra muy cerca |
| Cómo se liberan | Sin instalar nada: se revisan los vencidos antes de mostrar el mapa, al comprar, en taquilla y al abrir órdenes o Mi cuenta |
| Entrada general | Sí, por zona con cupo (bloque 4C) |
| Mejoras | Mapa cómodo en celular, tiempo restante visible, boleto en PDF y recordatorio en Mi cuenta |

## Bloques

### 4A. Vencimiento de órdenes — HECHO (`0054_order_expiry.sql`, pruebas T1–T5)

- **Fecha límite:** cada orden pendiente del público recibe `expires_at` al crearse. Las
  ventas de taquilla nacen aprobadas y no vencen. Las órdenes que ya existían no vencen.
- **Al vencer:**
  - los boletos se desactivan y el asiento queda libre;
  - la orden pasa a `rechazado` con `vencida_at` y se muestra como "Vencida";
  - se libera el uso del código de descuento.

  No se creó un estado nuevo, para no romper lo que ya lee "rechazado".
- **Dónde se ve:**
  - en la compra: "Tus asientos quedan apartados hasta…";
  - en Mi cuenta: "Paga antes de… (te quedan…)";
  - en el panel de órdenes: "vence en…" o "vencida".
- **Recordatorio en Mi cuenta:** "Hoy / Mañana / En N días: obra · fecha", para funciones
  con boletos aprobados en los próximos 7 días.
- **Riesgo conocido:** sin programador, una orden vencida se libera la próxima vez que
  alguien abre el mapa de esa obra, compra o abre el panel. No antes.

### 4B. Mapa cómodo en celular y boleto en PDF — HECHO (sin cambios de base)

- **Mapa:**
  - zoom con − y +, "Ajustar" al ancho de la pantalla y pellizco con dos dedos;
  - el tamaño se calcula solo al abrir (`seatSize`/`clampSeat`, con pruebas);
  - es el mismo mapa para la compra en línea y la taquilla.
- **En celular**, una barra fija abajo muestra cuántos asientos van y el total, con el botón
  "Continuar" hacia el resumen de la compra.
- **Disponibilidad en vivo:** cada 20 s se libera lo vencido y se vuelve a preguntar qué está
  ocupado. Si alguien apartó un asiento que tenías elegido, se quita de tu selección y se
  avisa. Si la base rechaza la compra porque un asiento se ocupó, el mapa se actualiza.
- **Boleto en PDF:**
  - en Mi cuenta, "Descargar boletos (PDF)" en órdenes aprobadas de funciones próximas;
  - una página por boleto, con obra, función, lugar, asiento, orden y QR;
  - el PDF se arma en el servidor (`lib/pdf-ticket.ts`) sin librerías nuevas, y el QR se
    dibuja en vectores;
  - solo se descarga la orden propia y aprobada;
  - se comprobó que el QR del PDF lo lee el mismo lector de la puerta (jsQR).

### 4C. Entrada general por zona con cupo — HECHO (`0055_general_admission.sql`, pruebas T1–T8)

Decisiones de Diego:
- el cupo vale para todas las funciones y se puede cambiar en una función específica;
- se compra aparte de los asientos;
- máximo 10 por compra en línea (taquilla: 20).

Cómo quedó:
- **Zona de entrada general:** zona de precio con `cupo` y sin asientos; la base impide
  mezclarlas. Los boletos llevan `seat_id` null y `price_category_id` = la zona.
- **Funciones nuevas** `create_general_ticket_order` (público) y `admin_create_general_order`
  (taquilla). Siguen las mismas reglas que la compra con asiento:
  - sesión iniciada y función en venta;
  - 3 órdenes pendientes como máximo;
  - vendedor activo;
  - descuento con zonas y funciones permitidas;
  - vencimiento de 0054.

  Las funciones de compra con asiento no se tocaron.
- **Sin sobreventa:** la zona se bloquea mientras se cuentan los lugares. Se probó con dos
  conexiones reales al mismo tiempo: la segunda esperó y recibió "Solo quedan 1 lugares";
  nunca hubo más boletos que cupo. Ese mensaje ya se cambió a "Solo queda 1 lugar".
- **Puerta:** `check_in_ticket` solo cambió para mostrar "General · <zona>". La prueba 0035
  sigue pasando.
- **Web:**
  - Funciones y precios → "Zonas de entrada general" (crear, editar y activar), con precio
    y cupo por función;
  - compra: tarjeta por zona con lugares libres, cantidad, descuento y vendedor;
  - taquilla: venta por zona y cantidad;
  - Mi cuenta, PDF y órdenes muestran "General · <zona>".
- **Ocupación con entrada general** (`0056_capacity.sql`, pruebas T1–T3). La capacidad de una
  función es: asientos numerados + cupo de las zonas generales con precio en ella (el cupo
  de la función o el de la zona). Se usa en:
  - Ventas;
  - Reportes de la obra;
  - Cierre de temporada (por función y en total);
  - Reporte general (`director_capacity`).

  Los cierres guardados antes de este cambio siguen con asientos × funciones.
- **DEV:** la migración contiene la palabra "cancelado" (de `check_in_ticket`), así que se
  aplica con `supabase/dev/apply_0055_dev.sql` en el SQL Editor.

## Pruebas obligatorias (visión §8.3)

- **En cada bloque:** compras simultáneas del mismo asiento, precios, descuentos,
  aprobación, rechazo, cancelación, QR válido, inválido y ya usado, y permisos por rol.
- **Con datos ficticios, solo en DEV.**
