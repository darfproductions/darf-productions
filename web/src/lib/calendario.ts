// "Agregar al calendario" (Bloque 4): archivo .ics (Apple, cualquier app) y ligas de Google Calendar y
// Outlook (personal o Microsoft 365) para funciones, eventos y ensayos. Puro, con pruebas en calendario.test.ts.

export type EventoCal = {
  uid: string;
  titulo: string;
  inicia: string; // ISO
  termina?: string | null; // ISO; si falta, dura `horas`
  lugar?: string | null;
  detalle?: string | null;
  url?: string | null;
};

const fechaUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function fin(e: EventoCal, horas: number): Date {
  return e.termina ? new Date(e.termina) : new Date(new Date(e.inicia).getTime() + horas * 3600_000);
}

/** Escapa texto para ICS (comas, punto y coma, diagonales y saltos de línea). */
export function escaparIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Líneas de más de 75 caracteres se doblan (regla del formato). */
function doblar(linea: string): string {
  const out: string[] = [];
  let resto = linea;
  while (resto.length > 75) {
    out.push(resto.slice(0, 75));
    resto = ` ${resto.slice(75)}`;
  }
  out.push(resto);
  return out.join("\r\n");
}

/** Un evento (VEVENT) con aviso 2 horas antes. */
function vevento(e: EventoCal, horas: number, ahora: Date): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}@darfproductions.com`,
    `DTSTAMP:${fechaUtc(ahora)}`,
    `DTSTART:${fechaUtc(new Date(e.inicia))}`,
    `DTEND:${fechaUtc(fin(e, horas))}`,
    `SUMMARY:${escaparIcs(e.titulo)}`,
    ...(e.lugar ? [`LOCATION:${escaparIcs(e.lugar)}`] : []),
    ...(e.detalle || e.url ? [`DESCRIPTION:${escaparIcs([e.detalle, e.url].filter(Boolean).join("\n"))}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparIcs(e.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

const CABEZA = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DARF Productions//DARF 2.0//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

export function archivoIcs(e: EventoCal, horas = 2.5, ahora: Date = new Date()): string {
  return [...CABEZA, ...vevento(e, horas, ahora), "END:VCALENDAR"].map(doblar).join("\r\n") + "\r\n";
}

/** 0156: "Mi calendario DARF" para suscribirse (Google, Apple, Outlook): todos los eventos de la persona, con nombre y
 *  pidiendo que se vuelva a revisar cada hora. */
export function calendarioIcs(eventos: EventoCal[], nombre: string, horas = 2.5, ahora: Date = new Date()): string {
  return [
    ...CABEZA,
    `X-WR-CALNAME:${escaparIcs(nombre)}`,
    "X-WR-TIMEZONE:America/Mexico_City",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...eventos.flatMap((e) => vevento(e, horas, ahora)),
    "END:VCALENDAR",
  ].map(doblar).join("\r\n") + "\r\n";
}

/** 0156: ligas para suscribirse a una liga .ics desde cada servicio. */
export function ligasSuscripcion(urlIcs: string, nombre: string): { google: string; apple: string; outlook: string } {
  const webcal = urlIcs.replace(/^https?:\/\//, "webcal://");
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    apple: webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(urlIcs)}&name=${encodeURIComponent(nombre)}`,
  };
}

/** Liga para agregarlo en Google Calendar. */
export function ligaGoogle(e: EventoCal, horas = 2.5): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.titulo,
    dates: `${fechaUtc(new Date(e.inicia))}/${fechaUtc(fin(e, horas))}`,
    ctz: "America/Mexico_City",
  });
  if (e.lugar) p.set("location", e.lugar);
  const det = [e.detalle, e.url].filter(Boolean).join("\n");
  if (det) p.set("details", det);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Liga para agregarlo en Outlook: cuenta personal (Outlook.com, Hotmail) o de trabajo/escuela (Microsoft 365). */
export function ligaOutlook(e: EventoCal, cuenta: "personal" | "trabajo" = "personal", horas = 2.5): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.titulo,
    startdt: new Date(e.inicia).toISOString(),
    enddt: fin(e, horas).toISOString(),
  });
  if (e.lugar) p.set("location", e.lugar);
  const det = [e.detalle, e.url].filter(Boolean).join("\n");
  if (det) p.set("body", det);
  const host = cuenta === "trabajo" ? "outlook.office.com" : "outlook.live.com";
  return `https://${host}/calendar/0/action/compose?${p.toString()}`;
}
