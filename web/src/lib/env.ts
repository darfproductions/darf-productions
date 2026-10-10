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
};

export const isDev = env.darfEnv !== "PROD";
