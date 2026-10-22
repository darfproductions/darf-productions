// Reglas de presentación de boletos y pago (puras, con pruebas en tickets.test.ts).
// El precio, el total y el descuento REALES los calcula siempre la base de datos
// (create_seated_ticket_order). Aquí solo se calcula una vista previa para mostrar.

import { compararFilas } from "./seatmap-rules";
export function formatMoney(n: number): string {
  return `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

/** Enlace de pago por WhatsApp con el mismo texto que usa la 1.0. Vacío si no hay número. */
export function whatsappPayUrl(
  phoneNumber: string,
  o: {
    prodName: string;
    orderCode: string;
    seats: string[];
    total: number;
    buyerPhone?: string | null;
    discountCode?: string | null;
    discountAmount?: number | null;
    /** 0122: "Incluye (VIP): …" por zona. */
    incluye?: string[];
  },
): string {
  if (!phoneNumber) return "";
  const msg =
    `Hola, quiero pagar mi solicitud de boletos para ${o.prodName}` +
    ` — Código de orden: ${o.orderCode}` +
    ` — Asientos: ${o.seats.join(", ")}` +
    (o.discountCode ? ` — Código de descuento: ${o.discountCode} (−${formatMoney(o.discountAmount ?? 0)})` : "") +
    ` — Total: ${formatMoney(o.total)}` +
    (o.buyerPhone ? ` — Teléfono: ${o.buyerPhone}` : "") +
    (o.incluye?.length ? ` — ${o.incluye.join(" — ")}` : "") +
    ". Mi solicitud ya quedó guardada en mi cuenta DARF, en espera de aprobación.";
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(msg)}`;
}

/** 0120: híbrido: ya apartó y sigue en WhatsApp (sin hablar de pago ni boletos; el total sí va). */
export function whatsappApartadoUrl(phoneNumber: string, o: { prodName: string; orderCode: string; seats: string[]; total: number; buyerPhone?: string | null; incluye?: string[] }): string {
  if (!phoneNumber) return "";
  const msg = `Hola, aparté mis lugares para ${o.prodName} — Código: ${o.orderCode} — Lugares: ${o.seats.join(", ")} — Total: ${formatMoney(o.total)}` +
    (o.buyerPhone ? ` — Teléfono: ${o.buyerPhone}` : "") + (o.incluye?.length ? ` — ${o.incluye.join(" — ")}` : "") + ".";
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(msg)}`;
}

/** 0120: obras que se venden todo por WhatsApp: mensaje para pedir boletos de una función. Vacío si no hay número. */
export function whatsappPedirUrl(phoneNumber: string, prodName: string, funcion: string | null): string {
  if (!phoneNumber) return "";
  const msg = `Hola, me gustaría más información de ${prodName}${funcion ? ` — Función: ${funcion}` : ""}.`;
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(msg)}`;
}

export type DiscountPreview = {
  codigo: string;
  percent: number;
  max_tickets_per_order: number | null;
  category_ids: string[] | null;
};

/** Vista previa del descuento (misma lógica que la 1.0). La base recalcula al comprar. */
export function previewDiscount(
  d: DiscountPreview | null,
  seats: { price_category_id: string | null }[],
  priceOf: (categoryId: string) => number | undefined,
): { amount: number; note: string } {
  if (!d) return { amount: 0, note: "" };
  if (d.max_tickets_per_order && seats.length > d.max_tickets_per_order) {
    return { amount: 0, note: `Este código permite máximo ${d.max_tickets_per_order} boletos por compra` };
  }
  let amount = 0;
  for (const s of seats) {
    if (!s.price_category_id) continue;
    const p = priceOf(s.price_category_id);
    if (p === undefined) continue;
    if (!d.category_ids || d.category_ids.includes(s.price_category_id)) amount += Math.round(p * d.percent) / 100;
  }
  if (!amount && seats.length) return { amount: 0, note: "El código no aplica a los asientos seleccionados" };
  return { amount, note: "" };
}

/** Color de cada zona de Showman (mismos colores que el mapa de la 1.0). */
export const ZONE_COLORS: Record<string, string> = {
  VIP: "#8B5CF6",
  "Preferente A": "#14B8A6",
  "Preferente B": "#F97316",
  General: "#84CC16",
  Discapacitados: "#A0724A",
};

export type MapSeat = {
  id: string;
  seat_label: string;
  seat_row: string | null;
  seat_number: number | null;
  lado: string | null;
  price_category_id: string | null;
  /** 0113: posición en un mapa libre. */
  pos_x?: number | null;
  pos_y?: number | null;
  /** Bloque del mapa libre (para las letras de fila). */
  section?: string | null;
};

/** Agrupa asientos por fila (A cerca del escenario) y por bloque izquierda/central/derecha. */
export function groupSeatsByRow(seats: MapSeat[]) {
  const rows = new Map<string, MapSeat[]>();
  for (const s of seats) {
    const r = s.seat_row ?? "?";
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push(s);
  }
  return [...rows.keys()].sort(compararFilas).map((row) => {
    const list = rows.get(row)!.slice().sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));
    return {
      row,
      blocks: (["izquierda", "central", "derecha"] as const).map((lado) => list.filter((s) => s.lado === lado)),
    };
  });
}

/** Tamaño de asiento para que quepan `cols` columnas en `ancho` px (entre 12 y 28). */
export function seatSize(ancho: number, cols: number): number {
  return clampSeat(Math.floor((ancho - 32) / (cols * 1.2)), 28);
}
export function clampSeat(n: number, max = 48): number {
  return Math.max(12, Math.min(max, Math.round(n)));
}
