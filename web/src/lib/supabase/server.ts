import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Cliente de Supabase para componentes de servidor y acciones. Usa la sesión
// del usuario (cookies), así que las reglas RLS de la base se aplican igual
// que en el navegador: este cliente no tiene privilegios especiales.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un componente de servidor (solo lectura): el proxy
          // ya refresca la sesión en cada navegación.
        }
      },
    },
  });
}
