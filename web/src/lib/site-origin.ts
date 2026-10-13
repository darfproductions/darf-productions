import { headers } from "next/headers";

/** Origen del sitio para las ligas de los correos (confirmar, recuperar, cambiar correo). Se toma del
 *  host al que llegó la petición (no del encabezado "origin", que puede faltar). Supabase solo acepta
 *  redirecciones a las URL autorizadas en su configuración. */
export async function origenSitio(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
