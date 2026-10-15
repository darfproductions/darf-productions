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

/** 0110: el escáner de la puerta lee boletos (UUID) y pases del Club Fan (liga /g/ o /f/, DRF-XXXX, FAN-XXXX o token). */
export function esPaseClub(code: string): boolean {
  const c = code.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return false;
  return /\/(g|f)\/[0-9a-f]+/i.test(c) || /^(DRF|FAN)-[2-9A-HJ-NP-Z]{4}$/i.test(c) || /^[0-9a-f]{24,80}$/i.test(c);
}
