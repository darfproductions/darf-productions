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
