"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";

export type ApplyState = { ok: boolean; message: string } | null;

// Inscribirse o actualizar la inscripción: la base valida todo (audition_apply, 0036).
export async function applyToAudition(_p: ApplyState, f: FormData): Promise<ApplyState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const aid = String(f.get("aid"));
  const respuestas: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("campo_")) respuestas[k.slice(6)] = String(v).trim();
  const payload = {
    nombre: String(f.get("nombre") ?? ""),
    telefono: String(f.get("telefono") ?? ""),
    fecha_nacimiento: String(f.get("fecha_nacimiento") ?? ""),
    slot_id: String(f.get("slot_id") ?? ""),
    roles: f.getAll("roles").map(String),
    respuestas,
    foto_path: String(f.get("foto_path") ?? ""),
    tutor_nombre: String(f.get("tutor_nombre") ?? ""),
    tutor_telefono: String(f.get("tutor_telefono") ?? ""),
    tutor_email: String(f.get("tutor_email") ?? ""),
    consentimiento_datos: f.get("consentimiento_datos") === "on",
    consentimiento_tutor: f.get("consentimiento_tutor") === "on",
    consentimiento_imagen: f.get("consentimiento_imagen") === "on",
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_apply", { aid, p: payload });
  if (error) return { ok: false, message: mensajeError(error) };
  // 0135: su perfil (tesitura, canto, baile, habilidades) va aparte, en su propia solicitud.
  if (f.get("perfil") === "1") {
    const { data: app } = await supabase.from("audition_applications").select("id").eq("audition_id", aid).eq("user_id", session.userId).maybeSingle();
    if (app) {
      const extra = String(f.get("perfil_otra") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      await supabase.rpc("audition_perfil_guardar", {
        p_app: app.id, p_tesitura: String(f.get("perfil_tesitura") ?? ""), p_canto: String(f.get("perfil_canto") ?? ""),
        p_baile: String(f.get("perfil_baile") ?? ""), p_genero: String(f.get("perfil_genero") ?? ""),
        p_habilidades: [...f.getAll("perfil_habilidad").map(String), ...extra],
      });
    }
  }
  revalidatePath(`/audiciones/${aid}`);
  revalidatePath("/cuenta");
  return { ok: true, message: "¡Listo! Tu inscripción quedó guardada. Tu QR para el día de la audición está arriba y en Mi cuenta. Si tienes dudas, ahí mismo está nuestro WhatsApp." };
}

export async function cancelMyApplication(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string } | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_cancel_mine", { app: String(f.get("app")) });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/audiciones/${String(f.get("aid"))}`);
  revalidatePath("/cuenta");
  return { ok: true, message: "Inscripción cancelada." };
}
