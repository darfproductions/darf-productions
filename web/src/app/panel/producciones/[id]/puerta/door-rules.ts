// Reglas de Puerta (puras, con prueba en door-rules.test.ts).

/** Función que se abre por omisión: la de hoy (la más cercana a la hora actual) o, si no hay, la siguiente; si todas pasaron, la última. */
export function funcionDePuerta(funciones: { id: string; starts_at: string }[], ahora: Date): string | null {
  if (!funciones.length) return null;
  const t = ahora.getTime();
  const hoy = funciones.filter((f) => Math.abs(new Date(f.starts_at).getTime() - t) < 12 * 3600_000);
  if (hoy.length) return hoy.sort((a, b) => Math.abs(new Date(a.starts_at).getTime() - t) - Math.abs(new Date(b.starts_at).getTime() - t))[0].id;
  const futura = funciones.filter((f) => new Date(f.starts_at).getTime() > t).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  return (futura ?? [...funciones].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]).id;
}

/** "General · Pista" ya trae la zona: no repetirla. */
export function etiquetaBoleto(seat?: string, category?: string): string {
  if (!seat) return category ?? "";
  return category && !seat.includes(category) ? `${seat} · ${category}` : seat;
}
