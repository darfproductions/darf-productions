"use server";

import { createClient } from "@/lib/supabase/server";

export type ContactState = { ok: boolean; message: string } | null;

// Guarda el mensaje en contact_messages (la regla RLS permite insertar a cualquiera;
// solo staff puede leerlos). Mismo destino que el formulario de la 1.0.
export async function sendContact(_prev: ContactState, form: FormData): Promise<ContactState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const nombre = get("nombre");
  const correo = get("correo");
  const mensaje = get("mensaje");
  if (!nombre || !correo || !mensaje) return { ok: false, message: "Escribe tu nombre, correo y mensaje." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, message: "Revisa tu correo." };
  if (mensaje.length > 4000) return { ok: false, message: "El mensaje es demasiado largo." };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({
    nombre,
    correo,
    telefono: get("telefono") || null,
    asunto: get("asunto") || null,
    mensaje,
  });
  if (error) return { ok: false, message: "No se pudo enviar. Intenta de nuevo en un momento." };
  return { ok: true, message: "¡Gracias! Recibimos tu mensaje y te responderemos pronto." };
}
