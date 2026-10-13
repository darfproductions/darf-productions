// Mi cuenta y cumpleaños (0051). Puro, con pruebas en account-rules.test.ts.
import { isoMx, partesMx } from "@/lib/dates";

/** Mismas reglas que al registrarse: 8+ caracteres con letras y números. */
/** Contraseñas demasiado comunes (se adivinan en segundos aunque tengan letras y números). */
const COMUNES = new Set([
  "password1", "password12", "password123", "contrasena1", "contraseña1", "qwerty123", "qwerty12", "abc12345", "abcd1234", "abc123456",
  "a1234567", "1234567a", "12345678a", "1q2w3e4r", "1q2w3e4r5t", "zaq12wsx", "iloveyou1", "teamo123", "darf1234", "darf2026",
  "darfproductions1", "showman1", "mexico123", "admin123", "welcome1", "hola1234", "test1234", "prueba123",
]);

/** Mínimo 8, con letras y números, que no sea de las más comunes ni contenga el usuario del correo. */
export function passwordOk(p: string, email?: string | null): boolean {
  if (p.length < 8 || p.length > 72 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return false;
  const bajo = p.toLowerCase();
  if (COMUNES.has(bajo)) return false;
  const usuario = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  return !(usuario.length >= 4 && bajo.includes(usuario));
}

export const PASSWORD_AYUDA = "Al menos 8 caracteres, con letras y números. Que no sea fácil de adivinar ni lleve tu correo.";

export const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Fecha válida (AAAA-MM-DD), no futura y después de 1900. */
export function fechaNacimientoOk(v: string, hoy: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v >= "1900-01-01" && v <= isoMx(hoy);
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
  return partesMx(hoy).y - Number(nacimiento.slice(0, 4));
}

/** "Hoy", "Mañana", "En 5 días" o null si ya pasó este mes. */
export function cuandoCumple(c: Pick<Cumple, "dia" | "mes">, hoy: Date = new Date()): string | null {
  const h = partesMx(hoy);
  const base = Date.UTC(h.y, h.m - 1, h.d);
  let d = Date.UTC(h.y, c.mes - 1, c.dia);
  if (d < base) d = Date.UTC(h.y + 1, c.mes - 1, c.dia);
  const dias = Math.round((d - base) / 86400000);
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

/** Teléfono de contacto: 10 dígitos de México (con o sin 52/+52) o un número internacional de 10 a 13
 *  dígitos. Se aceptan espacios, guiones y paréntesis. */
export function telefonoOk(v: string): boolean {
  const d = v.replace(/[\s()+.-]/g, "");
  return /^\d{10,13}$/.test(d);
}
