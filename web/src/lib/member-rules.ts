// Reglas del expediente y las mensualidades (etapa 3E, bloque 2). Puras, con pruebas.
// La base vuelve a revisar permisos; aquí solo se calcula lo que se muestra.
import { isoMx, partesMx } from "@/lib/dates";

/** Expediente único de la persona (0042): se reusa en todas sus obras. */
export type PersonFile = {
  fecha_nacimiento: string | null; telefono: string | null;
  emergencia_nombre: string | null; emergencia_telefono: string | null; emergencia_parentesco: string | null;
  tutor_nombre: string | null; tutor_telefono: string | null; tutor_email: string | null;
  alergias: string | null; condiciones: string | null; medicamentos: string | null; tipo_sangre: string | null;
  altura_cm: number | null; pecho_cm: number | null; cintura_cm: number | null; cadera_cm: number | null;
  talla_ropa: string | null; talla_calzado: string | null;
} & Partial<Record<import("@/lib/medidas").MedidaKey, number | null>>;

/** Estado del expediente en una obra: el integrante confirma vigencia; la producción revisa. */
export type MemberFile = { revisado_at: string | null; confirmado_at: string | null };

export type FeeTerms = { beca: boolean; cuota_especial: number | null; sin_inscripcion?: boolean };

export type DocType = {
  id: string; nombre: string; solo_menores: boolean; obligatorio: boolean;
  aplica: "todos" | "menores" | "grupo" | "personas"; grupo: string | null; personas: string[]; descripcion?: string | null;
};
/** A quién se le pide un documento. */
export type DocCtx = { uid: string; esMenor: boolean; tipos: string[] };

export function docAplica(t: DocType, c: DocCtx): boolean {
  switch (t.aplica) {
    case "menores": return c.esMenor;
    case "grupo": return !!t.grupo && c.tipos.includes(t.grupo);
    case "personas": return t.personas.includes(c.uid);
    default: return !t.solo_menores || c.esMenor;
  }
}
export type MemberDoc = { doc_type_id: string; archivo_path: string | null; subido_at: string | null; entregado_at: string | null };

const lleno = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

/** Edad cumplida hoy (o null si no hay fecha). */
export function edad(nacimiento: string | null, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = partesMx(hoy);
  let e = h.y - y;
  if (h.m < mo || (h.m === mo && h.d < d)) e--;
  return e;
}

/** Qué datos obligatorios faltan en el expediente. */
export function faltantes(f: Partial<PersonFile> | null, hoy: Date = new Date()): string[] {
  const out: string[] = [];
  if (!f) return ["Expediente sin llenar"];
  if (!lleno(f.fecha_nacimiento)) out.push("Fecha de nacimiento");
  if (!lleno(f.telefono)) out.push("Teléfono");
  if (!lleno(f.emergencia_nombre) || !lleno(f.emergencia_telefono)) out.push("Contacto de emergencia");
  const e = edad(f.fecha_nacimiento ?? null, hoy);
  if (e !== null && e < 18 && (!lleno(f.tutor_nombre) || !lleno(f.tutor_telefono))) out.push("Madre, padre o tutor");
  if (!lleno(f.alergias)) out.push("Alergias (escribe “Ninguna” si no hay)");
  return out;
}

/** Documentos obligatorios que le tocan y aún no se entregan. */
export function docsPendientes(tipos: DocType[], docs: MemberDoc[], c: DocCtx): DocType[] {
  return tipos.filter((t) => t.obligatorio && docAplica(t, c) && !docs.find((d) => d.doc_type_id === t.id)?.entregado_at);
}

export type Semaforo = "rojo" | "amarillo" | "verde";

/**
 * Rojo: faltan datos, documentos o confirmar que sus datos siguen vigentes en esta obra.
 * Amarillo: completo pero sin revisar. Verde: completo y revisado.
 */
export function semaforo(p: Partial<PersonFile> | null, pendientes: number, m: MemberFile | null, hoy: Date = new Date()): Semaforo {
  if (faltantes(p, hoy).length || pendientes || !m?.confirmado_at) return "rojo";
  return m.revisado_at ? "verde" : "amarillo";
}

/** Todo lo que falta (para mostrarlo en una línea). */
export function pendientesTexto(p: Partial<PersonFile> | null, docs: DocType[], m: MemberFile | null, hoy: Date = new Date()): string[] {
  return [...faltantes(p, hoy), ...docs.map((t) => t.nombre), ...(m?.confirmado_at ? [] : ["Confirmar que sus datos siguen vigentes"])];
}

// ──────── Incidencias ────────

