import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

// Cliente de Supabase para componentes de servidor y acciones. Usa la sesión
// del usuario (cookies), así que las reglas RLS de la base se aplican igual
// que en el navegador: este cliente no tiene privilegios especiales.
export async function createClient() {
  // App DARF (iOS / Android): manda su sesión como "Authorization: Bearer <jwt>" (no tiene las cookies de la web).
  // Se usa ese mismo token: la base lo valida (getUser) y aplica RLS igual que con la cookie.
  const bearer = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/i.exec((await headers()).get("authorization") ?? "")?.[1];
  if (bearer) {
    const cliente = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
      cookies: { getAll: () => [], setAll() {} },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const getUser = cliente.auth.getUser.bind(cliente.auth);
    cliente.auth.getUser = ((jwt?: string) => getUser(jwt ?? bearer)) as typeof cliente.auth.getUser;
    return cliente;
  }

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
