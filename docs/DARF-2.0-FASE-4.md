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

### 4B. Mapa cómodo en celular y boleto en PDF — pendiente

### 4C. Entrada general por zona con cupo — pendiente

## Pruebas obligatorias (visión §8.3)

- **En cada bloque:** compras simultáneas del mismo asiento, precios, descuentos,
  aprobación, rechazo, cancelación, QR válido, inválido y ya usado, y permisos por rol.
- **Con datos ficticios, solo en DEV.**
