"use server";

import { mensajeError } from "@/lib/errores";
import { whatsappShowcaseUrl, type Solicitud } from "@/lib/showcase-rules";
import { createClient } from "@/lib/supabase/server";

export type SolicitudResult = { ok: true; whatsappUrl: string } | { ok: false; message: string };

/** 0121: guarda la solicitud (bandeja del panel) y regresa el WhatsApp con la información. */
export async function solicitarShowcase(planId: string, s: Omit<Solicitud, "plan"> & { planNombre: string }): Promise<SolicitudResult> {
  const supabase = await createClient();
  const personas = s.personas && Number.isFinite(s.personas) ? Math.round(s.personas) : null;
  const { data, error } = await supabase.rpc("showcase_solicitar", {
    p_plan: planId, p_nombre: s.nombre, p_telefono: s.telefono, p_correo: s.correo || null, p_fecha: s.fecha || null,
    p_horario: s.horario || null, p_lugar: s.lugar || null, p_tipo: s.tipo || null, p_personas: personas, p_notas: s.notas || null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  const wa = whatsappShowcaseUrl((data as { whatsapp: string | null }).whatsapp, { ...s, personas, plan: s.planNombre });
  return { ok: true, whatsappUrl: wa };
}
