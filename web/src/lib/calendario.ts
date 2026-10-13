// "Agregar al calendario" (Bloque 4): archivo .ics (Apple, Outlook, cualquier app) y liga de Google
// Calendar para funciones, eventos y ensayos. Puro, con pruebas en calendario.test.ts.

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

export function archivoIcs(e: EventoCal, horas = 2.5, ahora: Date = new Date()): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DARF Productions//DARF 2.0//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
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
    "END:VCALENDAR",
  ];
  return lineas.map(doblar).join("\r\n") + "\r\n";
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
