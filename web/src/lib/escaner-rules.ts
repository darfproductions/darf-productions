// Escáner de QR "automático con pausa" (Diego 2026-10-14): lee solo, pero después de cada lectura se
// detiene un momento; un código que ya se leyó en esta sesión no se vuelve a mandar. Puro, con pruebas.

export const PAUSA_MS = 2000;
/** El mismo código seguido (la persona sigue con el QR enfrente) se ignora este tiempo. */
export const MISMO_MS = 6000;

export type EstadoEscaner = { ultimo: { token: string; at: number } | null; vistos: Set<string>; pausaHasta: number };

export const estadoInicial = (): EstadoEscaner => ({ ultimo: null, vistos: new Set(), pausaHasta: 0 });

/** Qué hacer con un código leído: ignorarlo, avisar que ya se registró, o mandarlo como nuevo. */
export function decidir(e: EstadoEscaner, token: string, ahora: number, manual = false): "ignorar" | "repetido" | "nuevo" {
  const t = token.trim();
  if (!t) return "ignorar";
  if (!manual) {
    if (ahora < e.pausaHasta) return "ignorar";
    if (e.ultimo && e.ultimo.token === t && ahora - e.ultimo.at < MISMO_MS) return "ignorar";
  }
  return !manual && e.vistos.has(t) ? "repetido" : "nuevo";
}

/** Registra la lectura (y pausa la cámara). */
export function registrar(e: EstadoEscaner, token: string, ahora: number): void {
  const t = token.trim();
  e.ultimo = { token: t, at: ahora };
  e.vistos.add(t);
  e.pausaHasta = ahora + PAUSA_MS;
}
