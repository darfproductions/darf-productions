import type { SaleOrder } from "@/lib/sales";

// Reportes por obra (puro, con pruebas en report-rules.test.ts). Solo cuentan las órdenes aprobadas.

export type DescuentoUsado = { codigo: string; usos: number; descontado: number; ingresos: number };

export function descuentosUsados(orders: SaleOrder[]): DescuentoUsado[] {
  const m = new Map<string, DescuentoUsado>();
  for (const o of orders) {
    if (o.status !== "aprobado" || !o.discount_codigo) continue;
    const d = m.get(o.discount_codigo) ?? { codigo: o.discount_codigo, usos: 0, descontado: 0, ingresos: 0 };
    d.usos++;
    d.descontado += Number(o.discount_amount);
    d.ingresos += Number(o.total);
    m.set(o.discount_codigo, d);
  }
  return [...m.values()].sort((a, b) => b.usos - a.usos || a.codigo.localeCompare(b.codigo));
}

export type Canal = { ordenes: number; boletos: number; ingresos: number };

/** En línea (lo compró el público) contra taquilla (lo vendió alguien del equipo). */
export function ventasPorCanal(orders: SaleOrder[]): { web: Canal; taquilla: Canal } {
  const out = { web: { ordenes: 0, boletos: 0, ingresos: 0 }, taquilla: { ordenes: 0, boletos: 0, ingresos: 0 } };
  for (const o of orders) {
    if (o.status !== "aprobado") continue;
    const c = o.created_by_staff_id ? out.taquilla : out.web;
    c.ordenes++;
    c.boletos += o.tickets.filter((t) => t.is_active).length;
    c.ingresos += Number(o.total);
  }
  return out;
}

export type Asistencia = { presentes: number; retardos: number; faltas: number; justificadas: number };

/** Suma la asistencia de todo el elenco. */
export function asistenciaTotal(rows: Asistencia[]): Asistencia {
  return rows.reduce((a, r) => ({
    presentes: a.presentes + r.presentes, retardos: a.retardos + r.retardos,
    faltas: a.faltas + r.faltas, justificadas: a.justificadas + r.justificadas,
  }), { presentes: 0, retardos: 0, faltas: 0, justificadas: 0 });
}

/** Cuántas solicitudes hay en cada estado. */
export function conteo<T extends string>(xs: { estado: T }[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x.estado, (m.get(x.estado) ?? 0) + 1);
  return m;
}
