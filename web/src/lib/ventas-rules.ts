// Reglas puras de ventas (0088): métodos de pago y cómo se nombra el estado de una orden.

export const METODOS_PAGO = [
  ["transferencia", "Transferencia"],
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta (terminal)"],
  ["deposito", "Depósito"],
  ["cortesia", "Cortesía"],
  ["otro", "Otro"],
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number][0];

const ETIQUETA_METODO: Record<string, string> = Object.fromEntries(METODOS_PAGO);

export function metodoLabel(m: string | null | undefined): string | null {
  return m ? (ETIQUETA_METODO[m] ?? m) : null;
}

export function esMetodo(v: string): v is MetodoPago {
  return v in ETIQUETA_METODO;
}

type OrdenEstado = {
  status: "pendiente" | "aprobado" | "rechazado";
  vencida_at?: string | null;
  cancelada_por_comprador_at?: string | null;
};

/** Nombre del estado para el panel y para el comprador. "rechazado" cubre varios casos. */
export function estadoOrden(o: OrdenEstado, para: "panel" | "comprador" = "panel"): string {
  if (o.status === "pendiente") return para === "panel" ? "Por aprobar" : "Apartada";
  if (o.status === "aprobado") return para === "panel" ? "Aprobada" : "Pagada";
  if (o.vencida_at) return "Vencida";
  if (o.cancelada_por_comprador_at) return para === "panel" ? "La canceló el comprador" : "La cancelaste";
  return "Cancelada";
}

/** ¿Se le puede dar más tiempo? Pendiente, o vencida sin que la cancelara el comprador. */
export function puedeExtender(o: OrdenEstado): boolean {
  return o.status === "pendiente" || (o.status === "rechazado" && !!o.vencida_at && !o.cancelada_por_comprador_at);
}

/** ¿Se puede comprar en línea? En venta, con fecha futura y la obra no concluida (la base lo exige igual). */
export function funcionVendible(fn: { on_sale: boolean; starts_at: string | null }, concluida: boolean, ahora: Date = new Date()): boolean {
  return fn.on_sale && !!fn.starts_at && !concluida && new Date(fn.starts_at).getTime() > ahora.getTime();
}
