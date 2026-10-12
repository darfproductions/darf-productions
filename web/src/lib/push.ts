import { createClient } from "@/lib/supabase/server";

/** Tipos de aviso que pueden llegar al teléfono (los mismos de notifications, 0066). */
export const PUSH_TIPOS: { id: string; label: string }[] = [
  { id: "equipo", label: "Equipo: avisos, materiales, notas, juntas y comentarios" },
  { id: "orden", label: "Ventas: órdenes nuevas por aprobar" },
  { id: "contacto", label: "Mensajes de contacto y preguntas a DARFY" },
  { id: "audicion", label: "Solicitudes de audición y registro de talento" },
  { id: "oferta", label: "Respuestas a ofertas de papel" },
  { id: "documento", label: "Documentos de expedientes" },
  { id: "ausencia", label: "Avisos de falta a ensayos" },
  { id: "cambio", label: "Cambios de configuración" },
];

export type PushInfo = { publicKey: string | null; apagados: string[] };

/** Llave pública (para suscribirse) y tipos que la persona apagó. */
export async function getPushInfo(): Promise<PushInfo> {
  const supabase = await createClient();
  const [key, prefs] = await Promise.all([
    supabase.rpc("push_public_key"),
    supabase.from("push_prefs").select("apagados").maybeSingle(),
  ]);
  return { publicKey: (key.data as string | null) ?? null, apagados: (prefs.data?.apagados as string[] | undefined) ?? [] };
}
