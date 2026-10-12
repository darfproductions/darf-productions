// Configuración por entorno. Los valores vienen de variables de entorno
// (Vercel → Settings → Environment Variables, o web/.env.local en local).
// Todas son públicas por diseño (van al navegador): NUNCA poner aquí la
// service_role key ni ningún secreto. Cada proyecto de Vercel conoce solo su
// propio entorno: el proyecto DEV solo tiene los valores de Supabase DEV.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisa web/.env.example.`,
    );
  }
  return value;
}

export const env = {
  /** 'DEV' muestra la franja de entorno de pruebas. */
  darfEnv: process.env.NEXT_PUBLIC_DARF_ENV ?? "DEV",
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  /** Número de WhatsApp para pagos, sin "+" ni espacios. Vacío = sin botón. */
  whatsapp: process.env.NEXT_PUBLIC_DARF_WHATSAPP ?? "",
  /** Liga al panel de la 1.0 (solo mientras conviven). Vacío = no se muestra. */
  panel1Url: process.env.NEXT_PUBLIC_DARF_PANEL_1_URL ?? "",
};

export const isDev = env.darfEnv !== "PROD";

// Candado de lanzamiento (0068): una compilación de producción nunca debe usar la base DEV.
const DEV_REF = "qgywscczyzuqinutuvak";
if (env.darfEnv === "PROD" && env.supabaseUrl.includes(DEV_REF)) {
  throw new Error("NEXT_PUBLIC_DARF_ENV=PROD pero la página apunta a Supabase DEV. Revisa las variables del proyecto en Vercel.");
}
