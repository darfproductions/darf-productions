"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criteriosFromText } from "@/lib/audition-rules";
import { EN_BLANCO, PLANTILLAS, REGISTRO_PERMANENTE, type Plantilla } from "@/lib/audition-templates";
import { getSession } from "@/lib/auth";
import { localMxToIso } from "@/lib/dates";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

// Audiciones en el panel (0036, 0037). La base decide qué puede cada quien:
// gestionar (dirección), registro (mesa) y evaluar (jueces), por obra o por el
// equipo propio de la convocatoria. Las generales las crea el Director.

export type AudState = { ok: boolean; message: string } | null;

const base = (aid: string) => `/panel/audiciones/${aid}`;
const done = (aid: string, message: string): AudState => {
  revalidatePath(base(aid), "layout");
  revalidatePath(`/audiciones/${aid}`);
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
        elegir_horario: on("elegir_horario"),
        // Por invitación siempre es "solo con enlace".
        visibilidad: solo_invitados || str(f, "visibilidad") === "enlace" ? "enlace" : "publica",
        numeracion: str(f, "numeracion") === "previa" ? "previa" : "llegada",
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
    ["pedir_tutor", "autorizacion_escuela", "pedir_foto", "elegir_horario", "visibilidad", "numeracion", "modalidad", "solo_invitados"].map((k) => [k, a[k]]),
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
  const { error } = await supabase.from("audition_slots").insert({ audition_id: aid, inicia, cupo: Number(f.get("cupo") ?? 0), sala: str(f, "sala") || null });
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
  const email = str(f, "email");
  const roles = f.getAll("role").map(String).filter(Boolean);
  if (!email || roles.length === 0) return { ok: false, message: "Escribe el correo y marca al menos un rol." };
  const supabase = await createClient();
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

/** Subir o bajar a alguien en la lista (intercambia su número con el de al lado). */
export async function swapOrder(aid: string, a1: string, a2: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("audition_swap", { aid, a1, a2 });
  if (error) return { ok: false, message: error.message };
  revalidatePath(base(aid), "layout");
  return { ok: true };
}

// ──────── Día de la audición ────────

export type DeskResult = { result: string; nombre?: string; numero?: number; es_menor?: boolean; estado?: string } | { result: "error"; message: string };

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
