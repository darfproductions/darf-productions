"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TIPOS_OBRA, boleteriaPorDefecto, tipoDe } from "@/lib/tipo-obra-rules";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { refrescarPublico } from "@/lib/supabase/publico";
import { mesDeInput, validarMeses } from "@/lib/produccion-nueva-rules";

// Producción nueva (0135): asistente, personajes completos, puestos del equipo, ficha tentativa, hitos, lugares y
// borrar una obra. La base decide quién puede (obra.editar, elenco.gestionar, permisos.gestionar, casa.producciones).

export type ObraState = { ok: boolean; message: string; token?: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = str(f, k); return v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)); };
const refresca = (pid: string) => { revalidatePath(`/panel/producciones/${pid}`, "layout"); revalidatePath("/panel/producciones"); };
const ID = /^[a-z0-9][a-z0-9_-]{1,39}$/;

// ──────── Asistente ────────

/** Paso 1 (inicio): nombre, temporada y dirección web. La obra nace en borrador y queda en el asistente. */
export async function crearProyecto(_p: ObraState, f: FormData): Promise<ObraState> {
  const nombre = str(f, "nombre");
  const id = str(f, "id");
  if (!nombre) return { ok: false, message: "Escribe el nombre de la obra." };
  if (!ID.test(id)) return { ok: false, message: "La dirección web solo puede tener minúsculas, números y guiones." };
  const supabase = await createClient();
  // 0139: el tipo se elige al crear; la escuela empieza sin boletería por DARF (se cambia en Ficha).
  const tipo = tipoDe({ tipo: str(f, "tipo") });
  const { error } = await supabase.from("productions").insert({ id, nombre, temporada: str(f, "temporada") || null, asistente_paso: 1, tipo, con_boleteria: boleteriaPorDefecto(tipo) });
  if (error) return { ok: false, message: error.code === "23505" ? "Ya existe una obra con esa dirección web." : mensajeError(error) };
  revalidatePath("/panel", "layout");
  redirect(`/panel/producciones/${id}/asistente?paso=1`);
}

/** Avanza (o regresa) de paso y recuerda dónde se quedó. */
export async function irAPaso(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const paso = Math.min(5, Math.max(1, num(f, "paso") ?? 1));
  const supabase = await createClient();
  const { data } = await supabase.from("productions").select("asistente_paso").eq("id", pid).maybeSingle();
  if (data?.asistente_paso != null && paso > data.asistente_paso) await supabase.from("productions").update({ asistente_paso: paso }).eq("id", pid);
  redirect(`/panel/producciones/${pid}/asistente?paso=${paso}`);
}

/** Paso 5: termina el asistente. La obra queda como proyecto (borrador) en el panel. */
export async function terminarAsistente(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("productions").update({ asistente_paso: null }, { count: "exact" }).eq("id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta obra." };
  refresca(pid);
  redirect(`/panel/producciones/${pid}?creada=1`);
}

/** Ficha básica + fechas tentativas (por mes) + sede. En borrador se guarda directo; publicada, igual que antes. */
export async function guardarFicha(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const desde = mesDeInput(str(f, "tentativa_desde"));
  const hasta = mesDeInput(str(f, "tentativa_hasta"));
  const mal = validarMeses(desde, hasta);
  if (mal) return { ok: false, message: mal };
  const frase = str(f, "frase");
  if (frase.length > 120) return { ok: false, message: "La frase corta debe tener máximo 120 caracteres." };
  const valores: Record<string, unknown> = {
    tentativa_desde: desde, tentativa_hasta: hasta && hasta !== desde ? hasta : null,
  };
  // 0139: tipo de producción y si vende boletos por DARF (solo si el formulario los trae).
  if (f.has("tipo")) {
    const tipo = str(f, "tipo");
    if (!TIPOS_OBRA.some((t) => t.id === tipo)) return { ok: false, message: "Elige un tipo de producción." };
    valores.tipo = tipo;
    valores.con_boleteria = f.get("con_boleteria") === "1";
  }
  const supabase = await createClient();
  // Con la obra ya pública, los textos que ve el público se cambian en Página → Contenido (con borrador, 0119).
  const { data: obra } = await supabase.from("productions").select("estado").eq("id", pid).maybeSingle();
  const publica = ["publicada", "archivada"].includes(String(obra?.estado));
  if (!publica) for (const k of ["sinopsis", "duracion", "clasificacion", "basada_en", "idioma", "venue", "frase"]) if (f.has(k)) valores[k] = str(f, k) || null;
  const { error, count } = await supabase.from("productions").update(valores, { count: "exact" }).eq("id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta obra." };
  refresca(pid);
  revalidatePath(`/producciones/${pid}`);
  refrescarPublico();
  return { ok: true, message: "Ficha guardada." };
}

