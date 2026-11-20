"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { fechasRecurrentes } from "@/lib/rehearsal-rules";
import { horaMx, type Lectura } from "@/lib/acceso-rules";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";

// Ensayos y asistencia (0043). La base revisa ensayos.gestionar en la obra.

export type RehState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/;

/** Equipo de producción citado y encargados del ensayo (0099). */
function equipoDe(f: FormData) {
  const lista = (k: string) => [...new Set(f.getAll(k).map(String).filter((x) => UUID.test(x)))];
  return { equipo: lista("equipo"), equipo_todos: f.get("equipo_todos") === "on", encargados: lista("encargados") };
}

/** Rutas donde se ve la lista de un ensayo (panel y la del encargado en Mi cuenta). */
function refrescar(pid: string, rid: string) {
  revalidatePath(`/panel/producciones/${pid}/ensayos/${rid}`);
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  revalidatePath(`/cuenta/ensayo/${rid}`);
  revalidatePath("/cuenta");
}

/** Crea un ensayo o, con "Repetir", uno por cada día elegido de la semana entre dos fechas. */
export async function createRehearsal(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const fecha = str(f, "fecha");
  if (!localMxToIso(`${fecha}T${str(f, "hora")}`)) return { ok: false, message: "Elige fecha y hora." };
  const fin = str(f, "fin");
  const repetir = f.get("repetir") === "on";
  const dias = f.getAll("dias").map(Number);
  const fechas = repetir ? fechasRecurrentes(fecha, str(f, "hasta"), dias) : [fecha];
  if (repetir && !fechas.length) return { ok: false, message: "Elige los días de la semana y hasta qué fecha se repite." };
  const convocatoria = ["todos", "grupos", "personas", "ninguno"].includes(str(f, "convocatoria")) ? str(f, "convocatoria") : "todos";
  const grupos = f.getAll("grupos").map(String);
  const personas = f.getAll("personas").map(String);
  const { equipo, equipo_todos, encargados } = equipoDe(f);
  if (convocatoria === "grupos" && !grupos.length) return { ok: false, message: "Marca al menos un grupo." };
  if (convocatoria === "personas" && !personas.length) return { ok: false, message: "Marca al menos a una persona." };
  if (convocatoria === "ninguno" && !equipo_todos && !equipo.length) return { ok: false, message: "Si no citas al elenco, marca a alguien del equipo de producción." };
  const serie = repetir ? crypto.randomUUID() : null;
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsals").insert(fechas.map((dia) => ({
    production_id: pid, titulo: str(f, "titulo") || "Ensayo",
    inicia: localMxToIso(`${dia}T${str(f, "hora")}`), termina: fin ? localMxToIso(`${dia}T${fin}`) : null,
    lugar: str(f, "lugar") || null, notas: str(f, "notas") || null, serie_id: serie,
    convocatoria, grupos: convocatoria === "grupos" ? grupos : [], personas: convocatoria === "personas" ? personas : [],
    equipo, equipo_todos, encargados, sin_asistencia: f.get("sin_asistencia") === "on",
  })));
  if (error) return { ok: false, message: /termina/.test(error.message) ? "La hora de fin debe ser después del inicio." : error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  return { ok: true, message: fechas.length > 1 ? `${fechas.length} ensayos agregados. Los citados ya los ven en Mi cuenta.` : "Ensayo agregado. Los citados ya lo ven en Mi cuenta." };
}

