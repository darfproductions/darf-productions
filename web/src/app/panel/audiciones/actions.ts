"use server";

import { PREGUNTAS_PERFIL, type FichaAudicion, type PerfilAspirante } from "@/lib/produccion-nueva-rules";

import { correoDeCampo } from "@/lib/cuentas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criteriosFromText } from "@/lib/audition-rules";
import { EN_BLANCO, PLANTILLAS, REGISTRO_PERMANENTE, type Plantilla } from "@/lib/audition-templates";
import { getSession } from "@/lib/auth";
import { localMxToIso } from "@/lib/dates";
import { sugerirGrupos, type OrdenFila } from "@/lib/audicion-vivo-rules";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";
import { refrescarPublico } from "@/lib/supabase/publico";

// Audiciones en el panel (0036, 0037). La base decide qué puede cada quien:
// gestionar (dirección), registro (mesa) y evaluar (jueces), por obra o por el
// equipo propio de la convocatoria. Las generales las crea el Director.

export type AudState = { ok: boolean; message: string } | null;

const base = (aid: string) => `/panel/audiciones/${aid}`;
const done = (aid: string, message: string): AudState => {
  revalidatePath(base(aid), "layout");
  revalidatePath(`/audiciones/${aid}`);
  refrescarPublico();
  revalidatePath("/audiciones");
  return { ok: true, message };
};
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() ? Number(v) : null);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Crea la convocatoria desde una plantilla (de DARF, en blanco o una guardada) con sus preguntas. */
export async function createAudition(_p: AudState, f: FormData): Promise<AudState> {
  const pid = str(f, "pid") || null;
  const titulo = str(f, "titulo");
  if (!titulo) return { ok: false, message: "Escribe un título para la convocatoria." };
  const key = str(f, "plantilla");
  const supabase = await createClient();
  let t: Plantilla = PLANTILLAS[key] ?? EN_BLANCO;
  let nombrePlantilla = PLANTILLAS[key] ? PLANTILLAS[key].label : "Personalizada";
  if (key.startsWith("tpl:")) {
    const { data: tpl, error: et } = await supabase.from("audition_templates").select("*").eq("id", key.slice(4)).maybeSingle();
    if (et) return { ok: false, message: mensajeError(et) };
    if (!tpl) return { ok: false, message: "No se encontró esa plantilla." };
    // Solo las opciones conocidas: una plantilla no puede tocar otras columnas (obra, estado…).
    const guardadas = (tpl.opciones ?? {}) as Record<string, unknown>;
    const opciones = Object.fromEntries(Object.keys(EN_BLANCO.opciones).map((k) => [k, k in guardadas ? guardadas[k] : EN_BLANCO.opciones[k as keyof typeof EN_BLANCO.opciones]]));
    t = { ...EN_BLANCO, opciones: opciones as Plantilla["opciones"], criterios: tpl.criterios, preguntas: tpl.preguntas, requisitos: tpl.requisitos ?? undefined };
    nombrePlantilla = tpl.nombre as string;
  }
  const { data, error } = await supabase
    .from("auditions")
    .insert({ production_id: pid, titulo, ...t.opciones, criterios: t.criterios, requisitos: t.requisitos ?? null, plantilla: nombrePlantilla })
    .select("id")
    .single();
  if (error) return { ok: false, message: pid ? mensajeError(error) : "Solo el Director puede crear convocatorias generales." };
  // Si algo de lo que sigue falla, se deshace todo: no queda una convocatoria a medias.
  const deshacer = async (msg: string): Promise<AudState> => {
    await supabase.from("auditions").delete().eq("id", data.id);
    return { ok: false, message: `No se pudo crear la convocatoria: ${msg}` };
  };
  if (t.preguntas.length) {
    const { error: e2 } = await supabase.from("audition_fields").insert(t.preguntas.map((q, i) => ({
      audition_id: data.id, etiqueta: String(q.etiqueta), tipo: q.tipo, opciones: q.tipo === "opcion" ? q.opciones ?? null : null, obligatorio: !!q.obligatorio, orden: i + 1,
    })));
    if (e2) return deshacer(mensajeError(e2));
  }
  // 0089: si es de una obra, trae sus personajes (en su orden de importancia).
  if (pid) {
    const { error: e3 } = await supabase.rpc("audition_import_characters", { aid: data.id });
    if (e3) return deshacer(mensajeError(e3));
  }
  if (pid) revalidatePath(`/panel/producciones/${pid}/audiciones`);
  revalidatePath("/panel/audiciones");
  redirect(base(data.id as string));
}

