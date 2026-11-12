"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PASSWORD_AYUDA, emailOk, fechaNacimientoOk, passwordOk } from "@/lib/account-rules";
import { errorAuthComun, tokenCaptcha } from "@/lib/captcha";
import { origenSitio } from "@/lib/site-origin";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { olvidarAcceso } from "@/lib/permissions";

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
  const check = await supabase.auth.signInWithPassword({ email: session.email, password: actual, options: { captchaToken: tokenCaptcha(form) } });
  if (check.error) return { ok: false, message: errorAuthComun(check.error.message) ?? "Tu contraseña actual no es correcta." };
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
  if (error) return { ok: false, message: mensajeError(error) };
  const s = await getSession();
  if (s) olvidarAcceso(s.userId);
  revalidatePath("/cuenta");
  return { ok: true, message: acepta ? "¡Bienvenido al elenco! Ya apareces en la obra." : "Respuesta enviada. Gracias por avisar." };
}

/** El comprador cancela su propio apartado (0088). Solo órdenes pendientes. */
export async function cancelMyOrder(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { target_order_id: String(f.get("order") ?? "") });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/cuenta");
  return { ok: true, message: "Listo: cancelaste tu apartado y los lugares quedaron libres." };
}

// ──────── Pasar boletos a otra persona (0142) ────────
export type TraspasoState = { ok: boolean; message: string; token?: string } | null;

/** El comprador pasa boletos de su orden a un correo. La base valida (orden pagada, función por venir, boletos sin usar). */
export async function crearTraspaso(_p: TraspasoState, f: FormData): Promise<TraspasoState> {
  const order = String(f.get("order") ?? "");
  const tickets = f.getAll("ticket").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const email = String(f.get("email") ?? "").trim();
  const mensaje = String(f.get("mensaje") ?? "").trim().slice(0, 300) || null;
  if (!tickets.length) return { ok: false, message: "Elige al menos un boleto." };
  if (!email) return { ok: false, message: "Escribe el correo de la persona." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ticket_transfer_create", { p_order: order, p_tickets: tickets, p_email: email, p_mensaje: mensaje });
  if (error) return { ok: false, message: mensajeError(error) };
  const r = data as { token: string; con_cuenta: boolean; boletos: number };
  revalidatePath("/cuenta");
  return { ok: true, token: r.token, message: r.con_cuenta ? "Listo. Ya le avisamos en su cuenta; también puedes mandarle la liga." : "Listo. Esa persona todavía no tiene cuenta en DARF: mándale la liga y la acepta al entrar." };
}

export async function cancelarTraspaso(_p: TraspasoState, f: FormData): Promise<TraspasoState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ticket_transfer_cancel", { p_id: String(f.get("id") ?? "") });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/cuenta");
  return { ok: true, message: "Traspaso cancelado: los boletos siguen contigo." };
}

/** Quien recibe acepta con la liga: los boletos pasan a una orden a su nombre. */
export async function aceptarTraspaso(_p: TraspasoState, f: FormData): Promise<TraspasoState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ticket_transfer_accept", { p_token: String(f.get("token") ?? "") });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/cuenta");
  const { data: o } = await supabase.from("orders").select("order_code").eq("id", data as string).maybeSingle();
  redirect(`/cuenta?orden=${encodeURIComponent((o?.order_code as string) ?? "")}#o-${(o?.order_code as string) ?? ""}`);
}