export const TIPO_INCIDENCIA: Record<string, string> = {
  retardo: "Retardo", falta: "Falta", conducta: "Conducta / altercado", mensualidad: "Mensualidad", otro: "Otro",
};
export const NIVEL_INCIDENCIA: Record<string, { label: string; cls: string }> = {
  nota: { label: "Nota interna", cls: "bg-[#2b2f3a] text-texto-2" },
  advertencia: { label: "Advertencia", cls: "bg-[#5a4313] text-[#fde68a]" },
  grave: { label: "Grave", cls: "bg-[#5a1a22] text-[#fecdd3]" },
};
export const MEDIDA: Record<string, string> = {
  platica: "Plática", aviso_tutor: "Aviso a mamá, papá o tutor", suspension: "Suspensión", baja: "Baja", otra: "Otra",
};

/** Advertencias que cuentan para el límite: advertencia o grave, no anuladas. */
export function cuentaAdvertencias(xs: { nivel: string; anulada_at: string | null }[]): number {
  return xs.filter((x) => !x.anulada_at && (x.nivel === "advertencia" || x.nivel === "grave")).length;
}

export const SEMAFORO: Record<Semaforo, { label: string; cls: string }> = {
  rojo: { label: "Le falta información", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  amarillo: { label: "Por revisar", cls: "bg-[#5a4313] text-[#fde68a]" },
  verde: { label: "Completo", cls: "bg-[#14532d] text-[#bbf7d0]" },
};

// ──────── Mensualidades ────────

export type Fee = { monto: number; desde: string; hasta: string; dia_limite: number; cobrar?: boolean; inscripcion?: number; vence_sabado?: boolean };

/** Día límite de un mes ("2026-10-01" → "2026-10-10"): un día fijo o, con vence_sabado (0111), el segundo
 *  sábado (se paga el primer sábado y hay una semana de tolerancia). */
export function limiteDelMes(fee: Pick<Fee, "dia_limite" | "vence_sabado">, periodo: string): string {
  const mes = periodo.slice(0, 8);
  if (!fee.vence_sabado) return `${mes}${String(fee.dia_limite).padStart(2, "0")}`;
  const dow = new Date(`${mes}01T12:00:00Z`).getUTCDay();
  return `${mes}${String(1 + ((6 - dow + 7) % 7) + 7).padStart(2, "0")}`;
}

/** Cuándo se paga, en palabras (portal del integrante). */
export function textoVencimiento(fee: Pick<Fee, "dia_limite" | "vence_sabado">): string {
  return fee.vence_sabado ? "se paga el primer sábado de cada mes (tolerancia hasta el segundo sábado)" : `pagar antes del día ${fee.dia_limite} de cada mes`;
}

/** Vencimiento corto (estado de cuenta en PDF). */
export function venceCorto(fee: Pick<Fee, "dia_limite" | "vence_sabado">): string {
  return fee.vence_sabado ? "Segundo sábado" : `Día ${fee.dia_limite}`;
}
export type Payment = { periodo: string; monto: number; concepto?: "mensualidad" | "inscripcion"; anulado_at?: string | null };

/** Un pago anulado (0079) queda en el historial pero ya no cuenta. */
export const vigente = (p: { anulado_at?: string | null }): boolean => !p.anulado_at;

/** Solo los pagos de mensualidad vigentes (los de inscripción van aparte). */
export const soloMensualidad = <T extends Payment>(ps: T[]): T[] => ps.filter((p) => vigente(p) && (p.concepto ?? "mensualidad") === "mensualidad");
export type MesEstado = "pagado" | "parcial" | "pendiente" | "vencido" | "beca" | "futuro";
export type Mes = { periodo: string; debe: number; pagado: number; estado: MesEstado };

/** Meses entre dos fechas (día 1 de cada mes, "2026-09-01"). */
export function meses(desde: string, hasta: string): string[] {
  const [y1, m1] = desde.slice(0, 7).split("-").map(Number);
  const [y2, m2] = hasta.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let y = y1, m = m1; y < y2 || (y === y2 && m <= m2); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    if (out.length > 60) break;
  }
  return out;
}

/** Periodo de la persona en la obra (0044): ingreso y, si se fue, baja. */
export type Enrollment = { ingreso: string; baja_at: string | null; baja_motivo?: string | null };

