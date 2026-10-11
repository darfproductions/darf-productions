"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Acciones del expediente que usan tanto el integrante (Mi cuenta) como la producción
// (panel). La base decide: cada quien lo suyo; la producción, con expedientes.ver.

export type FileState = { ok: boolean; message: string } | null;

const TEXTOS = ["fecha_nacimiento", "telefono", "emergencia_nombre", "emergencia_telefono", "emergencia_parentesco", "tutor_nombre",
  "tutor_telefono", "tutor_email", "alergias", "condiciones", "medicamentos", "tipo_sangre", "talla_ropa", "talla_calzado"] as const;
const MEDIDAS = ["altura_cm", "pecho_cm", "cintura_cm", "cadera_cm"] as const;

const refresh = (pid: string, uid: string) => {
  revalidatePath(`/cuenta/produccion/${pid}`);
  revalidatePath(`/panel/producciones/${pid}/expedientes`, "layout");
  void uid;
};

export async function saveMemberFile(_p: FileState, f: FormData): Promise<FileState> {
  const pid = String(f.get("pid"));
  const uid = String(f.get("uid"));
  const row: Record<string, unknown> = { production_id: pid, user_id: uid };
  for (const k of TEXTOS) row[k] = String(f.get(k) ?? "").trim() || null;
  for (const k of MEDIDAS) {
    const v = String(f.get(k) ?? "").trim();
    row[k] = v ? Number(v) : null;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("member_files").upsert(row, { onConflict: "production_id,user_id" });
  if (error) return { ok: false, message: /check/.test(error.message) ? "Revisa las medidas (en centímetros)." : error.message };
  refresh(pid, uid);
  return { ok: true, message: "Expediente guardado." };
}

/** Guarda el archivo ya subido al almacenamiento privado como el documento de esa persona. */
export async function saveDocFile(pid: string, uid: string, docTypeId: string, path: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("member_docs").upsert(
    { production_id: pid, user_id: uid, doc_type_id: docTypeId, archivo_path: path, subido_at: new Date().toISOString() },
    { onConflict: "doc_type_id,user_id" },
  );
  if (error) return { ok: false, message: error.message };
  refresh(pid, uid);
  return { ok: true };
}
