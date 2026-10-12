// Resumen de ventas de una obra (puro, con pruebas en sales.test.ts).
// Los montos reales ya los calculó la base al crear cada orden; aquí solo se suman.

export type SaleTicket = { id: string; is_active: boolean; checked_in_at: string | null; seat_label: string | null };
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
