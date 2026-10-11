// Reglas del expediente y las mensualidades (etapa 3E, bloque 2). Puras, con pruebas.
// La base vuelve a revisar permisos; aquí solo se calcula lo que se muestra.

export type MemberFile = {
  fecha_nacimiento: string | null; telefono: string | null;
  emergencia_nombre: string | null; emergencia_telefono: string | null; emergencia_parentesco: string | null;
  tutor_nombre: string | null; tutor_telefono: string | null; tutor_email: string | null;
  alergias: string | null; condiciones: string | null; medicamentos: string | null; tipo_sangre: string | null;
  altura_cm: number | null; pecho_cm: number | null; cintura_cm: number | null; cadera_cm: number | null;
  talla_ropa: string | null; talla_calzado: string | null;
  revisado_at: string | null;
};

export type FeeTerms = { beca: boolean; cuota_especial: number | null };

export type DocType = { id: string; nombre: string; solo_menores: boolean; obligatorio: boolean };
export type MemberDoc = { doc_type_id: string; archivo_path: string | null; subido_at: string | null; entregado_at: string | null };

const lleno = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

/** Edad cumplida hoy (o null si no hay fecha). */
export function edad(nacimiento: string | null, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let e = hoy.getUTCFullYear() - y;
  if (hoy.getUTCMonth() + 1 < mo || (hoy.getUTCMonth() + 1 === mo && hoy.getUTCDate() < d)) e--;
  return e;
}

/** Qué datos obligatorios faltan en el expediente. */
export function faltantes(f: Partial<MemberFile> | null, hoy: Date = new Date()): string[] {
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

/** Documentos obligatorios que aún no se entregan (los de menores, solo si es menor). */
export function docsPendientes(tipos: DocType[], docs: MemberDoc[], esMenor: boolean): DocType[] {
  return tipos.filter((t) => t.obligatorio && (!t.solo_menores || esMenor) && !docs.find((d) => d.doc_type_id === t.id)?.entregado_at);
}

export type Semaforo = "rojo" | "amarillo" | "verde";

/** Rojo: faltan datos o documentos. Amarillo: completo pero sin revisar. Verde: completo y revisado. */
export function semaforo(f: Partial<MemberFile> | null, pendientes: number, hoy: Date = new Date()): Semaforo {
  if (faltantes(f, hoy).length || pendientes) return "rojo";
  return f?.revisado_at ? "verde" : "amarillo";
}

export const SEMAFORO: Record<Semaforo, { label: string; cls: string }> = {
  rojo: { label: "Le falta información", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  amarillo: { label: "Por revisar", cls: "bg-[#5a4313] text-[#fde68a]" },
  verde: { label: "Completo", cls: "bg-[#14532d] text-[#bbf7d0]" },
};

// ──────── Mensualidades ────────

export type Fee = { monto: number; desde: string; hasta: string; dia_limite: number };
export type Payment = { periodo: string; monto: number };
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

/** Estado de cada mes para una persona (beca = no paga; cuota especial reemplaza el monto). */
export function estadoCuotas(fee: Fee, persona: FeeTerms, pagos: Payment[], hoy: Date = new Date()): Mes[] {
  const debe = persona.beca ? 0 : Number(persona.cuota_especial ?? fee.monto);
  const hoyIso = hoy.toISOString().slice(0, 10);
  return meses(fee.desde, fee.hasta).map((periodo) => {
    const pagado = pagos.filter((p) => p.periodo === periodo).reduce((s, p) => s + Number(p.monto), 0);
    const limite = `${periodo.slice(0, 8)}${String(fee.dia_limite).padStart(2, "0")}`;
    let estado: MesEstado;
    if (persona.beca || debe === 0) estado = "beca";
    else if (pagado >= debe) estado = "pagado";
    else if (pagado > 0) estado = "parcial";
    else if (periodo > hoyIso) estado = "futuro";
    else estado = hoyIso > limite ? "vencido" : "pendiente";
    return { periodo, debe, pagado, estado };
  });
}

/** Cuánto debe a hoy (meses ya iniciados). */
export function adeudo(ms: Mes[], hoy: Date = new Date()): number {
  const hoyIso = hoy.toISOString().slice(0, 10);
  return ms.filter((m) => m.periodo <= hoyIso).reduce((s, m) => s + Math.max(0, m.debe - m.pagado), 0);
}

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
