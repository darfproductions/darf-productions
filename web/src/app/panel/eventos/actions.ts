"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Eventos de DARF (0081). La base revisa quién puede: fanzone.editar de la obra o, sin obra, el Director.

type State = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refrescar(pid: string | null) {
  revalidatePath("/panel/eventos");
  revalidatePath("/eventos");
  revalidatePath("/fan-zone", "layout");
  if (pid) { revalidatePath(`/panel/producciones/${pid}/fanzone`); revalidatePath(`/panel/producciones/${pid}/puerta`); }
}

export async function crearEvento(_p: State, f: FormData): Promise<State> {
  const tipo = str(f, "tipo");
  if (!["funcion", "presencial", "en_linea"].includes(tipo)) return { ok: false, message: "Elige el tipo de evento." };
  const acceso = ["club", "cuenta", "publico"].includes(str(f, "acceso")) ? str(f, "acceso") : "club";
  const cupoTxt = str(f, "cupo");
  const cupo = cupoTxt ? Number(cupoTxt) : null;
  if (cupo !== null && (!Number.isInteger(cupo) || cupo < 1 || cupo > 5000)) return { ok: false, message: "El cupo va de 1 a 5000 (o déjalo vacío: sin límite)." };
  const registro = f.get("registro") === "on";
  if (registro && cupo === null && tipo !== "en_linea") return { ok: false, message: "Con registro, pon el cupo." };
  const supabase = await createClient();
  const fila: Record<string, unknown> = {
    tipo, acceso, cupo, requiere_registro: registro,
    categoria: str(f, "categoria").slice(0, 60) || null,
    titulo: str(f, "titulo").slice(0, 120) || null,
    descripcion: str(f, "descripcion").slice(0, 600) || null,
    notas: str(f, "notas").slice(0, 300) || null,
  };
  let pid: string | null = null;
  if (tipo === "funcion") {
    const { data: pf } = await supabase.from("performances").select("id, production_id").eq("id", str(f, "performance")).maybeSingle();
    if (!pf) return { ok: false, message: "Elige la función." };
    if (!fila.categoria && !fila.titulo) return { ok: false, message: "Escribe qué es (por ejemplo, Foto con el elenco)." };
    pid = pf.production_id as string;
    Object.assign(fila, { production_id: pid, performance_id: pf.id, requiere_boleto: f.get("boleto") === "on" });
  } else {
    pid = str(f, "obra") || null;
    const inicia = localMxToIso(str(f, "inicia"));
    const termina = str(f, "termina") ? localMxToIso(str(f, "termina")) : null;
    if (!fila.titulo) return { ok: false, message: "Escribe el nombre del evento." };
    if (!inicia) return { ok: false, message: "Elige la fecha y hora." };
    if (termina && termina <= inicia) return { ok: false, message: "La hora de fin debe ser después del inicio." };
    Object.assign(fila, { production_id: pid, performance_id: null, inicia, termina, requiere_boleto: false });
    if (tipo === "presencial") fila.lugar = str(f, "lugar").slice(0, 160) || null;
    if (tipo === "en_linea") {
      const liga = str(f, "liga");
      if (!/^https:\/\/\S+$/.test(liga)) return { ok: false, message: "La liga debe empezar con https://" };
      fila.liga = liga.slice(0, 500);
    }
  }
  const { error } = await supabase.from("fan_encuentros").insert(fila);
  if (error) return { ok: false, message: error.code === "42501" ? "No tienes permiso para crear eventos ahí." : error.message };
  refrescar(pid);
  return { ok: true, message: "Evento publicado. Se avisó a los socios del Club Fan." };
}

export async function setEvento(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid") || null;
  const supabase = await createClient();
  const id = str(f, "id");
  const q = str(f, "accion") === "borrar"
    ? supabase.from("fan_encuentros").delete({ count: "exact" }).eq("id", id)
    : supabase.from("fan_encuentros").update({ abierto: str(f, "accion") === "abrir" }, { count: "exact" }).eq("id", id);
  const { error, count } = await q;
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  refrescar(pid);
  return { ok: true, message: "Listo." };
}

/** Llegada a mano (para quien no trae credencial del club). */
export async function marcarLlegada(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("evento_marcar", { eid: str(f, "id"), uid: str(f, "uid"), p_on: str(f, "on") === "1" });
  if (error) return { ok: false, message: error.message };
  refrescar(str(f, "pid") || null);
  return { ok: true, message: "Listo." };
}
