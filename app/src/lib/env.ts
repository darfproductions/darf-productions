// Configuración por entorno de la app (app/.env.local o variables de la compilación).
// Todas son públicas por diseño: van dentro de la app. NUNCA la service_role key.

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Falta la variable ${nombre}. Revisa app/.env.example.`);
  return valor;
}

export const env = {
  darfEnv: import.meta.env.VITE_DARF_ENV ?? "DEV",
  supabaseUrl: requerida("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: requerida("VITE_SUPABASE_PUBLISHABLE_KEY", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  /** Sitio web: imágenes propias de la web ("/producciones/…"), compra en línea y ligas para compartir. */
  siteUrl: (import.meta.env.VITE_SITE_URL ?? "https://www.darfproductions.com").replace(/\/$/, ""),
  /** WhatsApp de pagos, 52 + 10 dígitos. Vacío = sin botón. */
  whatsapp: import.meta.env.VITE_DARF_WHATSAPP ?? "",
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "",
};

// Mismo candado que la web (web/src/lib/env.ts): una compilación PROD solo usa la base oficial de la 2.0.
const BASE_OFICIAL = "qgywscczyzuqinutuvak";
if (env.darfEnv === "PROD" && !env.supabaseUrl.includes(BASE_OFICIAL)) {
  throw new Error("VITE_DARF_ENV=PROD debe usar la base oficial de la 2.0.");
}
if (env.darfEnv === "PROD" && env.whatsapp && !/^52\d{10}$/.test(env.whatsapp)) {
  throw new Error("VITE_DARF_WHATSAPP debe ser 52 + 10 dígitos (sin + ni espacios).");
}
