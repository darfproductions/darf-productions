// Mi cuenta y cumpleaños (0051). Puro, con pruebas en account-rules.test.ts.

/** Mismas reglas que al registrarse: 8+ caracteres con letras y números. */
export const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

export const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Fecha válida (AAAA-MM-DD), no futura y después de 1900. */
export function fechaNacimientoOk(v: string, hoy: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v >= "1900-01-01" && v <= hoy.toISOString().slice(0, 10);
}

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type Cumple = { user_id: string; nombre: string; dia: number; mes: number; nacimiento?: string | null; foto_path?: string | null };

/** Los del mes, ordenados por día. */
export function cumplesDelMes<T extends Cumple>(xs: T[], mes: number): T[] {
  return xs.filter((x) => x.mes === mes).sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre));
}

/** Años que cumple este año (solo si se conoce el año). */
export function cumpleAnios(nacimiento: string | null | undefined, hoy: Date = new Date()): number | null {
  if (!nacimiento) return null;
  return hoy.getFullYear() - Number(nacimiento.slice(0, 4));
}

/** "Hoy", "Mañana", "En 5 días" o null si ya pasó este mes. */
export function cuandoCumple(c: Pick<Cumple, "dia" | "mes">, hoy: Date = new Date()): string | null {
  const y = hoy.getFullYear();
  const base = new Date(y, hoy.getMonth(), hoy.getDate());
  let d = new Date(y, c.mes - 1, c.dia);
  if (d < base) d = new Date(y + 1, c.mes - 1, c.dia);
  const dias = Math.round((d.getTime() - base.getTime()) / 86400000);
  if (dias === 0) return "¡Hoy!";
  if (dias === 1) return "Mañana";
  if (dias <= 31) return `En ${dias} días`;
  return null;
}

/** La función ya pasó (6 horas después de su inicio). Sin fecha: no ha pasado. */
export function funcionPasada(startsAt: string | null, ahora: Date = new Date()): boolean {
  if (!startsAt) return false;
  return new Date(startsAt).getTime() + 6 * 3600 * 1000 < ahora.getTime();
}
