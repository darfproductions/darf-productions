// Vencimiento de órdenes y recordatorios (0054). Puro, con pruebas en expiry-rules.test.ts.

/** "23 h 10 min", "45 min" o null si ya venció (o no vence). */
export function tiempoRestante(expiresAt: string | null, ahora: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const min = Math.floor((new Date(expiresAt).getTime() - ahora.getTime()) / 60000);
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

const TZ = "America/Mexico_City";
const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hora = (d: Date) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);

/** Hora límite para mostrar: "hoy 8:00 p.m.", "mañana 9:30 a.m." o "sáb 12 oct, 8:00 p.m.". */
export function limiteTexto(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const hoy = dia(ahora);
  const manana = dia(new Date(ahora.getTime() + 86400000));
  if (dia(d) === hoy) return `hoy ${hora(d)}`;
  if (dia(d) === manana) return `mañana ${hora(d)}`;
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

/** Recordatorio de función en los próximos 7 días: "Hoy", "Mañana" o "En 3 días"; null si no aplica. */
export function recordatorio(startsAt: string | null, ahora: Date = new Date()): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (d.getTime() < ahora.getTime() - 3 * 3600000) return null;
  const dias = Math.round((Date.parse(dia(d)) - Date.parse(dia(ahora))) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias <= 7) return `En ${dias} días`;
  return null;
}
