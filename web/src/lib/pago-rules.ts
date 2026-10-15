import { isoMx } from "@/lib/dates";
import { estadoCuotas, estadoInscripcion, limiteDelMes, mesNombre, pesos, type Enrollment, type Fee, type FeeTerms, type Payment } from "@/lib/member-rules";

// Recibos, adeudos y exportar (0079). Puras, con pruebas.

export const METODOS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", otro: "Otro" };

/** Recibo tal como lo devuelve payment_receipt (0079). */
export type Recibo = {
  id: string; folio: string; production_id: string; obra: string; user_id: string; nombre: string;
  concepto: "mensualidad" | "inscripcion"; periodo: string; monto: number; metodo: string; nota: string | null;
  registrado_at: string; registrado_por: string | null; anulado_at: string | null; motivo_anulacion: string | null;
  telefono: string | null;
};

/** "Inscripción" o "Mensualidad de marzo de 2027". */
export function conceptoPago(p: { concepto?: string; periodo: string }): string {
  return p.concepto === "inscripcion" ? "Inscripción" : `Mensualidad de ${mesNombre(p.periodo)}`;
}

/** Los primeros 10 minutos se puede borrar (error al capturar); después solo anular. */
export const MINUTOS_BORRAR = 10;
export function sePuedeBorrar(registradoAt: string, ahora: number = Date.now()): boolean {
  return ahora - new Date(registradoAt).getTime() < MINUTOS_BORRAR * 60_000;
}

/** Liga de WhatsApp con el mensaje ya escrito. Teléfono de México de 10 dígitos → +52. */
export function ligaWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  let n = (telefono ?? "").replace(/\D/g, "");
  if (n.length === 10) n = `52${n}`;
  if (n.length < 11 || n.length > 15) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

export function mensajeRecibo(r: Pick<Recibo, "nombre" | "folio" | "concepto" | "periodo" | "monto" | "obra" | "anulado_at">, liga: string): string {
  const nombre = r.nombre.split(" ")[0] || r.nombre;
  if (r.anulado_at) return `Hola ${nombre}. El recibo ${r.folio} (${conceptoPago(r).toLowerCase()}, ${pesos(r.monto)}) de ${r.obra} fue anulado. Lo puedes ver aquí: ${liga}`;
  return `Hola ${nombre}, recibimos tu pago de ${conceptoPago(r).toLowerCase()} de ${r.obra}: ${pesos(r.monto)}. Recibo ${r.folio}: ${liga}`;
}

/** Lo que debe una persona a hoy: meses vencidos o pendientes ya iniciados, e inscripción. */
export type Adeudo = { meses: { periodo: string; falta: number; vencido: boolean }[]; inscripcion: number; total: number };
export function adeudoDetalle(fee: Fee, t: FeeTerms, pagos: Payment[], hoy: Date = new Date(), e?: Enrollment | null): Adeudo {
  const hoyIso = isoMx(hoy);
  const meses = estadoCuotas(fee, t, pagos, hoy, e)
    .filter((m) => m.periodo <= hoyIso && m.debe > m.pagado && m.estado !== "beca")
    .map((m) => ({ periodo: m.periodo, falta: m.debe - m.pagado, vencido: m.estado === "vencido" || (m.estado === "parcial" && hoyIso > limiteDelMes(fee, m.periodo)) }));
  const i = estadoInscripcion(fee, t, pagos);
  const inscripcion = Math.max(0, i.debe - i.pagado);
  return { meses, inscripcion, total: meses.reduce((s, m) => s + m.falta, 0) + inscripcion };
}

/** CSV para Excel: separado por comas, con comillas cuando hace falta y BOM para los acentos. */
export function csv(filas: (string | number | null | undefined)[][]): string {
  const celda = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // Evita fórmulas al abrir en Excel (=, +, -, @ al inicio).
    const seguro = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