/** Crea el Registro permanente (solo uno; general, en línea y abierto). */
export async function createPermanentRegistry(): Promise<AudState> {
  const supabase = await createClient();
  const t = REGISTRO_PERMANENTE;
  const { data, error } = await supabase
    .from("auditions")
    .insert({ production_id: null, titulo: "Registro permanente de talento", ...t.opciones, estado: "abierta", permanente: true, criterios: t.criterios, requisitos: t.requisitos ?? null, plantilla: t.label })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.code === "23505" ? "El Registro permanente ya existe." : "Solo el Director puede crearlo." };
  const { error: e2 } = await supabase.from("audition_fields").insert(t.preguntas.map((q, i) => ({
    audition_id: data.id, etiqueta: q.etiqueta, tipo: q.tipo, opciones: q.tipo === "opcion" ? q.opciones ?? null : null, obligatorio: !!q.obligatorio, orden: i + 1,
  })));
  if (e2) {
    await supabase.from("auditions").delete().eq("id", data.id);
    return { ok: false, message: `No se pudo crear el Registro permanente: ${mensajeError(e2)}` };
  }
  revalidatePath("/panel/audiciones");
  revalidatePath("/audiciones");
  redirect(base(data.id as string));
}

export async function saveAudition(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const cierra = str(f, "cierra");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("auditions")
    .update(
      {
        titulo: str(f, "titulo"),
        descripcion: str(f, "descripcion") || null,
        requisitos: str(f, "requisitos") || null,
        sede: str(f, "sede") || null,
        edad_min: num(f.get("edad_min")),
        edad_max: num(f.get("edad_max")),
        inscripcion_cierra: cierra ? localMxToIso(cierra) : null,
      },
      { count: "exact" },
    )
    .eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return done(aid, "Convocatoria guardada.");
}

