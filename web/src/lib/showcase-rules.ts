// DARF Showcase Shows (0121): reglas puras (mensaje de WhatsApp, videos, anticipación). Pruebas en showcase-rules.test.ts.

export type Bloque = { titulo: string; texto: string };
export type ShowcaseAjustes = {
  publicado: boolean; titulo: string; lema: string | null; intro: string | null; importante: string | null;
  publicos: Bloque[]; especial: Bloque[]; antes_reservar: string[]; anticipacion: string[]; condiciones: Bloque[]; whatsapp: string | null;
};
export type ShowcasePlan = {
  id: string; orden: number; nombre: string; descripcion: string | null; precio: number | null; resumen: string | null; detalle: string | null;
  incluye: string[]; ideal_para: string | null; nota: string | null; activo: boolean;
};
export type ShowcaseMedia = { id: string; plan_id: string | null; categoria: "show" | "equipo" | "ensayos"; tipo: "foto" | "video"; path: string | null; url: string | null; titulo: string | null; orden: number };
export type Solicitud = { plan: string; nombre: string; telefono: string; correo?: string | null; fecha?: string | null; horario?: string | null; lugar?: string | null; tipo?: string | null; personas?: number | null; notas?: string | null };

export const TIPOS_EVENTO = ["Escuela", "Empresa", "Celebración", "Otro"] as const;
export const CATEGORIAS: Record<ShowcaseMedia["categoria"], string> = { show: "En escena", equipo: "Equipo", ensayos: "Ensayos" };

/** "Sábado 7 de noviembre de 2026" desde "2026-11-07". */
export function fechaLegible(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mensaje de WhatsApp con todo lo del formulario. Vacío si no hay número. */
export function whatsappShowcaseUrl(numero: string | null | undefined, s: Solicitud): string {
  const n = (numero ?? "").replace(/\D/g, "");
  if (!n) return "";
  const lineas = [
    `Hola, quiero contratar el showcase *${s.plan}*.`,
    `Nombre: ${s.nombre}`,
    `Teléfono: ${s.telefono}`,
    s.correo && `Correo: ${s.correo}`,
    s.fecha && `Fecha: ${fechaLegible(s.fecha)}`,
    s.horario && `Horario: ${s.horario}`,
    s.lugar && `Lugar: ${s.lugar}`,
    s.tipo && `Tipo de evento: ${s.tipo}`,
    s.personas && `Personas: ${s.personas}`,
    s.notas && `Notas: ${s.notas}`,
  ].filter(Boolean);
  return `https://wa.me/${n}?text=${encodeURIComponent(lineas.join("\n"))}`;
}

/** Días que faltan para la fecha (en días de calendario de CDMX). */
export function diasHasta(fecha: string, hoy: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Mexico_City" }).format(hoy);
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${h}T00:00:00Z`)) / 86_400_000);
}

/** Aviso de anticipación (dossier: estándar 2 semanas; personalizado 1 mes). */
export function avisoAnticipacion(fecha: string | null | undefined, hoy: Date = new Date()): string | null {
  if (!fecha) return null;
  const d = diasHasta(fecha, hoy);
  if (d < 0) return "Esa fecha ya pasó.";
  if (d < 14) return "Faltan menos de 2 semanas: lo revisamos contigo, pero puede que no alcancemos a prepararlo.";
  if (d < 30) return "Para un show personalizado (medley o setlist especial) pedimos al menos 1 mes de anticipación.";
  return null;
}

/** Video: YouTube (se reproduce en la página) u otra liga (Instagram, TikTok…: se abre aparte). */
export function tipoVideo(url: string): "youtube" | "otro" {
  return /(?:youtu\.be\/|youtube\.com\/)/i.test(url) ? "youtube" : "otro";
}

export function precioTexto(n: number | null): string {
  return n == null ? "A cotizar" : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}
