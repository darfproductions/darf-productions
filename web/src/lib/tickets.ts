// Reglas de presentación de boletos y pago (puras, con pruebas en tickets.test.ts).
// El precio, el total y el descuento REALES los calcula siempre la base de datos
// (create_seated_ticket_order). Aquí solo se calcula una vista previa para mostrar.

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
    ". Mi solicitud ya quedó guardada en mi cuenta DARF, en espera de aprobación.";
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
};

/** Agrupa asientos por fila (A cerca del escenario) y por bloque izquierda/central/derecha. */
export function groupSeatsByRow(seats: MapSeat[]) {
  const rows = new Map<string, MapSeat[]>();
  for (const s of seats) {
    const r = s.seat_row ?? "?";
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push(s);
  }
  return [...rows.keys()].sort().map((row) => {
    const list = rows.get(row)!.slice().sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));
    return {
      row,
      blocks: (["izquierda", "central", "derecha"] as const).map((lado) => list.filter((s) => s.lado === lado)),
    };
  });
}
