import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Cliente de Supabase para componentes que corren en el navegador.
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
