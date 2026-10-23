"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

type State = { ok: boolean; message: string } | null;

// 0125: marcar (o deshacer) una entrega desde la lista, sin escanear el boleto. La base revisa el permiso.
export async function marcarEntrega(_p: State, f: FormData): Promise<State> {
  const pid = String(f.get("pid"));
  const entregado = f.get("entregado") === "1";
  const nota = String(f.get("nota") ?? "").trim();
  if (nota.length > 200) return { ok: false, message: "La nota es de máximo 200 caracteres." };
  const { error } = await (await createClient()).rpc("beneficio_entregar_boleto", {
    p_ticket: String(f.get("ticket")), p_beneficio: String(f.get("beneficio")), p_entregado: entregado, p_nota: nota || null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath("/panel");
  return { ok: true, message: entregado ? "Marcado como entregado." : "Entrega deshecha." };
}
