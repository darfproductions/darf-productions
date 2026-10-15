"use server";

import { correoDeCampo } from "@/lib/cuentas";
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
  // Costo (0083): vacío = gratis. Con costo siempre se pide registro (para tener a quién cobrarle).
  const dinero = (k: string) => (str(f, k) ? Math.round(Number(str(f, k)) * 100) / 100 : null);
  const precio = dinero("precio"), precioSocio = dinero("precio_socio");
  if (precio !== null && (!Number.isFinite(precio) || precio <= 0 || precio > 100000)) return { ok: false, message: "El precio va de $1 a $100,000 (o déjalo vacío: gratis)." };
  if (precioSocio !== null && (precio === null || !Number.isFinite(precioSocio) || precioSocio < 0 || precioSocio > precio)) {
    return { ok: false, message: precio === null ? "Para poner precio de socios, pon primero el precio." : "El precio para socios debe ser menor o igual al precio." };
  }
  const registro = f.get("registro") === "on" || precio !== null;
  const supabase = await createClient();
  const fila: Record<string, unknown> = {
    tipo, acceso, cupo, requiere_registro: registro, precio, precio_socio: precioSocio,
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
  return { ok: true, message: acceso === "club" ? "Evento publicado. Se avisó a los socios del Club Fan." : "Evento publicado." };
}

export async function setEvento(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid") || null;
  const supabase = await createClient();
  const id = str(f, "id");
  if (str(f, "accion") !== "borrar") {
    // Abrir o cerrar el registro: quien edita el evento o quien lo organiza (0084).
    const { error } = await supabase.rpc("evento_abrir", { eid: id, p_on: str(f, "accion") === "abrir" });
    if (error) return { ok: false, message: error.message };
    refrescar(pid);
    return { ok: true, message: "Listo." };
  }
  const { error, count } = await supabase.from("fan_encuentros").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  refrescar(pid);
  return { ok: true, message: "Listo." };
}

/** Editar un evento (0088): fecha, lugar, liga, cupo, precio y notas. Quien ya pagó conserva su monto. */
export async function editarEvento(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid") || null;
  const tipo = str(f, "tipo");
  const p: Record<string, string> = {};
  if (f.has("titulo")) {
    if (tipo !== "funcion" && !str(f, "titulo")) return { ok: false, message: "Escribe el nombre del evento." };
    p.titulo = str(f, "titulo");
  }
  if (tipo !== "funcion") {
    const inicia = localMxToIso(str(f, "inicia"));
    const termina = str(f, "termina") ? localMxToIso(str(f, "termina")) : null;
    if (!inicia) return { ok: false, message: "Elige la fecha y hora." };
    if (termina && termina <= inicia) return { ok: false, message: "La hora de fin debe ser después del inicio." };
    p.inicia = inicia;
    p.termina = termina ?? "";
  }
  if (tipo === "presencial") p.lugar = str(f, "lugar");
  if (tipo === "en_linea") {
    if (!/^https:\/\/\S+$/.test(str(f, "liga"))) return { ok: false, message: "La liga debe empezar con https://" };
    p.liga = str(f, "liga");
  }
  const cupo = str(f, "cupo");
  if (cupo && (!/^\d+$/.test(cupo) || Number(cupo) < 1 || Number(cupo) > 5000)) return { ok: false, message: "El cupo va de 1 a 5000 (o déjalo vacío: sin límite)." };
  p.cupo = cupo;
  const precio = str(f, "precio"), precioSocio = str(f, "precio_socio");
  if (precio && !(Number(precio) > 0 && Number(precio) <= 100000)) return { ok: false, message: "El precio va de $1 a $100,000 (o déjalo vacío: gratis)." };
  if (precioSocio && (!precio || !(Number(precioSocio) >= 0 && Number(precioSocio) <= Number(precio)))) {
    return { ok: false, message: precio ? "El precio para socios debe ser menor o igual al precio." : "Para poner precio de socios, pon primero el precio." };
  }
  p.precio = precio;
  p.precio_socio = precioSocio;
  p.notas = str(f, "notas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("evento_editar", { eid: str(f, "id"), p });
  if (error) return { ok: false, message: error.message };
  refrescar(pid);
  return { ok: true, message: "Evento actualizado." };
}

/** Cancelar un evento (0088): se cierra, se avisa a los registrados y los pagos quedan para reembolso. */
export async function cancelarEvento(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid") || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evento_cancelar", { eid: str(f, "id"), p_motivo: str(f, "motivo").slice(0, 300) || null });
  if (error) return { ok: false, message: error.message };
  refrescar(pid);
  const r = (data ?? {}) as { avisados?: number; por_reembolsar?: number };
  const reembolsos = r.por_reembolsar ? ` ${r.por_reembolsar} ${r.por_reembolsar === 1 ? "persona ya había pagado" : "personas ya habían pagado"}: hay que reembolsarles.` : "";
  return { ok: true, message: `Evento cancelado. Avisamos a ${(r.avisados ?? 0) + (r.por_reembolsar ?? 0)} personas.${reembolsos}` };
}

/** Aprobar o rechazar el pago de un evento (0083). Rechazar libera el lugar. */
export async function revisarPagoEvento(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const aprobar = str(f, "aprobar") === "1";
  const { error } = await supabase.rpc("evento_orden_revisar", { oid: str(f, "orden"), p_aprobar: aprobar });
  if (error) return { ok: false, message: error.message };
  refrescar(str(f, "pid") || null);
  revalidatePath("/cuenta/eventos");
  return { ok: true, message: aprobar ? "Pago aprobado. Se le avisó." : "Apartado rechazado y lugar liberado." };
}

/** Llegada a mano (para quien no trae credencial del club). */
export async function marcarLlegada(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("evento_marcar", { eid: str(f, "id"), uid: str(f, "uid"), p_on: str(f, "on") === "1" });
  if (error) return { ok: false, message: error.message };
  refrescar(str(f, "pid") || null);
  return { ok: true, message: "Listo." };
}

/** Equipo propio del evento (0084): agregar o cambiar el papel de alguien por su correo. */
export async function ponerEquipoEvento(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const email = await correoDeCampo(supabase, str(f, "email"));
  const { error } = await supabase.rpc("evento_equipo_poner", { eid: str(f, "id"), p_email: email, p_papel: str(f, "papel") });
  if (error) return { ok: false, message: error.message };
  refrescar(str(f, "pid") || null);
  return { ok: true, message: "Listo: se le avisó y ya lo ve en su panel." };
}

export async function quitarEquipoEvento(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("evento_equipo_quitar", { eid: str(f, "id"), uid: str(f, "uid") });
  if (error) return { ok: false, message: error.message };
  refrescar(str(f, "pid") || null);
  return { ok: true, message: "Quitado del equipo." };
}
