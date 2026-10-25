"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { mensajeError } from "@/lib/errores";
import { olvidarAcceso } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

type State = { ok: boolean; message: string } | null;

// Aceptar la invitación al equipo (0094): la base revisa que el correo sea el invitado y esté confirmado.
export async function aceptarInvitacion(_p: State, f: FormData): Promise<State> {
  const token = String(f.get("token") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_accept", { p_token: token });
  if (error) return { ok: false, message: mensajeError(error) };
  const s = await getSession();
  if (s) olvidarAcceso(s.userId);
  redirect(`/panel/producciones/${encodeURIComponent(String(data))}/guia`);
}