export async function setRehearsalEstado(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("rehearsals").update({ estado: str(f, "estado") }, { count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para cambiar este ensayo." };
  revalidatePath(`/panel/producciones/${pid}/ensayos`, "layout");
  return { ok: true, message: str(f, "estado") === "cancelado" ? "Ensayo cancelado (los citados lo ven así)." : "Ensayo reactivado." };
}

/** Marcar asistencia de una persona (presente, retardo con minutos, falta o justificada). La base revisa
 *  quién puede (dirección, maestros, producción o el encargado con el ensayo abierto) y guarda quién marcó. */
export async function markAttendance(pid: string, rid: string, uid: string, estado: string, minutos?: number): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensayo_marcar", { rid, uid, p_estado: estado, p_minutos: estado === "retardo" ? minutos || 1 : null });
  if (error) return { ok: false, message: error.message };
  refrescar(pid, rid);
  return { ok: true };
}

/** El encargado abre el ensayo (el mismo día, desde 1 h antes) y queda presente. */
export async function abrirEnsayo(pid: string, rid: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensayo_abrir", { rid });
  if (error) return { ok: false, message: error.message };
  refrescar(pid, rid);
  return (data as { resultado: string }).resultado === "ya_abierto"
    ? { ok: false, message: "El ensayo ya lo abrió otro encargado. Pídele que escanee tu QR para que puedas pasar lista." }
    : { ok: true, message: "Ensayo abierto. Ya puedes pasar lista." };
}

/** Cerrar lista: quienes no llegaron quedan como falta. */
export async function cerrarLista(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid"), rid = str(f, "rid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensayo_cerrar", { rid });
  if (error) return { ok: false, message: error.message };
  refrescar(pid, rid);
  const n = (data as { faltas: number }).faltas;
  return { ok: true, message: n ? `Lista cerrada: ${n} ${n === 1 ? "falta" : "faltas"}.` : "Lista cerrada: llegaron todos." };
}

export async function reabrirLista(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid"), rid = str(f, "rid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensayo_reabrir", { rid });
  if (error) return { ok: false, message: error.message };
  refrescar(pid, rid);
  return { ok: true, message: "Lista abierta otra vez." };
}

/** Cambiar el equipo citado y los encargados de un ensayo que ya existe. */
export async function setEquipoEnsayo(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid"), rid = str(f, "rid");
  const datos = equipoDe(f);
  const supabase = await createClient();
  const { error, count } = await supabase.from("rehearsals").update(datos, { count: "exact" }).eq("id", rid).eq("production_id", pid);
  if (error) return { ok: false, message: /solo_equipo/.test(error.message) ? "Este ensayo es solo del equipo: deja al menos a una persona del equipo." : error.message };
  if (!count) return { ok: false, message: "No tienes permiso para cambiar este ensayo." };
  refrescar(pid, rid);
  return { ok: true, message: "Guardado." };
}

/** Editar un ensayo: título, fecha y horario, lugar, notas y a quién del elenco se cita. Con "toda_serie", el título,
 *  lugar, notas y citados se copian a los siguientes de la serie (cada uno conserva su fecha). Si es el llamado de una
 *  función y se le cambia la hora, ya no se mueve solo con la función (0127). */
export async function updateRehearsal(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const rid = str(f, "rid");
  const fecha = str(f, "fecha");
  const inicia = localMxToIso(`${fecha}T${str(f, "hora")}`);
  if (!inicia) return { ok: false, message: "Elige fecha y hora." };
  const fin = str(f, "fin");
  const termina = fin ? localMxToIso(`${fecha}T${fin}`) : null;
  if (termina && termina <= inicia) return { ok: false, message: "La hora de fin debe ser después del inicio." };
  const convocatoria = ["todos", "grupos", "personas", "ninguno"].includes(str(f, "convocatoria")) ? str(f, "convocatoria") : "todos";
  const grupos = f.getAll("grupos").map(String);
  const personas = f.getAll("personas").map(String);
  if (convocatoria === "grupos" && !grupos.length) return { ok: false, message: "Marca al menos un grupo." };
  if (convocatoria === "personas" && !personas.length) return { ok: false, message: "Marca al menos a una persona." };
  const comunes = {
    titulo: str(f, "titulo") || "Ensayo", lugar: str(f, "lugar") || null, notas: str(f, "notas") || null,
    convocatoria, grupos: convocatoria === "grupos" ? grupos : [], personas: convocatoria === "personas" ? personas : [],
  };
  const supabase = await createClient();
  const { error, count } = await supabase.from("rehearsals").update({ ...comunes, inicia, termina }, { count: "exact" }).eq("id", rid).eq("production_id", pid);
  if (error) return { ok: false, message: /equipo/.test(error.message) ? "Si no citas al elenco, marca a alguien del equipo (abajo, en Equipo citado)." : mensajeError(error) };
  if (!count) return { ok: false, message: "No se guardó: revisa tus permisos." };
  let extra = 0;
  const serie = str(f, "serie");
  if (f.get("toda_serie") === "on" && serie) {
    const r = await supabase.from("rehearsals").update(comunes, { count: "exact" }).eq("production_id", pid).eq("serie_id", serie).gt("inicia", inicia).neq("id", rid);
    if (r.error) return { ok: false, message: mensajeError(r.error) };
    extra = r.count ?? 0;
  }
  refrescar(pid, rid);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: extra ? `Guardado, también en ${extra} ${extra === 1 ? "ensayo siguiente" : "ensayos siguientes"} de la serie.` : "Guardado. Los citados ya lo ven con los cambios." };
}

