import { createClient as crear, type SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";
import { env } from "@/lib/env";

// Lecturas públicas guardadas (2026-10-25): lo que ve cualquiera en la página de una obra, la portada y la compra
// (obra, funciones, precios, mapa, contenido, logística) se pide a la base como visitante sin sesión y se guarda
// unos segundos en el caché de Next, compartido por todas las visitas. Con cientos de personas entrando a la vez,
// la base contesta una vez por minuto en lugar de una por persona.
// Nada de aquí depende de quién mira: lo propio de cada persona (sesión, Club Fan, órdenes) sigue fuera del caché.
// Al guardar desde el panel, refrescarPublico() lo refresca al instante; lo demás tarda a lo más el minuto.

export const TAG_PUBLICO = "publico";

let cliente: SupabaseClient | null = null;
/** Cliente de visitante: sin cookies ni sesión (solo lo que la base deja ver al público). */
export function clientePublico(): SupabaseClient {
  cliente ??= crear(env.supabaseUrl, env.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return cliente;
}

/** Envuelve una lectura pública con caché de `segundos`. El resultado debe ser JSON (sin Map ni Date). */
export function publico<A extends unknown[], R>(nombre: string, leer: (sb: SupabaseClient, ...args: A) => Promise<R>, segundos = 60) {
  return unstable_cache((...args: A) => leer(clientePublico(), ...args), ["publico", nombre], { revalidate: segundos, tags: [TAG_PUBLICO, `publico:${nombre}`] });
}

/** Tras guardar algo público desde el panel: la siguiente visita lo lee de la base (no espera el minuto). */
export function refrescarPublico() {
  revalidateTag(TAG_PUBLICO, { expire: 0 });
}
