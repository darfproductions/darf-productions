// Fechas de funciones: el panel trabaja en hora del centro de México.
// México no usa horario de verano desde 2022: siempre UTC−6.

const OFFSET = "-06:00";

/** "2027-05-22T19:00" (hora de CDMX, como la escribe el formulario) → ISO con zona. */
export function localMxToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  return `${local}:00${OFFSET}`;
}

/** ISO de la base → "2027-05-22T19:00" para el formulario (hora de CDMX). */
export function isoToLocalMx(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 6 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

const DIA_MX = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Mexico_City" });

/** Fecha de México "2026-10-13" de un instante (el servidor corre en UTC: después de las 18:00 ya sería "mañana"). */
export function isoMx(d: Date = new Date()): string {
  return DIA_MX.format(d);
}

/** Año, mes (1-12) y día de hoy en México. */
export function partesMx(d: Date = new Date()): { y: number; m: number; d: number } {
  const [y, m, dd] = isoMx(d).split("-").map(Number);
  return { y, m, d: dd };
}

/** Primera letra en mayúscula ("viernes, 22 de noviembre" → "Viernes, 22 de noviembre"). */
export function mayus(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cierra una oración sin duplicar el punto de "p.m." ("… 8:00 p.m." + "." → "… 8:00 p.m."). */
export function conPunto(s: string): string {
  return s.endsWith(".") ? s : `${s}.`;
}
