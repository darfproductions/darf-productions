"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { llegadaIso, montoValido, periodoDeMes } from "@/lib/request-rules";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";

// Portal del integrante: solicitudes (0070). La base valida todo (límite de la falta,
// citado, archivo propio) y avisa a quien revisa.

export type ReqState = { ok: boolean; message: string } | null;

// Los mensajes de las funciones (P0001) ya vienen en español claro; lo demás es genérico.
const errorClaro = (e: { code?: string; message: string }) =>
  e.code === "P0001" ? e.message : "No se pudo enviar. Intenta de nuevo en un momento.";

export async function requestAbsence(_p: ReqState, f: FormData): Promise<ReqState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const pid = String(f.get("pid"));
  const ensayos = f.getAll("ensayo").map(String).filter(Boolean);
  const motivo = String(f.get("motivo") ?? "").trim().slice(0, 1000);
  if (!ensayos.length) return { ok: false, message: "Elige el ensayo (o los ensayos) a los que vas a faltar." };
  if (!motivo) return { ok: false, message: "Escribe la razón." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_absence", { pid, rehearsal_ids: ensayos, p_motivo: motivo });
  if (error) return { ok: false, message: errorClaro(error) };
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Solicitud enviada. Te avisamos cuando la revisen." };
}

// 0126: llegada tarde a un ensayo (hasta que empieza). La base valida la hora y que no haya otra solicitud.
export async function requestLate(_p: ReqState, f: FormData): Promise<ReqState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const pid = String(f.get("pid"));
  const ensayo = String(f.get("ensayo") ?? "");
  const inicia = String(f.get("inicia_" + ensayo) ?? "");
  const motivo = String(f.get("motivo") ?? "").trim().slice(0, 1000);
  if (!ensayo || !inicia) return { ok: false, message: "Elige el ensayo al que llegarás tarde." };
  const hora = llegadaIso(inicia, String(f.get("hora") ?? ""));
  if (!hora) return { ok: false, message: "Escribe a qué hora vas a llegar." };
  if (!motivo) return { ok: false, message: "Escribe la razón." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_late", { pid, rid: ensayo, p_hora: hora, p_motivo: motivo });
  if (error) return { ok: false, message: errorClaro(error) };
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Solicitud enviada. Te avisamos cuando la revisen." };
}

export async function submitRequest(_p: ReqState, f: FormData): Promise<ReqState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const pid = String(f.get("pid"));
  const tipo = String(f.get("tipo"));
  if (!["documento", "pago", "otro"].includes(tipo)) return { ok: false, message: "Elige qué quieres enviar." };
  const txt = (k: string) => String(f.get(k) ?? "").trim() || null;
  const archivo = txt("archivo");
  const docType = txt("doc_type");
  const motivo = txt("motivo")?.slice(0, 1000) ?? null;
  let periodo: string | null = null;
  let monto: number | null = null;
  if (tipo === "documento") {
    if (!archivo) return { ok: false, message: "Sube el archivo del documento." };
    if (!docType && !txt("doc_nombre")) return { ok: false, message: "Escribe el nombre del documento." };
  } else if (tipo === "pago") {
    if (!archivo) return { ok: false, message: "Sube tu comprobante." };
    monto = montoValido(String(f.get("monto") ?? ""));
    if (!monto) return { ok: false, message: "Escribe el monto que pagaste." };
    if (txt("concepto") === "mensualidad") {
      periodo = periodoDeMes(String(f.get("mes") ?? ""));
      if (!periodo) return { ok: false, message: "Elige el mes que pagaste." };
    }
  } else if (!motivo) {
    return { ok: false, message: "Escribe tu solicitud." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_submit", {
    pid, p_tipo: tipo, p_motivo: motivo, p_archivo: archivo,
    p_doc_type: tipo === "documento" ? docType : null,
    p_doc_nombre: tipo === "documento" && !docType ? txt("doc_nombre")?.slice(0, 80) ?? null : null,
    p_concepto: tipo === "pago" ? txt("concepto") : null, p_periodo: periodo, p_monto: monto,
    p_metodo: tipo === "pago" ? txt("metodo") : null,
  });
  if (error) return { ok: false, message: errorClaro(error) };
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Solicitud enviada. Te avisamos cuando la revisen." };
}

/** Cancelar mi solicitud mientras sigue pendiente. */
export async function cancelRequest(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string } | null> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión terminó. Vuelve a entrar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_cancel", { p_id: String(f.get("id")) });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/cuenta/produccion/${String(f.get("pid"))}`);
  return { ok: true, message: "Solicitud cancelada." };
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
