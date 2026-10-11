"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Expedientes y mensualidades desde el panel (0041). La base revisa expedientes.ver y
// mensualidades.gestionar en la obra.

export type ExpState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const base = (pid: string) => `/panel/producciones/${pid}/expedientes`;
const ok = (pid: string, uid: string | null, message: string): ExpState => {
  revalidatePath(base(pid), "layout");
  if (uid) revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message };
};

export async function addDocType(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { count } = await supabase.from("member_doc_types").select("id", { count: "exact", head: true }).eq("production_id", pid);
  const { error } = await supabase.from("member_doc_types").insert({
    production_id: pid, nombre: str(f, "nombre"), solo_menores: f.get("solo_menores") === "on", obligatorio: f.get("opcional") !== "on", orden: (count ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  return ok(pid, null, "Documento agregado a la lista.");
}

export async function addBasicDocs(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.from("member_doc_types").insert([
    { production_id: pid, nombre: "Reglamento firmado", solo_menores: false, obligatorio: true, orden: 1 },
    { production_id: pid, nombre: "Permiso de madre, padre o tutor", solo_menores: true, obligatorio: true, orden: 2 },
    { production_id: pid, nombre: "Identificación oficial (INE o acta)", solo_menores: false, obligatorio: false, orden: 3 },
  ]);
  if (error) return { ok: false, message: error.message };
  return ok(pid, null, "Lista básica agregada.");
}

export async function removeDocType(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("member_doc_types").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return ok(pid, null, "Quitado de la lista.");
}

export async function saveFee(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const desde = str(f, "desde"); // "2026-09"
  const hasta = str(f, "hasta");
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) return { ok: false, message: "Elige el primer y el último mes." };
  const supabase = await createClient();
  const { error } = await supabase.from("production_fees").upsert({
    production_id: pid, monto: Number(str(f, "monto") || 0), desde: `${desde}-01`, hasta: `${hasta}-01`, dia_limite: Number(str(f, "dia_limite") || 10),
  });
  if (error) return { ok: false, message: /check/.test(error.message) ? "Revisa los meses: el último debe ser después del primero." : error.message };
  return ok(pid, null, "Mensualidad guardada.");
}

export async function markReviewed(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const uid = str(f, "uid");
  const session = await getSession();
  const supabase = await createClient();
  const revisar = str(f, "revisar") === "si";
  const { error, count } = await supabase.from("member_files")
    .update({ revisado_at: revisar ? new Date().toISOString() : null, revisado_por: revisar ? session?.userId ?? null : null }, { count: "exact" })
    .eq("production_id", pid).eq("user_id", uid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "Primero debe existir el expediente (que lo llene el integrante o llénalo tú)." };
  return ok(pid, uid, revisar ? "Marcado como revisado." : "Vuelve a por revisar.");
}

export async function setDelivered(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const uid = str(f, "uid");
  const session = await getSession();
  const entregado = str(f, "entregado") === "si";
  const supabase = await createClient();
  const { error } = await supabase.from("member_docs").upsert(
    { production_id: pid, user_id: uid, doc_type_id: str(f, "doc"), entregado_at: entregado ? new Date().toISOString() : null, recibido_por: entregado ? session?.userId ?? null : null },
    { onConflict: "doc_type_id,user_id" },
  );
  if (error) return { ok: false, message: error.message };
  return ok(pid, uid, entregado ? "Marcado como entregado." : "Marcado como pendiente.");
}

export async function setScholarship(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const uid = str(f, "uid");
  const especial = str(f, "cuota_especial");
  const supabase = await createClient();
  const { error } = await supabase.from("member_fee_terms").upsert(
    { production_id: pid, user_id: uid, beca: f.get("beca") === "on", cuota_especial: especial ? Number(especial) : null },
    { onConflict: "production_id,user_id" },
  );
  if (error) return { ok: false, message: error.message };
  return ok(pid, uid, "Guardado.");
}

export async function addPayment(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const uid = str(f, "uid");
  const monto = Number(str(f, "monto"));
  if (!(monto > 0)) return { ok: false, message: "Escribe el monto." };
  const supabase = await createClient();
  const { error } = await supabase.from("member_payments").insert({
    production_id: pid, user_id: uid, periodo: str(f, "periodo"), monto, metodo: str(f, "metodo") || "efectivo", nota: str(f, "nota") || null,
  });
  if (error) return { ok: false, message: error.message };
  return ok(pid, uid, "Pago registrado.");
}

export async function removePayment(_p: ExpState, f: FormData): Promise<ExpState> {
  const pid = str(f, "pid");
  const uid = str(f, "uid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("member_payments").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return ok(pid, uid, "Pago quitado.");
}
