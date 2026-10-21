// Resumen de ventas de una obra (puro, con pruebas en sales.test.ts).
// Los montos reales ya los calculó la base al crear cada orden; aquí solo se suman.

export type SaleTicket = { id: string; is_active: boolean; checked_in_at: string | null; seat_label: string | null; cancel_motivo?: string | null; cancelled_by?: string | null };
export type SaleOrder = {
  id: string;
  order_code: string;
  performance_id: string;
  status: "pendiente" | "aprobado" | "rechazado";
  buyer_nombre: string;
  buyer_telefono: string;
  total: number;
  discount_codigo: string | null;
  discount_amount: number;
  created_at: string;
  created_by_staff_id: string | null;
  expires_at?: string | null;
  vencida_at?: string | null;
  /** 0088: motivo de rechazo o cancelación, pago y quién operó. */
  motivo?: string | null;
  metodo_pago?: string | null;
  referencia?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  cancelada_por_comprador_at?: string | null;
  tickets: SaleTicket[];
};

export type PerformanceSales = { vendidos: number; apartados: number; ingresos: number; validados: number };

export function summarizeSales(orders: SaleOrder[]) {
  const porFuncion = new Map<string, PerformanceSales>();
  let ingresos = 0;
  let pendiente = 0;
  let vendidos = 0;
  let apartados = 0;
  let validados = 0;
  let ordenesPendientes = 0;
  for (const o of orders) {
    const f = porFuncion.get(o.performance_id) ?? { vendidos: 0, apartados: 0, ingresos: 0, validados: 0 };
    const activos = o.tickets.filter((t) => t.is_active);
    if (o.status === "aprobado") {
      ingresos += Number(o.total);
      vendidos += activos.length;
      validados += activos.filter((t) => t.checked_in_at).length;
      f.ingresos += Number(o.total);
      f.vendidos += activos.length;
      f.validados += activos.filter((t) => t.checked_in_at).length;
    } else if (o.status === "pendiente") {
      pendiente += Number(o.total);
      apartados += activos.length;
      ordenesPendientes++;
      f.apartados += activos.length;
    }
    porFuncion.set(o.performance_id, f);
  }
  return { ingresos, pendiente, vendidos, apartados, validados, ordenesPendientes, porFuncion };
}

/** Texto de la ocupación: "120 de 400 (30 %)". */
export function occupancy(ocupados: number, total: number): string {
  if (!total) return `${ocupados}`;
  return `${ocupados} de ${total} (${Math.round((ocupados / total) * 100)} %)`;
}

/** Capacidad de una función: asientos numerados + cupo de las zonas generales con precio en ella (0056). */
export function capacidadFuncion(
  asientos: number,
  precios: { categoryId: string; cupo: number | null }[],
  zonas: { id: string; cupo: number | null; is_active: boolean }[],
): number {
  const general = new Map(zonas.filter((z) => z.cupo != null && z.is_active).map((z) => [z.id, z.cupo as number]));
  return asientos + precios.reduce((n, p) => (general.has(p.categoryId) ? n + (p.cupo ?? general.get(p.categoryId)!) : n), 0);
}

/**
 * 0117: cuánto deja una función si se vende todo (sin descuentos ni cortesías).
 * Zonas con asiento: asientos activos de la zona × su precio en la función. Entrada general: cupo × precio.
 * `sinPrecio`: asientos que no se pueden vender porque su zona no tiene precio en esa función.
 */
export function ingresoPotencial(
  asientosPorZona: Map<string, number>,
  precios: { categoryId: string; price: number; cupo: number | null }[],
  zonas: { id: string; cupo: number | null; is_active: boolean }[],
): { lugares: number; total: number; sinPrecio: number } {
  const precio = new Map(precios.map((p) => [p.categoryId, p]));
  let lugares = 0, total = 0, sinPrecio = 0;
  for (const z of zonas) {
    const p = precio.get(z.id);
    if (z.cupo == null) {
      const n = asientosPorZona.get(z.id) ?? 0;
      if (!p) { sinPrecio += n; continue; }
      lugares += n; total += n * p.price;
    } else if (z.is_active && p) {
      const n = p.cupo ?? z.cupo;
      lugares += n; total += n * p.price;
    }
  }
  return { lugares, total, sinPrecio };
}
