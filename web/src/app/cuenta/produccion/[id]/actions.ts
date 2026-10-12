"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Portal del integrante: avisar que no podrá ir a un ensayo (0043). La producción decide
// si la falta queda justificada.

export type AbsState = { ok: boolean; message: string } | null;

export async function sendAbsence(_p: AbsState, f: FormData): Promise<AbsState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  const motivo = String(f.get("motivo") ?? "").trim();
  if (!motivo) return { ok: false, message: "Escribe el motivo." };
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsal_absences").upsert(
    { rehearsal_id: String(f.get("rid")), user_id: session.userId, motivo, created_at: new Date().toISOString() },
    { onConflict: "rehearsal_id,user_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/cuenta/produccion/${String(f.get("pid"))}`);
  return { ok: true, message: "Aviso enviado a la producción." };
}

/** Marcar un comunicado como leído (la base revisa que sea para mí). */
export async function markRead(f: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const supabase = await createClient();
  await supabase.from("announcement_reads").upsert(
    { announcement_id: String(f.get("aid")), user_id: session.userId },
    { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
  );
  revalidatePath(`/cuenta/produccion/${String(f.get("pid"))}`);
  revalidatePath("/cuenta");
}
