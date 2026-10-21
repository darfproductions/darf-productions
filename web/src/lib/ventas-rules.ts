// Reglas puras de ventas (0088): métodos de pago y cómo se nombra el estado de una orden.
import { conPunto } from "@/lib/dates";

export const METODOS_PAGO = [
  ["transferencia", "Transferencia"],
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta (terminal)"],
  ["deposito", "Depósito"],
  ["cortesia", "Cortesía"],
  ["otro", "Otro"],
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number][0];

/** 0120: cómo se vende cada obra. 'web': cuenta, orden y checkout; 'hibrido': eliges asientos y vas directo a
 *  WhatsApp; 'whatsapp': todo por WhatsApp (el equipo vende en Taquilla). */
export type ModoVenta = "web" | "hibrido" | "whatsapp";

/** 0120: lo que dicen los botones y la pantalla de apartar según cómo se vende la obra.
 *  En híbrido no se habla de pago, boletos ni compra: solo de apartar tu lugar y seguir en WhatsApp. */
export function textosVenta(modo: ModoVenta | null | undefined) {
  if (modo === "hibrido") {
    return { cta: "Aparta tu lugar", funcion: "Aparta tu lugar", eyebrow: "Aparta tu lugar", titulo: "Aparta tu lugar", carrito: "Tu lugar",
      siguiente: "Siguiente", pasos: ["Elige tu lugar", "Sigue en WhatsApp"], porPersona: "por persona" };
  }
  if (modo === "whatsapp") {
    return { cta: "Más información por WhatsApp", funcion: "Más información por WhatsApp", eyebrow: "Más información", titulo: "Más información",
      carrito: "", siguiente: "", pasos: [] as string[], porPersona: "por persona" };
  }
  return { cta: "Comprar boletos", funcion: "Elegir asientos", eyebrow: "Comprar boletos", titulo: "Elige tus asientos", carrito: "Tu compra",
    siguiente: "", pasos: ["Función", "Lugares", "Tus datos", "Pago y boletos"], porPersona: "por compra" };
}

/** Métodos de pago del checkout en línea. Hoy solo WhatsApp; los demás se agregan aquí cuando existan. */
export const PAGO_EN_LINEA: { id: string; label: string; ayuda: string; activo: boolean }[] = [
  { id: "whatsapp", label: "WhatsApp", ayuda: "Te pasamos los datos para pagar y confirmamos tu pago por WhatsApp.", activo: true },
];

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

/** Mensajes de WhatsApp con un toque desde la orden (Bloque 4A). */
export function mensajeOrden(tipo: "recordar" | "aprobada", o: { order_code: string; buyer_nombre: string; total: number }, d: { obra: string; funcion: string; limite?: string | null; liga: string }): string {
  const nombre = o.buyer_nombre.split(" ")[0] || o.buyer_nombre;
  const total = `$${Number(o.total).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (tipo === "recordar") {
    return `¡Hola ${nombre}! Te escribimos de DARF Productions por tu orden ${o.order_code} de ${d.obra} (${d.funcion}), por ${total}.` +
      `${d.limite ? ` ${conPunto(`Tus lugares siguen apartados hasta ${d.limite}`)}` : ""} ¿Nos compartes tu comprobante de pago? ¡Gracias!`;
  }
  return `¡Hola ${nombre}! Tu pago de la orden ${o.order_code} quedó confirmado. Tus boletos de ${d.obra} (${d.funcion}) ya están en ${d.liga}. ¡Nos vemos en el teatro!`;
}

/** Texto de búsqueda de órdenes por nombre o teléfono, sin caracteres que rompan el filtro. */
export function textoBusqueda(q: string): string {
  return q.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