// ──────── Hitos y lugares ────────

export async function agregarHito(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const nombre = str(f, "nombre");
  const mes = mesDeInput(str(f, "mes"));
  const dia = str(f, "dia") || null;
  if (!nombre) return { ok: false, message: "Escribe qué pasa (ej. Audiciones)." };
  if (!mes && !dia) return { ok: false, message: "Elige el mes." };
  const { error } = await (await createClient()).from("production_hitos").insert({
    production_id: pid, nombre, mes: mes ?? `${dia!.slice(0, 7)}-01`, dia, notas: str(f, "notas") || null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  refresca(pid);
  return { ok: true, message: `${nombre} agregado.` };
}

export async function borrarHito(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const { error, count } = await (await createClient()).from("production_hitos").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error || !count) return { ok: false, message: error ? mensajeError(error) : "No se pudo quitar." };
  refresca(pid);
  return { ok: true, message: "Quitado." };
}

export async function agregarLugar(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const nombre = str(f, "nombre");
  const mapa = str(f, "mapa_url");
  if (!nombre) return { ok: false, message: "Escribe el nombre del lugar." };
  if (mapa && !/^https:\/\/\S+$/i.test(mapa)) return { ok: false, message: "La liga del mapa debe empezar con https://" };
  const { error } = await (await createClient()).from("production_lugares").insert({
    production_id: pid, nombre, tipo: str(f, "tipo") || "otro", direccion: str(f, "direccion") || null, mapa_url: mapa || null, notas: str(f, "notas") || null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  refresca(pid);
  return { ok: true, message: `${nombre} agregado.` };
}

export async function borrarLugar(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const { error, count } = await (await createClient()).from("production_lugares").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error || !count) return { ok: false, message: error ? mensajeError(error) : "No se pudo quitar." };
  refresca(pid);
  return { ok: true, message: "Quitado." };
}

// ──────── Personajes ────────

function datosPersonaje(f: FormData) {
  const categoria = ["protagonista", "apoyo", "ensamble"].includes(str(f, "categoria")) ? str(f, "categoria") : "protagonista";
  const nivel = (k: string) => (["no", "basico", "fuerte"].includes(str(f, k)) ? str(f, k) : null);
  const extra = str(f, "habilidad_otra").split(",").map((x) => x.trim()).filter(Boolean);
  return {
    nombre: str(f, "nombre"),
    descripcion: str(f, "descripcion") || null,
    categoria,
    cupo: categoria === "ensamble" ? Math.min(200, Math.max(1, num(f, "cupo") ?? 1)) : 1,
    genero: ["hombre", "mujer", "cualquiera"].includes(str(f, "genero")) ? str(f, "genero") : null,
    edad_min: num(f, "edad_min"),
    edad_max: num(f, "edad_max"),
    tesituras: f.getAll("tesitura").map(String),
    canto: nivel("canto"),
    baile: nivel("baile"),
    actuacion: nivel("actuacion"),
    habilidades: [...new Set([...f.getAll("habilidad").map(String), ...extra])].slice(0, 20),
    rasgos: str(f, "rasgos") || null,
    canciones: f.getAll("cancion").map(String),
  };
}

export async function guardarPersonaje(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const id = str(f, "id");
  const d = datosPersonaje(f);
  if (!d.nombre) return { ok: false, message: d.categoria === "ensamble" ? "Escribe el nombre del grupo (ej. Porristas)." : "Escribe el nombre del personaje." };
  if (d.edad_min != null && d.edad_max != null && d.edad_max < d.edad_min) return { ok: false, message: "La edad máxima no puede ser menor que la mínima." };
  if (d.canto === "no") d.tesituras = [];
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("production_characters").update(d, { count: "exact" }).eq("id", id).eq("production_id", pid);
    if (error) return { ok: false, message: mensajeError(error) };
    if (!count) return { ok: false, message: "No tienes permiso para editar los personajes de esta obra." };
  } else {
    const { count } = await supabase.from("production_characters").select("id", { count: "exact", head: true }).eq("production_id", pid);
    const { error } = await supabase.from("production_characters").insert({ ...d, production_id: pid, orden: (count ?? 0) + 1 });
    if (error) return { ok: false, message: mensajeError(error) };
  }
  refresca(pid);
  return { ok: true, message: id ? `${d.nombre} guardado.` : `${d.nombre} agregado.` };
}

// ──────── Puestos del equipo ────────

/** Quién ocupa el puesto: "cuenta:<id>" (del buscador), o nombre + correo, o nada (hueco). */
export async function guardarPuesto(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const modo = str(f, "modo") || "cuenta";
  const quien = modo === "cuenta" ? str(f, "quien") : "";
  let cuenta = quien.startsWith("cuenta:") ? quien.slice(7) : null;
  const correoBuscador = !cuenta && quien.includes("@") ? quien : "";
  const nombre = modo === "invitar" ? str(f, "nombre") : "";
  const email = modo === "invitar" ? str(f, "correo") : correoBuscador;
  const roles = f.getAll("role").map(String);
  const supabase = await createClient();
  if (modo === "cuenta" && !cuenta && !correoBuscador) {
    // Sin elegir a nadie: si ya tenía cuenta, se conserva.
    const { data: ant } = str(f, "id") ? await supabase.from("production_puestos").select("user_id").eq("id", str(f, "id")).maybeSingle() : { data: null };
    cuenta = (ant?.user_id as string | null) ?? null;
    if (!cuenta) return { ok: false, message: "Busca a la persona y elígela de la lista (o elige «Aún no tiene cuenta»)." };
  }
  const { data, error } = await supabase.rpc("production_puesto_guardar", {
    pid, p_id: str(f, "id") || null, p_puesto: str(f, "puesto"), p_area: str(f, "area") || "creativo", p_roles: roles,
    p_user: cuenta, p_nombre: cuenta ? null : nombre || null, p_email: cuenta ? null : email || null, p_telefono: str(f, "telefono") || null,
  });
  if (error) {
    const m = mensajeError(error);
    return { ok: false, message: correoBuscador && /nombre/i.test(m) ? "Ese correo aún no tiene cuenta: elige «Aún no tiene cuenta» y escribe su nombre." : m };
  }
  refresca(pid);
  const r = data as { token: string | null; cuenta: boolean };
  if (r.token) return { ok: true, message: "Guardado. Le mandamos la invitación; al crear su cuenta con ese correo queda ligado solo.", token: r.token };
  if (r.cuenta) return { ok: true, message: "Guardado: ya tiene sus permisos en la obra." };
  return { ok: true, message: nombre || email ? "Guardado (sin cuenta por ahora)." : "Guardado como puesto vacío." };
}

/** Agrega varios puestos sugeridos de una vez (vacíos, con sus permisos). */
export async function agregarPuestosSugeridos(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const { PUESTOS_SUGERIDOS } = await import("@/lib/produccion-nueva-rules");
  const elegidos = new Set(f.getAll("sugerido").map(String));
  const supabase = await createClient();
  let n = 0;
  for (const s of PUESTOS_SUGERIDOS.filter((x) => elegidos.has(x.puesto))) {
    const { error } = await supabase.rpc("production_puesto_guardar", { pid, p_id: null, p_puesto: s.puesto, p_area: s.area, p_roles: s.roles });
    if (error) return { ok: false, message: mensajeError(error) };
    n++;
  }
  if (!n) return { ok: false, message: "Palomea al menos un puesto." };
  refresca(pid);
  return { ok: true, message: `${n} ${n === 1 ? "puesto agregado" : "puestos agregados"}. Ahora llena quién ocupa cada uno.` };
}

export async function borrarPuesto(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const { error } = await (await createClient()).rpc("production_puesto_borrar", { p_id: str(f, "id") });
  if (error) return { ok: false, message: mensajeError(error) };
  refresca(pid);
  return { ok: true, message: "Puesto quitado." };
}

// ──────── Borrar la obra completa ────────

export async function borrarObra(_p: ObraState, f: FormData): Promise<ObraState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_borrar_produccion", { pid, p_confirmacion: str(f, "confirmacion") });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/panel", "layout");
  revalidatePath("/", "layout");
  refrescarPublico();
  redirect("/panel/producciones?borrada=1");
}