/** Meses que le tocan: desde el mes de su ingreso hasta el mes anterior a su baja (incluye el mes si la baja es después del día 1). */
export function mesesDePersona(desde: string, hasta: string, e?: Enrollment | null): string[] {
  const todos = meses(desde, hasta);
  if (!e) return todos;
  const ini = `${e.ingreso.slice(0, 7)}-01`;
  let fin = "9999-12-01";
  if (e.baja_at) {
    const d = new Date(`${e.baja_at}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    fin = `${d.toISOString().slice(0, 7)}-01`;
  }
  return todos.filter((m) => m >= ini && m <= fin);
}

/** Estado de cada mes para una persona (beca = no paga; cuota especial reemplaza el monto). */
export function estadoCuotas(fee: Fee, persona: FeeTerms, pagos: Payment[], hoy: Date = new Date(), e?: Enrollment | null): Mes[] {
  const debe = persona.beca ? 0 : Number(persona.cuota_especial ?? fee.monto);
  const hoyIso = isoMx(hoy);
  if (fee.cobrar === false) return [];
  return mesesDePersona(fee.desde, fee.hasta, e).map((periodo) => {
    const pagado = soloMensualidad(pagos).filter((p) => p.periodo === periodo).reduce((s, p) => s + Number(p.monto), 0);
    const limite = limiteDelMes(fee, periodo);
    let estado: MesEstado;
    if (persona.beca || debe === 0) estado = "beca";
    else if (pagado >= debe) estado = "pagado";
    else if (pagado > 0) estado = "parcial";
    else if (periodo > hoyIso) estado = "futuro";
    else estado = hoyIso > limite ? "vencido" : "pendiente";
    return { periodo, debe, pagado, estado };
  });
}

export type Inscripcion = { debe: number; pagado: number; estado: "pagado" | "parcial" | "pendiente" | "exento" | "no_aplica" };

/** Inscripción: un solo pago, completo aunque entre tarde. */
export function estadoInscripcion(fee: Fee, persona: FeeTerms, pagos: Payment[]): Inscripcion {
  const monto = Number(fee.inscripcion ?? 0);
  if (fee.cobrar === false || monto <= 0) return { debe: 0, pagado: 0, estado: "no_aplica" };
  if (persona.sin_inscripcion) return { debe: 0, pagado: 0, estado: "exento" };
  const pagado = pagos.filter((p) => vigente(p) && p.concepto === "inscripcion").reduce((s, p) => s + Number(p.monto), 0);
  return { debe: monto, pagado, estado: pagado >= monto ? "pagado" : pagado > 0 ? "parcial" : "pendiente" };
}

export type Recaudacion = { mes: string; mensualidades: number; inscripciones: number; total: number };

/** Lo cobrado por mes en que se registró el pago (hora de CDMX), del más reciente al más antiguo. */
export function recaudacion(pagos: { monto: number; concepto?: string; registrado_at: string; anulado_at?: string | null }[]): { meses: Recaudacion[]; mensualidades: number; inscripciones: number; total: number } {
  const porMes = new Map<string, Recaudacion>();
  for (const p of pagos.filter(vigente)) {
    const mes = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(p.registrado_at)).slice(0, 7) + "-01";
    const r = porMes.get(mes) ?? { mes, mensualidades: 0, inscripciones: 0, total: 0 };
    if (p.concepto === "inscripcion") r.inscripciones += Number(p.monto); else r.mensualidades += Number(p.monto);
    r.total += Number(p.monto);
    porMes.set(mes, r);
  }
  const meses = [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes));
  return {
    meses,
    mensualidades: meses.reduce((s, m) => s + m.mensualidades, 0),
    inscripciones: meses.reduce((s, m) => s + m.inscripciones, 0),
    total: meses.reduce((s, m) => s + m.total, 0),
  };
}

/** Cuánto debe a hoy (meses ya iniciados). */
export function adeudo(ms: Mes[], hoy: Date = new Date()): number {
  const hoyIso = isoMx(hoy);
  return ms.filter((m) => m.periodo <= hoyIso).reduce((s, m) => s + Math.max(0, m.debe - m.pagado), 0);
}

export const INSCRIPCION_LABEL: Record<Inscripcion["estado"], { label: string; cls: string }> = {
  pagado: { label: "Pagada", cls: "bg-[#14532d] text-[#bbf7d0]" },
  parcial: { label: "Parcial", cls: "bg-[#5a4313] text-[#fde68a]" },
  pendiente: { label: "Pendiente", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  exento: { label: "Sin inscripción", cls: "bg-[#1e3a8a] text-[#dbeafe]" },
  no_aplica: { label: "No aplica", cls: "bg-[#2b2f3a] text-texto-3" },
};

export const MES_LABEL: Record<MesEstado, { label: string; cls: string }> = {
  pagado: { label: "Pagado", cls: "bg-[#14532d] text-[#bbf7d0]" },
  parcial: { label: "Parcial", cls: "bg-[#5a4313] text-[#fde68a]" },
  pendiente: { label: "Pendiente", cls: "bg-[#3a3346] text-texto-2" },
  vencido: { label: "Vencido", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  beca: { label: "Beca", cls: "bg-[#1e3a8a] text-[#dbeafe]" },
  futuro: { label: "Próximo", cls: "bg-[#2b2f3a] text-texto-3" },
};

export function mesNombre(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function pesos(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}
