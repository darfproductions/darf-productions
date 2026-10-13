"use server";

import { createClient } from "@/lib/supabase/server";

// Suscripciones push de la persona con sesión (la base revisa todo: 0067).
type State = { ok: boolean; message: string };

export async function savePushSubscription(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }, ua: string): Promise<State> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, message: "Suscripción inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_subscribe", { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_ua: ua.slice(0, 300) });
  if (error) return { ok: false, message: "No se pudo guardar este teléfono." };
  return { ok: true, message: "Listo: este teléfono recibirá tus notificaciones." };
}

export async function removePushSubscription(endpoint: string): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, message: "No se pudo apagar." };
  return { ok: true, message: "Notificaciones apagadas en este teléfono." };
}

export async function sendPushTest(): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_test");
  if (error) return { ok: false, message: /Intenta en una hora/.test(error.message) ? error.message : "No se pudo mandar la prueba." };
  return { ok: true, message: "Enviada: debe llegar en unos segundos." };
}

export async function savePushPrefs(apagados: string[]): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_set_off", { p_tipos: apagados });
  if (error) return { ok: false, message: "No se pudo guardar." };
  return { ok: true, message: "Preferencias guardadas." };
}