/** 0157: "No se toma asistencia" (o volver a tomarla) en este ensayo y, si se pide, en los siguientes de la serie. */
export async function setSinAsistencia(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const rid = str(f, "rid");
  const valor = str(f, "valor") === "1";
  const serie = str(f, "serie");
  const supabase = await createClient();
  let q = supabase.from("rehearsals").update({ sin_asistencia: valor }, { count: "exact" }).eq("production_id", pid);
  q = f.get("toda_serie") === "on" && serie ? q.eq("serie_id", serie).gte("inicia", str(f, "desde")) : q.eq("id", rid);
  const { error, count } = await q;
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No se cambió ningún ensayo: revisa tus permisos." };
  revalidatePath(`/panel/producciones/${pid}/ensayos`, "layout");
  revalidatePath("/cuenta", "layout");
  const n = count === 1 ? "El ensayo" : `${count} ensayos`;
  return { ok: true, message: valor ? `${n} ya no ${count === 1 ? "lleva" : "llevan"} asistencia; ${count === 1 ? "sigue" : "siguen"} en los calendarios.` : `${n} vuelve${count === 1 ? "" : "n"} a tomar asistencia.` };
}

/** Cancela este ensayo y los siguientes de la misma serie (los pasados no se tocan). */
export async function cancelSeries(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("rehearsals").update({ estado: "cancelado" }, { count: "exact" })
    .eq("production_id", pid).eq("serie_id", str(f, "serie")).gte("inicia", str(f, "desde"));
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No se canceló ningún ensayo: revisa tus permisos o que la serie tenga ensayos próximos." };
  revalidatePath(`/panel/producciones/${pid}/ensayos`, "layout");
  return { ok: true, message: `${count} ${count === 1 ? "ensayo de la serie cancelado" : "ensayos de la serie cancelados"}.` };
}

/** Con cuántas horas de anticipación se pide una falta (0070). 0 = hasta que empiece. */
export async function setAvisoHoras(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const horas = Number(str(f, "horas"));
  if (!Number.isInteger(horas) || horas < 0 || horas > 168) return { ok: false, message: "Elige una opción." };
  const supabase = await createClient();
  const { error } = await supabase.from("production_discipline").upsert({ production_id: pid, aviso_falta_horas: horas }, { onConflict: "production_id" });
  if (error) return { ok: false, message: "No se pudo guardar." };
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Guardado." };
}

/** Checar asistencia con el gafete (0078). La base calcula presente o retardo con la tolerancia. */
export type CheckinResult = {
  ok: boolean; message?: string;
  resultado?: "presente" | "retardo" | "ya" | "no_citado" | "no_encontrado";
  nombre?: string; fotoUrl?: string | null; minutos?: number | null; llegada?: string; estado?: string;
};
export async function checkinGafete(pid: string, rid: string, code: string): Promise<CheckinResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rehearsal_checkin", { rid, p_code: code });
  if (error) return { ok: false, message: error.message };
  const r = data as { resultado: CheckinResult["resultado"]; nombre?: string; foto_path?: string | null; minutos?: number | null; llegada?: string; estado?: string };
  const fotoUrl = r.foto_path ? (await supabase.storage.from("avatares").createSignedUrl(r.foto_path, 600)).data?.signedUrl ?? null : null;
  // Sin refrescar aquí (2026-10-25): con el elenco llegando en fila, cada lectura redibujaba la página y la base se
  // saturó. La mesa de entrada (EscanerAcceso) refresca la lista una vez cuando se calma la fila.
  return { ok: true, resultado: r.resultado, nombre: r.nombre, fotoUrl, minutos: r.minutos ?? null, llegada: r.llegada, estado: r.estado };
}

/** Lo mismo, ya listo para mostrarse en la mesa de entrada (EscanerAcceso). */
export async function leerGafete(pid: string, rid: string, code: string): Promise<Lectura> {
  const r = await checkinGafete(pid, rid, code);
  if (!r.ok) return { ok: false, message: r.message };
  const h = horaMx(r.llegada);
  switch (r.resultado) {
    case "presente": return { ok: true, tono: "ok", titulo: `Presente · ${h}`, nombre: r.nombre, fotoUrl: r.fotoUrl, llegada: `a tiempo · ${h}` };
    case "retardo": return { ok: true, tono: "aviso", titulo: `Retardo · ${r.minutos ?? 0} min`, nombre: r.nombre, fotoUrl: r.fotoUrl, llegada: `${r.minutos ?? 0} min tarde · ${h}` };
    case "ya": return { ok: true, tono: "neutro", titulo: `Ya registrado a las ${h}`, nombre: r.nombre, fotoUrl: r.fotoUrl };
    case "no_citado": return { ok: true, tono: "error", titulo: "No está citado a este ensayo", nombre: r.nombre, fotoUrl: r.fotoUrl };
    default: return { ok: true, tono: "error", titulo: "Gafete no encontrado", detalle: "Revisa el código o pide a la persona que abra su gafete en Mi cuenta." };
  }
}
