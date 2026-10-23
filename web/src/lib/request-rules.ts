import type { IconoNombre } from "@/components/Icono";
// Solicitudes del elenco (0070). Funciones puras: request-rules.test.ts.

export type RequestTipo = "falta" | "llegada" | "documento" | "pago" | "otro";
export type RequestEstado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export type MemberRequest = {
  id: string; production_id: string; user_id: string; tipo: RequestTipo; estado: RequestEstado;
  motivo: string | null; archivo_path: string | null; doc_type_id: string | null; doc_nombre: string | null;
  concepto: "mensualidad" | "inscripcion" | null; periodo: string | null; monto: number | null; metodo: string | null;
  monto_aprobado: number | null; respuesta: string | null; revisado_at: string | null; created_at: string;
  /** 0126: hora a la que llegará (llegada tarde). */
  llegada_hora?: string | null;
  ensayos: { id: string; titulo: string; inicia: string }[];
};

export const TIPO_SOLICITUD: Record<RequestTipo, { label: string; corto: string; icono: IconoNombre; ayuda: string }> = {
  falta: { label: "Avisar una falta", corto: "Falta", icono: "reloj", ayuda: "Avisa con anticipación que no podrás ir. Si la aprueban, queda justificada." },
  llegada: { label: "Avisar que llegaré tarde", corto: "Llegada tarde", icono: "flecha-der", ayuda: "Avisa antes del ensayo a qué hora vas a llegar. Si la aprueban, esa es tu hora de entrada." },
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
export function resumenSolicitud(r: Pick<MemberRequest, "tipo" | "doc_nombre" | "concepto" | "periodo" | "ensayos" | "llegada_hora">, mesNombre: (p: string) => string): string {
  if (r.tipo === "falta") return r.ensayos.length === 1 ? `Falta a ${r.ensayos[0].titulo}` : `Falta a ${r.ensayos.length} ensayos`;
  if (r.tipo === "llegada") return `Llegada tarde a ${r.ensayos[0]?.titulo ?? "un ensayo"}${r.llegada_hora ? ` · ${horaMx(r.llegada_hora)}` : ""}`;
  if (r.tipo === "documento") return r.doc_nombre ?? "Documento";
  if (r.tipo === "pago") return r.concepto === "inscripcion" ? "Pago de inscripción" : `Pago de ${r.periodo ? mesNombre(r.periodo) : "mensualidad"}`;
  return "Solicitud";
}

// ──────── Llegada tarde (0126) ────────

/** "7:30 p.m." en hora de México. */
export function horaMx(iso: string | Date): string {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso))
    .replace(/\s?a\.?\s?m\.?/i, " a.m.").replace(/\s?p\.?\s?m\.?/i, " p.m.").replace(/\u00a0|\u202f/g, " ");
}

/** La llegada tarde se avisa hasta que empieza el ensayo (igual que request_late). */
export function puedeAvisarLlegada(inicia: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() < new Date(inicia).getTime();
}

/** Hora del formulario ("19:30") el mismo día del ensayo → ISO con la zona de México. */
export function llegadaIso(iniciaEnsayo: string, hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iniciaEnsayo));
  return `${dia}T${hhmm}:00-06:00`;
}

/** La regla, tal cual la ve quien pide: desde qué hora cuenta el retardo. */
export function textoLlegada(horaIso: string | null, tolerancia: number): string {
  if (!horaIso) return `La hora que pongas será tu hora de entrada. Tienes ${tolerancia} minutos de tolerancia; si llegas después, cuenta como retardo desde esa hora.`;
  const h = horaMx(horaIso);
  const limite = horaMx(new Date(new Date(horaIso).getTime() + tolerancia * 60_000));
  return tolerancia > 0
    ? `Tu hora de entrada será las ${h}; tienes ${tolerancia} minutos de tolerancia. Si llegas después de las ${limite}, cuenta como retardo y los minutos se cuentan desde las ${h}`
    : `Tu hora de entrada será las ${h}. Si llegas después, cuenta como retardo desde las ${h}`;
}
