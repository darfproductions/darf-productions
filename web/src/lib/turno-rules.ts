// Turnos de audición (0140): el texto que se manda a cada quien ("tu turno es el 7, tu horario es…") y la liga de
// WhatsApp para mandarlo a mano, una por una. Puro, con pruebas en turno-rules.test.ts.
import { mayus } from "@/lib/dates";

/** Teléfono para wa.me: solo dígitos; a 10 dígitos de México se les pone 52. Vacío si no sirve. */
export function telefonoWa(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** "Sábado 8 de noviembre, 11:50 a.m. a 12:10 p.m." (la hora de fin es opcional). */
export function textoHorario(inicia: string | null | undefined, termina?: string | null): string | null {
  if (!inicia) return null;
  const tz = "America/Mexico_City";
  const d = new Date(inicia);
  const dia = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  const hora = (x: Date) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(x)
    .replace(/\s*a\.?\s*m\.?/i, " a.m.").replace(/\s*p\.?\s*m\.?/i, " p.m.").replace(/ | /g, " ");
  // Como en la base (_hora_mx): "Domingo 8 de noviembre, 11:50 a.m." (sin coma después del día de la semana).
  return `${mayus(dia.replace(",", ""))}, ${hora(d)}${termina ? ` a ${hora(new Date(termina))}` : ""}`;
}

export type DatosTurno = { nombre: string; titulo: string; numero: number; horario?: string | null; sala?: string | null; sede?: string | null };

/** El mensaje para WhatsApp: corto, con el nombre de pila, el turno, el horario y el lugar. */
export function mensajeTurno(t: DatosTurno): string {
  const pila = t.nombre.trim().split(/\s+/)[0] || t.nombre;
  const lugar = [t.sala?.trim(), t.sede?.trim()].filter(Boolean).join(", ");
  return `Hola ${pila}, tu turno para la audición de ${t.titulo.trim()} es el Nº ${t.numero}.`
    + (t.horario ? ` Tu horario: ${t.horario}${t.horario.endsWith(".") ? "" : "."}` : "")
    + (lugar ? ` Lugar: ${lugar}.` : "")
    + " Llega 15 minutos antes con tu QR de inscripción.";
}

/** Liga de WhatsApp con el mensaje ya escrito, o null si el teléfono no sirve. */
export function turnoWhatsAppUrl(tel: string | null | undefined, t: DatosTurno): string | null {
  const n = telefonoWa(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensajeTurno(t))}` : null;
}
