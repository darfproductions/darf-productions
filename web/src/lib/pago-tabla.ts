// Tabla de pagos (0112): una fila por integrante y una columna por inscripción y cada mes, como la hoja de DARF.
// Funciones puras: pago-tabla.test.ts.
import { estadoCuotas, estadoInscripcion, meses, type Enrollment, type Fee, type FeeTerms, type Payment } from "@/lib/member-rules";

export type Columna = { clave: string; concepto: "inscripcion" | "mensualidad"; periodo: string };
export type Celda =
  | { tipo: "pagado" }
  | { tipo: "parcial"; falta: number }
  | { tipo: "pendiente"; monto: number; vencido: boolean }
  | { tipo: "beca" }
  | { tipo: "no_aplica" };

/** Columnas: inscripción (si se cobra) y los meses del taller. La inscripción va en el mes del primer mes. */
export function columnas(fee: Fee): Columna[] {
  const ms = meses(fee.desde, fee.hasta).map((p): Columna => ({ clave: p, concepto: "mensualidad", periodo: p }));
  return Number(fee.inscripcion ?? 0) > 0 ? [{ clave: "insc", concepto: "inscripcion", periodo: `${fee.desde.slice(0, 7)}-01` }, ...ms] : ms;
}

/** Celdas de una persona para cada columna. */
export function fila(fee: Fee, cols: Columna[], terms: FeeTerms, pagos: Payment[], alta: Enrollment | null, hoy: Date = new Date()): Celda[] {
  const cuotas = new Map(estadoCuotas(fee, terms, pagos, hoy, alta).map((m) => [m.periodo, m]));
  const insc = estadoInscripcion(fee, terms, pagos);
  return cols.map((c): Celda => {
    if (c.concepto === "inscripcion") {
      if (insc.estado === "pagado") return { tipo: "pagado" };
      if (insc.estado === "parcial") return { tipo: "parcial", falta: insc.debe - insc.pagado };
      if (insc.estado === "pendiente") return { tipo: "pendiente", monto: insc.debe, vencido: false };
      return { tipo: "no_aplica" };
    }
    const m = cuotas.get(c.periodo);
    if (!m) return { tipo: "no_aplica" };
    if (m.estado === "beca") return { tipo: "beca" };
    if (m.estado === "pagado") return { tipo: "pagado" };
    if (m.estado === "parcial") return { tipo: "parcial", falta: m.debe - m.pagado };
    return { tipo: "pendiente", monto: m.debe, vencido: m.estado === "vencido" };
  });
}

/** Valor de una casilla: quién|concepto|periodo|monto. `quien` es "u:<cuenta>" o "f:<ficha>". */
export const valorCasilla = (quien: string, c: Columna, monto: number) => `${quien}|${c.concepto}|${c.periodo}|${monto}`;

export type PagoMarcado = { quien: "u" | "f"; id: string; concepto: "inscripcion" | "mensualidad"; periodo: string; monto: number };
export function leerCasilla(v: string): PagoMarcado | null {
  const [q, concepto, periodo, monto] = v.split("|");
  const [tipo, id] = (q ?? "").split(":");
  if ((tipo !== "u" && tipo !== "f") || !/^[0-9a-f-]{36}$/.test(id ?? "")) return null;
  if (concepto !== "inscripcion" && concepto !== "mensualidad") return null;
  if (!/^\d{4}-\d{2}-01$/.test(periodo ?? "")) return null;
  const n = Number(monto);
  if (!(n > 0) || n > 100000) return null;
  return { quien: tipo, id, concepto, periodo, monto: n };
}
