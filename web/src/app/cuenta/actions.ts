"use server";

import { revalidatePath } from "next/cache";
import { PASSWORD_AYUDA, emailOk, fechaNacimientoOk, passwordOk } from "@/lib/account-rules";
import { origenSitio } from "@/lib/site-origin";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { ok: boolean; message: string } | null;

// Mi cuenta (0051). Cada quien edita solo su fila (RLS de dueño); el rol no se puede
// cambiar desde aquí: lo impide la base.
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const nombres = String(form.get("nombres") ?? "").trim();
  const apellidos = String(form.get("apellidos") ?? "").trim();
  const telefono = String(form.get("telefono") ?? "").trim();
  const fecha = String(form.get("fecha_nacimiento") ?? "").trim();
  if (!nombres) return { ok: false, message: "Escribe tu nombre." };
  if (fecha && !fechaNacimientoOk(fecha)) return { ok: false, message: "Revisa tu fecha de nacimiento." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombres, apellidos: apellidos || null, telefono: telefono || null, fecha_nacimiento: fecha || null })
    .eq("id", session.userId);
  if (error) return { ok: false, message: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/cuenta");
  return { ok: true, message: "Perfil guardado." };
}

/** Cambio de correo: Supabase manda un enlace de confirmación; hasta abrirlo sigue el correo actual. */
export async function changeEmail(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { ok: false, message: "Escribe un correo válido." };
  if (email === session.email.toLowerCase()) return { ok: false, message: "Ese ya es tu correo." };
  const origin = await origenSitio();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${origin}/auth/callback?next=/cuenta` });
  if (error) return { ok: false, message: "No se pudo cambiar el correo. Puede que ya tenga cuenta o que debas esperar unos minutos." };
  return { ok: true, message: `Te enviamos un enlace a ${email} (y un aviso a tu correo actual). Ábrelo para confirmar el cambio.` };
}

/** Cambio de contraseña: primero se comprueba la actual. */
export async function changePassword(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const actual = String(form.get("actual") ?? "");
  const nueva = String(form.get("nueva") ?? "");
  if (nueva !== String(form.get("confirmar") ?? "")) return { ok: false, message: "Las contraseñas nuevas no coinciden." };
  if (nueva === actual) return { ok: false, message: "La contraseña nueva debe ser distinta a la actual." };
  if (!passwordOk(nueva, session.email)) return { ok: false, message: `Esa contraseña no sirve. ${PASSWORD_AYUDA}` };
  const supabase = await createClient();
  const check = await supabase.auth.signInWithPassword({ email: session.email, password: actual });
  if (check.error) return { ok: false, message: "Tu contraseña actual no es correcta." };
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { ok: false, message: "No se pudo cambiar. Usa una contraseña distinta a la actual." };
  // Si alguien más tenía tu sesión abierta en otro aparato, se cierra.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Contraseña cambiada. Cerramos tu sesión en los demás dispositivos." };
}

/** Guarda la ruta de la foto ya subida (bucket privado avatares, carpeta propia) y borra la anterior. */
export async function setAvatar(path: string | null): Promise<{ ok: boolean; message: string }> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  if (path && !path.startsWith(`${session.userId}/`)) return { ok: false, message: "Ruta no válida." };
  const supabase = await createClient();
  const old = session.profile?.foto_path;
  const { error } = await supabase.from("profiles").update({ foto_path: path }).eq("id", session.userId);
  if (error) return { ok: false, message: "No se pudo guardar la foto." };
  if (old && old !== path) await supabase.storage.from("avatares").remove([old]);
  revalidatePath("/cuenta");
  return { ok: true, message: path ? "Foto guardada." : "Foto quitada." };
}

export type OfferReply = { ok: boolean; message: string } | null;

/** Aceptar o declinar una oferta de papel (0040). La base revisa que sea mía y siga vigente. */
export async function replyOffer(_prev: OfferReply, form: FormData): Promise<OfferReply> {
  const acepta = String(form.get("respuesta")) === "aceptar";
  const supabase = await createClient();
  const { error } = await supabase.rpc("casting_offer_respond", { oid: String(form.get("id")), acepta });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/cuenta");
  return { ok: true, message: acepta ? "¡Bienvenido al elenco! Ya apareces en la obra." : "Respuesta enviada. Gracias por avisar." };
}

/** El comprador cancela su propio apartado (0088). Solo órdenes pendientes. */
export async function cancelMyOrder(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { target_order_id: String(f.get("order") ?? "") });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/cuenta");
  return { ok: true, message: "Listo: cancelaste tu apartado y los lugares quedaron libres." };
}
