"use server";

import { revalidatePath } from "next/cache";
import { montoValido } from "@/lib/request-rules";
import { createClient } from "@/lib/supabase/server";

// Revisar solicitudes del elenco (0070). La base decide quién puede revisar cada tipo y hace
// el resto al aprobar (justificar la falta, registrar el pago o marcar el documento).

export type ReviewState = { ok: boolean; message: string } | null;

export async function reviewRequest(_p: ReviewState, f: FormData): Promise<ReviewState> {
  const pid = String(f.get("pid"));
  const aprobar = String(f.get("decision")) === "aprobar";
  const respuesta = String(f.get("respuesta") ?? "").trim().slice(0, 1000);
  if (!aprobar && !respuesta) return { ok: false, message: "Escribe por qué se rechaza; el integrante lo verá." };
  let monto: number | null = null;
  if (aprobar && f.get("monto") !== null) {
    monto = montoValido(String(f.get("monto")));
    if (!monto) return { ok: false, message: "Revisa el monto a registrar." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_review", { p_id: String(f.get("id")), p_aprobar: aprobar, p_respuesta: respuesta || null, p_monto: monto });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "No se pudo guardar. Intenta de nuevo." };
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: aprobar ? "Aprobada." : "Rechazada." };
}
