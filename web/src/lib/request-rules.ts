import type { IconoNombre } from "@/components/Icono";
// Solicitudes del elenco (0070). Funciones puras: request-rules.test.ts.

export type RequestTipo = "falta" | "documento" | "pago" | "otro";
export type RequestEstado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export type MemberRequest = {
  id: string; production_id: string; user_id: string; tipo: RequestTipo; estado: RequestEstado;
  motivo: string | null; archivo_path: string | null; doc_type_id: string | null; doc_nombre: string | null;
  concepto: "mensualidad" | "inscripcion" | null; periodo: string | null; monto: number | null; metodo: string | null;
  monto_aprobado: number | null; respuesta: string | null; revisado_at: string | null; created_at: string;
  ensayos: { id: string; titulo: string; inicia: string }[];
};

export const TIPO_SOLICITUD: Record<RequestTipo, { label: string; corto: string; icono: IconoNombre; ayuda: string }> = {
  falta: { label: "Avisar una falta", corto: "Falta", icono: "reloj", ayuda: "Avisa con anticipación que no podrás ir. Si la aprueban, queda justificada." },
  documento: { label: "Enviar un documento", corto: "Documento", icono: "documento", ayuda: "Acta, identificación, cartas, permisos… en PDF o foto." },
  pago: { label: "Comprobante de pago", corto: "Pago", icono: "tarjeta", ayuda: "Sube tu comprobante; al aprobarlo, el pago queda registrado." },
  otro: { label: "Tema de pagos u otra solicitud", corto: "Otra", icono: "sobre", ayuda: "Becas, aclaraciones de pagos o cualquier otra cosa." },
};

export const ESTADO_SOLICITUD: Record<RequestEstado, { label: string; cls: string }> = {
  pendiente: { label: "Por revisar", cls: "bg-[#f2b544]/20 text-[#fde68a]" },
  aprobada: { label: "Aprobada", cls: "bg-[#14532d] text-[#bbf7d0]" },
  rechazada: { label: "Rechazada", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  cancelada: { label: "Cancelada", cls: "bg-white/10 text-texto-3" },
};

export const METODOS: [string, string][] = [["transferencia", "Transferencia"], ["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]];

/** Último momento para pedir una falta: `horas` antes de que empiece el ensayo. */
export function limiteFalta(inicia: string, horas: number): Date {
  return new Date(new Date(inicia).getTime() - horas * 3600 * 1000);
}

/** Igual que la base (request_absence): se puede hasta el límite, no después. */
export function puedeAvisarFalta(inicia: string, horas: number, ahora: Date = new Date()): boolean {
  return ahora.getTime() <= limiteFalta(inicia, horas).getTime();
}

/** "24 horas antes" / "antes de que empiece". */
export function textoLimite(horas: number): string {
  if (horas === 0) return "antes de que empiece el ensayo";
  if (horas % 24 === 0) return `${horas / 24 === 1 ? "1 día" : `${horas / 24} días`} antes`;
  return `${horas} ${horas === 1 ? "hora" : "horas"} antes`;
}

/** "2026-10" (input month) → "2026-10-01"; null si no es válido. */
export function periodoDeMes(mes: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : null;
}

/** Monto escrito por la persona ("1,200.50", "$ 800") → número o null. */
export function montoValido(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Resumen corto de una solicitud para listas. */
export function resumenSolicitud(r: Pick<MemberRequest, "tipo" | "doc_nombre" | "concepto" | "periodo" | "ensayos">, mesNombre: (p: string) => string): string {
  if (r.tipo === "falta") return r.ensayos.length === 1 ? `Falta a ${r.ensayos[0].titulo}` : `Falta a ${r.ensayos.length} ensayos`;
  if (r.tipo === "documento") return r.doc_nombre ?? "Documento";
  if (r.tipo === "pago") return r.concepto === "inscripcion" ? "Pago de inscripción" : `Pago de ${r.periodo ? mesNombre(r.periodo) : "mensualidad"}`;
  return "Solicitud";
}
