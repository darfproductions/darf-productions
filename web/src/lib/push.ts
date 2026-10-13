import { createClient } from "@/lib/supabase/server";

/** Tipos de aviso que pueden llegar al teléfono (los mismos de notifications, 0066). */
export const PUSH_TIPOS: { id: string; label: string }[] = [
  { id: "equipo", label: "Equipo: avisos, materiales, notas, juntas y comentarios" },
  { id: "elenco", label: "Elenco: comunicados y ensayos nuevos, cambiados o cancelados" },
  { id: "orden", label: "Ventas: órdenes nuevas por aprobar" },
  { id: "boletos", label: "Mis boletos: orden aprobada, apartado por vencer y recordatorio de función" },
  { id: "contacto", label: "Mensajes de contacto y preguntas a DARFY" },
  { id: "audicion", label: "Audiciones: solicitudes, registro de talento y mis resultados" },
  { id: "oferta", label: "Respuestas a ofertas de papel" },
  { id: "documento", label: "Documentos de expedientes" },
  { id: "solicitud", label: "Solicitudes del elenco (faltas, documentos y pagos) y sus respuestas" },
  { id: "pago", label: "Mis pagos: recibos y recordatorios de mensualidad" },
  { id: "cambio", label: "Cambios de configuración" },
  { id: "anuncio", label: "Anuncios: cuando se revela algo que pediste que te avisáramos" },
  { id: "fanzone", label: "Fan Zone: preventas y novedades del Club Fan" },
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

/** Lo que le llega a alguien sin panel (elenco, fans): sus boletos, sus solicitudes y su equipo. */
export const PUSH_TIPOS_CUENTA: { id: string; label: string }[] = [
  { id: "boletos", label: "Mis boletos: orden aprobada, apartado por vencer y recordatorio de función" },
  { id: "solicitud", label: "Respuestas a mis solicitudes (faltas, documentos y pagos)" },
  { id: "pago", label: "Mis pagos: recibos y recordatorios de mensualidad" },
  { id: "elenco", label: "Mi obra: comunicados y ensayos nuevos, cambiados o cancelados" },
  { id: "audicion", label: "Mis audiciones: convocatoria, callback y resultados" },
  { id: "equipo", label: "Avisos, materiales, notas y juntas de mi equipo" },
  { id: "anuncio", label: "Anuncios: cuando se revela algo que pediste que te avisáramos" },
  { id: "fanzone", label: "Fan Zone: preventas y novedades del Club Fan" },
];
