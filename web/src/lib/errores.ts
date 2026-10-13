// Errores para el público, en español (Bloque 2). Los avisos de nuestras funciones de la base ya
// vienen en español y se muestran tal cual; los técnicos (red, sesión, permisos, archivos, PostgREST)
// se traducen o se cambian por uno general. Función pura: errores.test.ts.

type ErrorLike = { message?: string | null; code?: string | null } | string | null | undefined;

const GENERAL = "Algo salió mal. Intenta de nuevo; si sigue pasando, escríbenos.";

/** ¿El texto ya está en español? (nuestros avisos de la base y de la página). */
export function pareceEspanol(t: string): boolean {
  return /[áéíóúñ¿¡]/i.test(t) || /(^|\s)(no|ya|tu|tus|la|el|los|las|de|del|para|con|una|un|este|esta|solo|elige|escribe|revisa)(\s|$)/i.test(t);
}

export function mensajeError(e: ErrorLike, general = GENERAL): string {
  if (!e) return general;
  const message = (typeof e === "string" ? e : e.message ?? "").trim();
  const code = typeof e === "string" ? "" : e.code ?? "";
  const m = message.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("fetch failed") || m.includes("network") || m.includes("econnrefused")) {
    return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
  }
  if (m.includes("jwt") || code === "PGRST301" || m.includes("session") && m.includes("expired")) return "Tu sesión expiró. Vuelve a entrar.";
  if (m.includes("maximum allowed size") || m.includes("payload too large") || m.includes("entity too large")) return "El archivo es demasiado grande.";
  if (m.includes("mime type") || m.includes("invalid file type")) return "Ese tipo de archivo no se acepta. Usa una foto JPG, PNG o WebP.";
  if (message && pareceEspanol(message)) return message;
  if (code === "42501" || m.includes("row-level security") || m.includes("permission denied")) return "No tienes permiso para hacer esto.";
  if (code === "23505" || m.includes("duplicate key")) return "Eso ya estaba registrado.";
  if (code === "23514" || code === "22P02" || m.includes("violates check constraint") || m.includes("invalid input syntax")) return "Revisa los datos: alguno no es válido.";
  return general;
}
