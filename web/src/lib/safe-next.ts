// Destino seguro después de entrar (puro, con pruebas en safe-next.test.ts).

/** Solo rutas internas, para evitar redirecciones a otros sitios. */
export function safeNext(next: string | null | undefined, fallback = "/cuenta"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // "\" y caracteres de control: el navegador los convierte en "//otro-sitio" (0068).
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://darf.local");
    if (u.origin !== "https://darf.local") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