/** Opciones de inscripción y logística (0037). */
export async function saveOptions(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const on = (k: string) => f.get(k) === "on";
  const pedir_tutor = on("pedir_tutor");
  const autorizacion_escuela = on("autorizacion_escuela");
  const solo_invitados = on("solo_invitados");
  const modalidad = ["en_linea", "mixta"].includes(str(f, "modalidad")) ? str(f, "modalidad") : "presencial";
  if (!pedir_tutor && !autorizacion_escuela) {
    return { ok: false, message: "Si no pides datos del tutor, confirma que la escuela u organización ya tiene la autorización de los padres." };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("auditions")
    .update(
      {
        pedir_tutor,
        autorizacion_escuela: pedir_tutor ? false : autorizacion_escuela,
        pedir_foto: on("pedir_foto"),
        perfil_preguntas: f.getAll("perfil_pregunta").map(String).filter((x) => PREGUNTAS_PERFIL.some((p) => p.valor === x)),
        elegir_horario: on("elegir_horario"),
        // Por invitación siempre es "solo con enlace".
        visibilidad: solo_invitados || str(f, "visibilidad") === "enlace" ? "enlace" : "publica",
        numeracion: (["previa", "personaje"] as const).find((x) => x === str(f, "numeracion")) ?? "llegada",
        modalidad,
        solo_invitados,
        // 0089: con callback, el "Siguiente" pasa por "Elegir callback" y "Callback" antes de votar.
        con_callback: on("con_callback"),
      },
      { count: "exact" },
    )
    .eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return done(aid, "Opciones guardadas.");
}

/** Criterios que califican los jueces ("Técnica, Fuerza, Presencia escénica"). */
export async function saveCriterios(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const criterios = criteriosFromText(str(f, "criterios"));
  if (!criterios.length) return { ok: false, message: "Escribe al menos un criterio." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("auditions").update({ criterios }, { count: "exact" }).eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return done(aid, `Criterios guardados: ${criterios.map((c) => c.l).join(", ")}.`);
}

/** Preguntas de la entrevista del host (0112): una por renglón. */
export async function saveEntrevistaPreguntas(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const preguntas = [...new Set(str(f, "preguntas").split("\n").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20);
  if (preguntas.some((x) => x.length > 200)) return { ok: false, message: "Cada pregunta puede tener hasta 200 letras." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("auditions").update({ preguntas_entrevista: preguntas }, { count: "exact" }).eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return done(aid, preguntas.length ? `Preguntas guardadas (${preguntas.length}).` : "Sin preguntas: el host solo tendrá el espacio adicional.");
}

/** El host guarda la entrevista de un aspirante (0112). */
export async function saveEntrevista(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const app = str(f, "app");
  const preguntas = f.getAll("pregunta").map(String);
  const respuestas = f.getAll("respuesta").map(String);
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_entrevista_guardar", {
    app, p_respuestas: preguntas.map((pregunta, i) => ({ pregunta, respuesta: respuestas[i] ?? "" })), p_extra: str(f, "extra"),
  });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/audiciones/${aid}/entrevista`);
  return { ok: true, message: "Entrevista guardada en su expediente." };
}

// ──────── Invitaciones (convocatoria particular) ────────

export async function addInvites(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const emails = [...new Set(str(f, "emails").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const malos = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!emails.length) return { ok: false, message: "Escribe al menos un correo." };
  if (malos.length) return { ok: false, message: `Revisa estos correos: ${malos.join(", ")}` };
  const supabase = await createClient();
  let nuevos = 0;
  for (const email of emails) {
    const { error } = await supabase.from("audition_invites").insert({ audition_id: aid, email });
    if (!error) nuevos++;
    else if (!/duplicate|unique/i.test(error.message)) return { ok: false, message: error.message };
  }
  const repetidos = emails.length - nuevos;
  if (!nuevos) return { ok: true, message: "Esos correos ya estaban invitados." };
  return done(aid, `${nuevos === 1 ? "1 invitación guardada" : `${nuevos} invitaciones guardadas`}${repetidos ? ` (${repetidos} ya estaban)` : ""}.`);
}

export async function removeInvite(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("audition_invites").delete({ count: "exact" }).eq("id", str(f, "id")).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return done(aid, "Invitación quitada.");
}

// ──────── Plantillas propias ────────

/** Guarda opciones, criterios, preguntas y requisitos de esta convocatoria como plantilla. */
export async function saveAsTemplate(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const nombre = str(f, "nombre");
  if (!nombre) return { ok: false, message: "Ponle nombre a la plantilla." };
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  const supabase = await createClient();
  const [{ data: a }, { data: fields }] = await Promise.all([
    supabase.from("auditions").select("*").eq("id", aid).maybeSingle(),
    supabase.from("audition_fields").select("etiqueta, tipo, opciones, obligatorio").eq("audition_id", aid).order("orden"),
  ]);
  if (!a) return { ok: false, message: "No se encontró la convocatoria." };
  const opciones = Object.fromEntries(
    ["pedir_tutor", "autorizacion_escuela", "pedir_foto", "elegir_horario", "visibilidad", "numeracion", "modalidad", "solo_invitados", "perfil_preguntas"].map((k) => [k, a[k]]),
  );
  const { error } = await supabase.from("audition_templates").insert({
    nombre,
    descripcion: str(f, "descripcion") || null,
    opciones,
    criterios: a.criterios,
    preguntas: (fields ?? []).map((q) => ({ etiqueta: q.etiqueta, tipo: q.tipo, opciones: q.opciones ?? undefined, obligatorio: q.obligatorio })),
    requisitos: a.requisitos,
    created_by: session.userId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel/audiciones");
  return { ok: true, message: `Plantilla “${nombre}” guardada. Aparece en Personalizada al crear una convocatoria.` };
}

export async function deleteTemplate(_p: AudState, f: FormData): Promise<AudState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("audition_templates").delete({ count: "exact" }).eq("id", str(f, "id"));
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "Solo quien la creó o el Director puede borrarla." };
  revalidatePath("/panel/audiciones");
  return { ok: true, message: "Plantilla borrada." };
}

/**
 * Borrar una convocatoria (definitivo). Hay que escribir su título para confirmar.
 * La base decide quién puede (con inscritos: solo quien arma su equipo, 0039).
 * Antes quita las fotos de los aspirantes del almacenamiento.
 */
export async function deleteAudition(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { data: a } = await supabase.from("auditions").select("titulo, production_id").eq("id", aid).maybeSingle();
  if (!a) return { ok: false, message: "No se encontró la convocatoria." };
  if (str(f, "confirmar").toLowerCase() !== String(a.titulo).trim().toLowerCase()) {
    return { ok: false, message: "Escribe el título exacto de la convocatoria para confirmar." };
  }
  // Fotos: <audición>/<usuario>/archivo
  const fotos: string[] = [];
  const { data: carpetas } = await supabase.storage.from("audiciones").list(aid, { limit: 1000 });
  for (const c of carpetas ?? []) {
    const { data: files } = await supabase.storage.from("audiciones").list(`${aid}/${c.name}`, { limit: 1000 });
    for (const file of files ?? []) fotos.push(`${aid}/${c.name}/${file.name}`);
  }
  const { error, count } = await supabase.from("auditions").delete({ count: "exact" }).eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para borrar esta convocatoria." };
  if (fotos.length) await supabase.storage.from("audiciones").remove(fotos);
  revalidatePath("/panel/audiciones");
  revalidatePath("/audiciones");
  if (a.production_id) revalidatePath(`/panel/producciones/${a.production_id}/audiciones`);
  redirect(a.production_id ? `/panel/producciones/${a.production_id}/audiciones` : "/panel/audiciones");
}

export async function setAuditionEstado(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const estado = str(f, "estado");
  const supabase = await createClient();
  const { error, count } = await supabase.from("auditions").update({ estado }, { count: "exact" }).eq("id", aid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para cambiar el estado de esta convocatoria." };
  return done(aid, estado === "abierta" ? "Convocatoria abierta: ya se puede inscribir la gente." : estado === "cancelada" ? "Convocatoria cancelada. Los inscritos lo verán en su página y en Mi cuenta." : "Estado actualizado.");
}

export async function addRole(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { count } = await supabase.from("audition_roles").select("id", { count: "exact", head: true }).eq("audition_id", aid);
  const { error } = await supabase.from("audition_roles").insert({
    audition_id: aid,
    nombre: str(f, "nombre"),
    descripcion: str(f, "descripcion") || null,
    orden: (count ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  return done(aid, "Personaje agregado.");
}

export async function addSlot(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const inicia = localMxToIso(str(f, "inicia"));
  if (!inicia) return { ok: false, message: "Elige fecha y hora." };
  const supabase = await createClient();
  // 0140: hora de fin opcional ("de 11:50 a 12:10").
  const termina = str(f, "termina") ? localMxToIso(str(f, "termina")) : null;
  if (termina && termina <= inicia) return { ok: false, message: "La hora de fin debe ser después de la de inicio." };
  const { error } = await supabase.from("audition_slots").insert({ audition_id: aid, inicia, termina, cupo: Number(f.get("cupo") ?? 0), sala: str(f, "sala") || null });
  if (error) return { ok: false, message: error.message };
  return done(aid, "Horario agregado.");
}

export async function addField(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const tipo = str(f, "tipo") || "texto";
  const opciones = str(f, "opciones").split(",").map((s) => s.trim()).filter(Boolean);
  if (tipo === "opcion" && opciones.length < 2) return { ok: false, message: "Escribe al menos dos opciones separadas por coma." };
  const supabase = await createClient();
  const { count } = await supabase.from("audition_fields").select("id", { count: "exact", head: true }).eq("audition_id", aid);
  const { error } = await supabase.from("audition_fields").insert({
    audition_id: aid,
    etiqueta: str(f, "etiqueta"),
    tipo,
    opciones: tipo === "opcion" ? opciones : null,
    obligatorio: f.get("obligatorio") === "on",
    orden: (count ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  return done(aid, "Pregunta agregada.");
}

/** Quitar un personaje, horario, pregunta o video (tabla limitada a esas cuatro). */
export async function removeItem(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const tabla = str(f, "tabla");
  if (!["audition_roles", "audition_slots", "audition_fields", "audition_videos"].includes(tabla)) return { ok: false, message: "No válido." };
  const supabase = await createClient();
  const { error, count } = await supabase.from(tabla).delete({ count: "exact" }).eq("id", str(f, "id")).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para quitarlo." };
  return done(aid, "Quitado.");
}

// ──────── Equipo propio de la convocatoria (0037) ────────

export async function addAuditionMember(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const roles = f.getAll("role").map(String).filter(Boolean);
  const supabase = await createClient();
  const email = await correoDeCampo(supabase, str(f, "email"));
  if (!email || roles.length === 0) return { ok: false, message: "Elige a la persona y marca al menos un rol." };
  for (const role of roles) {
    const { error } = await supabase.rpc("audition_add_member", { aid, p_email: email, p_role: role });
    if (error) return { ok: false, message: error.message };
  }
  return done(aid, `Listo: ${email} ya está en el equipo de esta convocatoria.`);
}

export async function removeAuditionMember(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("audition_members").delete({ count: "exact" }).eq("id", str(f, "id")).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para quitar a esta persona." };
  return done(aid, "Quitado del equipo.");
}

// ──────── Solicitudes y resultados (gestionar) ────────

export async function setApplicationEstado(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const estado = str(f, "estado");
  const values: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (estado === "callback") values.ronda = Number(f.get("ronda") ?? 1) + 1;
  const supabase = await createClient();
  const { error, count } = await supabase.from("audition_applications").update(values, { count: "exact" }).eq("id", str(f, "app")).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para decidir sobre esta solicitud." };
  return done(aid, estado === "callback" ? `Pasa a callback (ronda ${values.ronda}).` : "Estado actualizado.");
}

export async function setSlot(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_set_slot", { aid, app: str(f, "app"), p_slot: str(f, "slot") || null });
  if (error) return { ok: false, message: error.message };
  return done(aid, "Horario asignado.");
}

/** Orden previo automático: por horario y fecha de inscripción (no toca a quien ya llegó). */
export async function autoOrder(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_auto_order", { aid });
  if (error) return { ok: false, message: error.message };
  return done(aid, `Listo: ${data} personas ordenadas por horario.`);
}

/** Repartir ya los turnos (si no, se reparten solos al cerrar la inscripción). 0140: en cualquier modo menos "al llegar". */
export async function numerarAhora(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_numerar_ahora", { aid });
  if (error) return { ok: false, message: mensajeError(error) };
  return done(aid, `Listo: ${data} ${Number(data) === 1 ? "persona" : "personas"} con su turno. Revisa el orden y, cuando esté, manda los turnos.`);
}

/** 0140: el horario de una persona, desde su renglón en la fila. */
export async function asignarHorario(aid: string, app: string, slot: string | null): Promise<{ ok: boolean; message?: string }> {
  const { error } = await (await createClient()).rpc("audition_set_slot", { aid, app, p_slot: slot });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

/** Subir o bajar a alguien en la lista (intercambia su número con el de al lado). */
export async function swapOrder(aid: string, a1: string, a2: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_swap", { aid, a1, a2 });
  if (error) return { ok: false, message: error.message };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

// ──────── Día de la audición ────────

export type DeskResult = { result: string; nombre?: string; numero?: number; es_menor?: boolean; estado?: string; personajes?: string[] | null; callback?: boolean; sin_aprobar?: boolean } | { result: "error"; message: string };

export async function deskCheckin(aid: string, ref: string): Promise<DeskResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_checkin", { aid, ref });
  if (error) return { result: "error", message: error.message };
  revalidatePath(base(aid), "layout");
  return data as DeskResult;
}

/** Entró a audicionar / terminó / deshacer el último paso. */
export async function deskStep(aid: string, app: string, paso: "entro" | "termino" | "deshacer"): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_step", { aid, app, paso });
  if (error) return { ok: false, message: error.message };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

export async function walkIn(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_walk_in", {
    aid,
    p: {
      nombre: str(f, "nombre"),
      telefono: str(f, "telefono"),
      fecha_nacimiento: str(f, "fecha_nacimiento"),
      tutor_nombre: str(f, "tutor_nombre"),
      tutor_telefono: str(f, "tutor_telefono"),
    },
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(base(aid), "layout");
  const r = data as { numero: number; nombre: string };
  return { ok: true, message: `${r.nombre} registrado con el número ${r.numero}.` };
}

// ──────── Videos (enlaces de YouTube no listado o Drive) ────────

export async function addVideo(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const url = str(f, "url");
  if (!/^https:\/\/\S+$/i.test(url)) return { ok: false, message: "Pega un enlace que empiece con https:// (YouTube no listado o Google Drive)." };
  const supabase = await createClient();
  const { error } = await supabase.from("audition_videos").insert({
    audition_id: aid,
    application_id: str(f, "app") || null,
    titulo: str(f, "titulo") || "Video de audición",
    url,
  });
  if (error) return { ok: false, message: error.message };
  return done(aid, "Video agregado.");
}

// ──────── Evaluación (juez) ────────

export async function saveScore(_p: AudState, f: FormData): Promise<AudState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  const aid = str(f, "aid");
  // Criterios de la convocatoria (0038): campos "c_<clave>" con valor 1–5.
  const puntos: Record<string, number> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("c_") && String(v)) puntos[k.slice(2)] = Number(v);
  const supabase = await createClient();
  const { error } = await supabase.from("audition_scores").upsert(
    {
      application_id: str(f, "app"),
      judge_id: session.userId,
      ronda: Number(f.get("ronda") ?? 1),
      puntos,
      notas: str(f, "notas") || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "application_id,judge_id,ronda" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath(`${base(aid)}/evaluacion`);
  return { ok: true, message: "Guardado." };
}

// ════════ 0115: en escena (el host pasa al siguiente; los jueces lo ven) ════════

export type EnEscenaRes = { ok: boolean; message?: string; app?: string | null; nombre?: string | null; numero?: number | null };

export async function ponerEnEscena(aid: string, app: string | null): Promise<EnEscenaRes> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_en_escena", { aid, app });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  const d = data as { app: string | null; nombre: string | null; numero: number | null };
  return { ok: true, ...d };
}

export async function pasarSiguiente(aid: string): Promise<EnEscenaRes> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_siguiente", { aid });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  const d = data as { app: string | null; nombre?: string | null; numero?: number | null };
  return { ok: true, ...d, message: d.app ? undefined : "Ya no hay nadie más esperando." };
}

// ════════ 0131: la fila del día (recepción y host) y terminar audiciones ════════

/** Cambiar el orden de quienes esperan: por llegada, por registro o por personaje. */
export async function reordenarFila(aid: string, modo: OrdenFila, juntar = true): Promise<{ ok: boolean; message: string }> {
  // 0140: primero se juntan en un turno quienes se mencionaron entre sí; luego se ordena turno por turno.
  const j = juntar ? await juntarSugeridos(aid) : { ok: true, grupos: 0 };
  if (!j.ok) return { ok: false, message: j.message ?? "No se pudieron juntar los grupos." };
  const { data, error } = await (await createClient()).rpc("audition_reordenar", { aid, p_modo: modo });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  const n = Number(data ?? 0);
  const g = j.grupos ? ` Se juntaron ${j.grupos} ${j.grupos === 1 ? "grupo" : "grupos"} que pasan en el mismo turno.` : "";
  return { ok: true, message: n ? `Listo: ${n} ${n === 1 ? "persona" : "personas"} en el nuevo orden.${g}` : "No hay nadie esperando para ordenar." };
}

/** Mandar a alguien al final de la fila. */
export async function mandarAlFinal(aid: string, app: string): Promise<{ ok: boolean; message?: string }> {
  return moverFila(aid, app, "final");
}

/** 0140: mover un turno a mano (arriba, abajo, al final o al lugar N). Si va en grupo, se mueve todo el turno. */
export async function moverFila(aid: string, app: string, a: "arriba" | "abajo" | "final" | number): Promise<{ ok: boolean; message?: string }> {
  const { error } = await (await createClient()).rpc("audition_mover", typeof a === "number" ? { aid, app, p_lugar: a } : { aid, app, p_dir: a });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

/** 0140: juntar en un turno a quienes se mencionaron entre sí en «¿con quién pasas?» (solo los que aún no pasan y no
 *  están ya en un grupo). Devuelve cuántos grupos se armaron. */
export async function juntarSugeridos(aid: string): Promise<{ ok: boolean; grupos: number; message?: string }> {
  const supabase = await createClient();
  const [{ data: lista }, { data: sistema }, { data: grupos }] = await Promise.all([
    supabase.rpc("audition_day_list", { aid }), supabase.rpc("audition_respuestas_sistema", { aid }), supabase.rpc("audition_grupos", { aid }),
  ]);
  const con = new Map(((sistema ?? []) as { id: string; companeros: string | null }[]).map((x) => [x.id, x.companeros]));
  const enGrupo = new Set(((grupos ?? []) as { id: string }[]).map((g) => g.id));
  const personas = ((lista ?? []) as { id: string; nombre: string; entered_at: string | null; estado: string }[])
    .filter((r) => !r.entered_at && !["cancelado", "no_cumple"].includes(r.estado) && !enGrupo.has(r.id))
    .map((r) => ({ id: r.id, nombre: r.nombre, con: con.get(r.id) ?? null }));
  let n = 0;
  for (const g of sugerirGrupos(personas)) {
    const { error } = await supabase.rpc("audition_agrupar", { aid, p_apps: g.ids });
    if (error) return { ok: false, grupos: n, message: mensajeError(error) };
    n++;
  }
  if (n) revalidatePath(base(aid), "layout");
  return { ok: true, grupos: n };
}

/** Terminar audiciones (o el callback): a votación o a callbacks (hoy u otra fecha). */
export async function cerrarRonda(aid: string, p: { destino: "votacion" | "callback"; pasan?: string[]; cuando?: "hoy" | "otra_fecha"; fecha?: string; lugar?: string }): Promise<{ ok: boolean; message: string }> {
  const fecha = p.cuando === "otra_fecha" ? localMxToIso(p.fecha ?? "") : null;
  if (p.cuando === "otra_fecha" && !fecha) return { ok: false, message: "Pon la fecha y hora del callback." };
  const { error } = await (await createClient()).rpc("audition_cerrar_ronda", {
    aid, p_destino: p.destino, p_pasan: p.destino === "callback" ? p.pasan ?? [] : null,
    p_cuando: p.destino === "callback" ? p.cuando ?? null : null, p_fecha: fecha, p_lugar: p.lugar?.trim() || null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  if (p.destino === "votacion") return { ok: true, message: "Listo: los jueces ya pueden votar." };
  const n = p.pasan?.length ?? 0;
  return { ok: true, message: `Listo: ${n} ${n === 1 ? "persona llamada" : "personas llamadas"} a callback.${p.cuando === "otra_fecha" ? " Les llega el aviso con su QR." : " Ya les avisamos en su cuenta."}` };
}

export type PersonaJuez = {
  app: string | null; numero: number | null; nombre: string; edad: number | null; foto: string | null; desde: string | null;
  personajes: string[] | null; respuestas: { pregunta: string; respuesta: string }[]; enlaces: { titulo: string; url: string }[];
  entrevista: { pregunta: string; respuesta: string }[]; extra: string | null; entrevista_at: string | null;
  historial: { obra: string; temporada: string | null; tipo: string; papel: string | null }[];
  puntos: Record<string, number>; notas: string | null; picks: { opcion: number; role_id: string | null; ensamble: boolean }[];
  /** 0135: ficha de cada personaje por el que audiciona y el perfil que dio la persona. */
  fichas?: FichaAudicion[]; perfil?: PerfilAspirante | null;
};
/** 0133: si pasan en grupo, "grupo" trae a cada integrante (cada quien con su evaluación). */
export type JuezActual = PersonaJuez & { grupo?: PersonaJuez[] | null };

/** Quien está en escena ahora (y su grupo, si pasan juntos), para la pantalla de los jueces (se vuelve a pedir cada
 *  pocos segundos). yaTengo: personas que el juez ya tiene en pantalla; a ellas no se les vuelve a firmar la foto. */
export async function juezActual(aid: string, ronda: number, yaTengo: string[] = []): Promise<JuezActual | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_juez_actual", { aid, p_ronda: ronda });
  if (error || !data || !(data as { app: string | null }).app) return null;
  type ConFoto = Omit<PersonaJuez, "foto"> & { foto_path: string | null };
  const d = data as ConFoto & { grupo?: ConFoto[] | null };
  const conFoto = async (p: ConFoto): Promise<PersonaJuez> => {
    const { foto_path, ...resto } = p;
    const foto = foto_path && !yaTengo.includes(p.app ?? "")
      ? (await supabase.storage.from("audiciones").createSignedUrl(foto_path, 3600)).data?.signedUrl ?? null : null;
    return { ...resto, foto };
  };
  const grupo = d.grupo && d.grupo.length > 1 ? await Promise.all(d.grupo.map(conFoto)) : null;
  const { grupo: _g, ...yo } = d;
  void _g;
  return { ...(await conFoto(yo)), grupo };
}

// ════════ 0133: pedir que completen la inscripción ════════

/** A una solicitud (campo "app") o a todas las que les falte algo (sin "app"). Les llega el aviso y pueden editar
 *  aunque la inscripción ya haya cerrado. */
export async function pedirCompletar(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const app = str(f, "app");
  const { data, error } = await (await createClient()).rpc("audition_pedir_completar", { aid, p_apps: app ? [app] : null });
  if (error) return { ok: false, message: mensajeError(error) };
  const n = Number(data ?? 0);
  if (!n) return { ok: true, message: app ? "No se pudo pedir: la persona ya se registró en la audición o no tiene cuenta." : "A nadie le falta información." };
  return done(aid, app ? "Listo: le avisamos que complete su inscripción." : `Listo: avisamos a ${n} ${n === 1 ? "persona" : "personas"} que completen su inscripción.`);
}

// ════════ 0133: grupos que pasan juntos en un turno ════════

export async function agruparTurno(aid: string, apps: string[]): Promise<{ ok: boolean; message: string }> {
  const { error } = await (await createClient()).rpc("audition_agrupar", { aid, p_apps: apps });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  return { ok: true, message: `Listo: ${apps.length} personas pasan juntas.` };
}

export async function separarTurno(aid: string, app: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await (await createClient()).rpc("audition_separar", { aid, app });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

// ════════ 0134: revisar solicitudes (aprobar / regresar con nota) ════════

export async function revisarSolicitud(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const accion = str(f, "accion") === "regresar" ? "regresar" : "aprobar";
  const { error } = await (await createClient()).rpc("audition_revisar", { aid, app: str(f, "app"), p_accion: accion, p_nota: str(f, "nota") || null });
  if (error) return { ok: false, message: mensajeError(error) };
  return done(aid, accion === "aprobar"
    ? "Aprobada: ya está en la lista para audicionar y le llegó el aviso. Si quieres, avísale también por WhatsApp."
    : "Regresada: le llegó el aviso con tu nota. Mándale también el WhatsApp con el botón verde.");
}

export async function aprobarCompletas(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const { data, error } = await (await createClient()).rpc("audition_aprobar_completas", { aid });
  if (error) return { ok: false, message: mensajeError(error) };
  const n = Number(data ?? 0);
  return done(aid, n ? `Listo: ${n} ${n === 1 ? "solicitud aprobada" : "solicitudes aprobadas"}.` : "No hay solicitudes completas por aprobar.");
}

// ──────── 0136: preguntas del sistema, horario por grupo, turnos, acciones en lote ────────

/** Marca una pregunta existente como «Grupo» o «¿Con quién pasas?» (field), o crea la estándar. */
/** 0140: opciones de la pregunta de Grupo (separadas por coma). Las respuestas ya dadas no cambian. */
export async function opcionesGrupo(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const field = str(f, "field");
  const ops = [...new Set(str(f, "opciones").split(",").map((x) => x.trim()).filter(Boolean))];
  if (ops.length < 2) return { ok: false, message: "Escribe al menos dos opciones, separadas por coma." };
  const { error, count } = await (await createClient()).from("audition_fields").update({ tipo: "opcion", opciones: ops }, { count: "exact" }).eq("id", field).eq("audition_id", aid).eq("sistema", "grupo");
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No se pudo guardar: revisa que sea la pregunta de Grupo y que tengas permiso." };
  return done(aid, `Listo: ${ops.length} opciones de Grupo.`);
}

export async function preguntaSistema(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const sistema = str(f, "sistema") === "companeros" ? "companeros" : "grupo";
  const field = str(f, "field") || null;
  const { error } = await (await createClient()).rpc("audition_pregunta_sistema", { aid, p_sistema: sistema, p_field: field });
  if (error) return { ok: false, message: mensajeError(error) };
  return done(aid, sistema === "grupo"
    ? (field ? "Listo: esa pregunta ya es la de Grupo y quedó de opción múltiple con las respuestas que ya había (\"Grupo A\", \"A\" y \"grupo a\" cuentan como lo mismo)." : "Listo: se preguntará el grupo al inscribirse (opción múltiple: Grupo A, B, C; edita las opciones si hace falta).")
    : (field ? "Listo: esa pregunta ya es la de «¿con quién pasas?». Sus respuestas se usan tal cual." : "Listo: se preguntará con quién pasan."));
}

export async function quitarPreguntaSistema(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const sistema = str(f, "sistema") === "companeros" ? "companeros" : "grupo";
  const { error } = await (await createClient()).rpc("audition_pregunta_sistema_quitar", { aid, p_sistema: sistema });
  if (error) return { ok: false, message: mensajeError(error) };
  return done(aid, "Listo. Si ya había respuestas, la pregunta se conserva como una pregunta normal.");
}

/** Horario para todas las personas de un grupo (respuesta a «Grupo»). */
export async function horarioGrupo(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const grupo = str(f, "grupo");
  if (!grupo) return { ok: false, message: "Elige el grupo." };
  const { data, error } = await (await createClient()).rpc("audition_horario_grupo", { aid, p_grupo: grupo, p_slot: str(f, "slot") || null });
  if (error) return { ok: false, message: mensajeError(error) };
  const n = Number(data ?? 0);
  return done(aid, n ? `Listo: ${n} ${n === 1 ? "persona" : "personas"} del grupo ${grupo} con ese horario.` : `Nadie del grupo ${grupo} sin registrar en la entrada.`);
}

/** Ordena la fila (por grupo u horario) y avisa a cada quien su turno con número y hora. */
export async function ordenarYAvisar(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const modo = (["llegada", "registro", "personaje", "horario", "grupo"] as const).find((m) => m === str(f, "modo")) ?? "horario";
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_reordenar", { aid, p_modo: modo });
  if (error) return { ok: false, message: mensajeError(error) };
  if (f.get("avisar") !== "on") return done(aid, "Listo: la fila quedó en el nuevo orden.");
  const { data, error: e2 } = await supabase.rpc("audition_avisar_turnos", { aid });
  if (e2) return { ok: false, message: mensajeError(e2) };
  const n = Number(data ?? 0);
  return done(aid, `Listo: la fila quedó en el nuevo orden y ${n} ${n === 1 ? "persona recibió" : "personas recibieron"} su turno (número y hora).`);
}

export async function avisarTurnos(_p: AudState, f: FormData): Promise<AudState> {
  const aid = str(f, "aid");
  const { data, error } = await (await createClient()).rpc("audition_avisar_turnos", { aid });
  if (error) return { ok: false, message: mensajeError(error) };
  const n = Number(data ?? 0);
  return done(aid, n ? `Listo: ${n} ${n === 1 ? "persona recibió" : "personas recibieron"} su turno (número y hora).` : "Nadie tiene número todavía: ordena la fila primero.");
}

/** Acciones en lote desde la tabla de Solicitudes: aprobar, regresar con nota o pedir que completen. */
export async function revisarVarias(aid: string, ids: string[], accion: "aprobar" | "regresar" | "completar", nota?: string): Promise<{ ok: boolean; message: string }> {
  if (!ids.length) return { ok: false, message: "Palomea al menos una solicitud." };
  const supabase = await createClient();
  if (accion === "completar") {
    const { data, error } = await supabase.rpc("audition_pedir_completar", { aid, p_apps: ids });
    if (error) return { ok: false, message: mensajeError(error) };
    revalidatePath(base(aid), "layout");
    return { ok: true, message: `Listo: avisamos a ${Number(data ?? 0)} ${Number(data ?? 0) === 1 ? "persona" : "personas"} que completen su inscripción.` };
  }
  let n = 0; const errores: string[] = [];
  for (const app of ids) {
    const { error } = await supabase.rpc("audition_revisar", { aid, app, p_accion: accion, p_nota: nota?.trim() || null });
    if (error) errores.push(mensajeError(error)); else n++;
  }
  revalidatePath(base(aid), "layout");
  const verbo = accion === "aprobar" ? "aprobadas" : "regresadas";
  return { ok: n > 0, message: `${n} ${n === 1 ? "solicitud " + verbo.slice(0, -1) : "solicitudes " + verbo}.${errores.length ? ` No se pudo con ${errores.length}: ${errores[0]}` : ""}` };
}
