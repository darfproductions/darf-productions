"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { getMes } from "@/lib/honorarios";
import { nombreBolsa } from "@/lib/honorarios-rules";
import { createClient } from "@/lib/supabase/server";

// Honorarios (0149). La base revisa que sea una de las cabezas de DARF (RLS y hon_asignacion_guardar).

export type HonState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) === "" ? NaN : Number(str(f, k)));
const fechaOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const listo = (message: string): HonState => {
  revalidatePath("/panel/honorarios", "layout");
  return { ok: true, message };
};

const fechaTxt = (d: string) => d.split("-").reverse().join("/");
const GLOBAL = ["reserva_meta", "recargo", "redondeo", "umbral_alumnos", "fondo_pct", "casa_cabezas_pct"] as const;

/** Lo de toda la empresa (recargo, redondeo, fondo común, Casa DARF, meta de la reserva), con vigencia. */
export async function guardarConfig(_p: HonState, f: FormData): Promise<HonState> {
  const desde = str(f, "vigente_desde");
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  const fila: Record<string, number | string> = { vigente_desde: desde };
  for (const c of GLOBAL) {
    const v = num(f, c);
    if (!Number.isFinite(v) || v < 0) return { ok: false, message: "Revisa los valores: todos deben ser números de 0 en adelante." };
    fila[c] = v;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("hon_config").upsert(fila, { onConflict: "vigente_desde" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(`Guardado; aplica desde el ${fechaTxt(desde)}. Lo anterior queda en el historial.`);
}

/** Agregar una obra al módulo o cambiar su tipo y si está activa. Una obra nueva arranca con reglas sugeridas. */
export async function guardarObra(_p: HonState, f: FormData): Promise<HonState> {
  const pid = str(f, "production_id");
  if (!pid) return { ok: false, message: "Elige la obra." };
  const mensual = str(f, "mensual") !== "0";
  const supabase = await createClient();
  const { error } = await supabase.from("hon_obras").upsert(
    { production_id: pid, mensual, activa: str(f, "activa") !== "0", updated_at: new Date().toISOString() },
    { onConflict: "production_id" },
  );
  if (error) return { ok: false, message: mensajeError(error) };
  const { count } = await supabase.from("hon_obra_reglas").select("production_id", { count: "exact", head: true }).eq("production_id", pid);
  if (!count) {
    // Reglas sugeridas (las del documento): se cambian en la página de la obra.
    const { error: e2 } = await supabase.from("hon_obra_reglas").insert({ production_id: pid, vigente_desde: `${new Date().toISOString().slice(0, 7)}-01`, en_fondo: mensual });
    if (e2) return { ok: false, message: mensajeError(e2) };
  }
  return listo(count ? "Obra guardada." : "Obra agregada con reglas sugeridas: revísalas en su página.");
}

const PCT_OBRA = ["reserva_pct", "emergencia_pct", "creativo_pct", "compartida_pct", "cierre_empresa_pct", "cierre_creativos_pct", "cierre_compartida_pct", "cierre_casa_pct"] as const;

/** Reglas de una obra desde una fecha (lo anterior queda en el historial). */
export async function guardarReglas(_p: HonState, f: FormData): Promise<HonState> {
  const pid = str(f, "production_id");
  const desde = str(f, "vigente_desde");
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  const fila: Record<string, number | string | boolean> = { production_id: pid, vigente_desde: desde, en_fondo: f.get("en_fondo") === "on" };
  for (const c of [...PCT_OBRA, "gastos_propios"] as const) {
    const v = num(f, c);
    if (!Number.isFinite(v) || v < 0 || (c !== "gastos_propios" && v > 100)) return { ok: false, message: "Revisa los valores: los porcentajes van de 0 a 100." };
    fila[c] = v;
  }
  if (Number(fila.creativo_pct) + Number(fila.compartida_pct) > 100.001) return { ok: false, message: "Lo creativo y lo compartido suman más de 100 %." };
  const cierre = ["cierre_empresa_pct", "cierre_creativos_pct", "cierre_compartida_pct", "cierre_casa_pct"].reduce((s, k) => s + Number(fila[k]), 0);
  if (Math.abs(cierre - 100) > 0.001) return { ok: false, message: `El reparto del cierre suma ${cierre} %; debe sumar 100 %.` };
  const supabase = await createClient();
  const { error } = await supabase.from("hon_obra_reglas").upsert(fila, { onConflict: "production_id,vigente_desde" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(`Reglas guardadas; aplican desde el ${fechaTxt(desde)}.`);
}

/** Crear o cambiar una bolsa compartida: su nombre y entre qué obras se comparte desde una fecha. */
export async function guardarCompartida(_p: HonState, f: FormData): Promise<HonState> {
  const desde = str(f, "vigente_desde");
  const nombre = str(f, "nombre");
  const obras = f.getAll("obras").map(String).filter(Boolean);
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  const supabase = await createClient();
  let id = str(f, "id");
  if (!id) {
    if (!nombre) return { ok: false, message: "Ponle nombre a la bolsa." };
    const { data, error } = await supabase.from("hon_compartidas").insert({ nombre }).select("id").single();
    if (error) return { ok: false, message: mensajeError(error) };
    id = (data as { id: string }).id;
  } else if (nombre) {
    const { error } = await supabase.from("hon_compartidas").update({ nombre }).eq("id", id);
    if (error) return { ok: false, message: mensajeError(error) };
  }
  const { error } = await supabase.from("hon_compartida_obras").upsert({ compartida_id: id, vigente_desde: desde, obras }, { onConflict: "compartida_id,vigente_desde" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(`Bolsa compartida guardada; desde el ${fechaTxt(desde)} se comparte entre ${obras.length} ${obras.length === 1 ? "obra" : "obras"}.`);
}

/** Crear o cambiar un gasto compartido (renta del salón, gastos varios…): monto al mes y entre qué obras se divide. */
export async function guardarGasto(_p: HonState, f: FormData): Promise<HonState> {
  const desde = str(f, "vigente_desde");
  const nombre = str(f, "nombre");
  const monto = num(f, "monto");
  const obras = f.getAll("obras").map(String).filter(Boolean);
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  if (!Number.isFinite(monto) || monto < 0) return { ok: false, message: "Escribe el monto al mes (0 para dejar de cobrarlo)." };
  const supabase = await createClient();
  let id = str(f, "id");
  if (!id) {
    if (!nombre) return { ok: false, message: "Ponle nombre al gasto." };
    const { data, error } = await supabase.from("hon_gastos").insert({ nombre }).select("id").single();
    if (error) return { ok: false, message: mensajeError(error) };
    id = (data as { id: string }).id;
  } else if (nombre) {
    const { error } = await supabase.from("hon_gastos").update({ nombre }).eq("id", id);
    if (error) return { ok: false, message: mensajeError(error) };
  }
  const { error } = await supabase.from("hon_gasto_versiones").upsert({ gasto_id: id, vigente_desde: desde, monto, obras }, { onConflict: "gasto_id,vigente_desde" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(`Gasto guardado; desde el ${fechaTxt(desde)} se divide entre ${obras.length} ${obras.length === 1 ? "obra" : "obras"}.`);
}

/** Mensualidad de la obra y meses en que se cobra (production_fees, la misma de Expedientes, Cuotas). Honorarios solo
 *  reparte una obra los meses en que cobra. */
export async function guardarCuota(_p: HonState, f: FormData): Promise<HonState> {
  const pid = str(f, "production_id");
  const monto = num(f, "monto");
  const inscripcion = str(f, "inscripcion") === "" ? 0 : num(f, "inscripcion");
  const desde = str(f, "desde"), hasta = str(f, "hasta");
  if (!Number.isFinite(monto) || monto < 0 || !Number.isFinite(inscripcion) || inscripcion < 0) return { ok: false, message: "Revisa los montos." };
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) return { ok: false, message: "Elige el primer y el último mes." };
  if (hasta < desde) return { ok: false, message: "El último mes no puede ser antes del primero." };
  const supabase = await createClient();
  const { error } = await supabase.from("production_fees").upsert(
    { production_id: pid, monto, inscripcion, desde: `${desde}-01`, hasta: `${hasta}-01`, cobrar: f.get("cobrar") === "on" },
    { onConflict: "production_id" },
  );
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}/expedientes`, "layout");
  return listo(`Mensualidad guardada: se cobra de ${desde.split("-").reverse().join("/")} a ${hasta.split("-").reverse().join("/")}.`);
}

/** Encender en la obra el pago el 1.er sábado con corte el 2.º (production_fees.vence_sabado). */
export async function usarSabados(_p: HonState, f: FormData): Promise<HonState> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_fees").update({ vence_sabado: true }, { count: "exact" }).eq("production_id", str(f, "production_id"));
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "Esa obra aún no tiene cuotas configuradas (Expedientes, Cuotas)." };
  return listo("Listo: la mensualidad se paga el 1.er sábado y el corte es el 2.º.");
}

/** Poner, cambiar o quitar el % de una persona en una bolsa desde una fecha (lo anterior queda en el historial). */
export async function guardarAsignacion(_p: HonState, f: FormData): Promise<HonState> {
  const bolsa = str(f, "bolsa");
  const desde = str(f, "desde");
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  const quitar = str(f, "quitar") === "1";
  const pct = num(f, "pct");
  if (!quitar && !(pct > 0 && pct <= 100)) return { ok: false, message: "El porcentaje debe estar entre 0 y 100." };
  const supabase = await createClient();
  let person = str(f, "person_id");
  if (!person) {
    const nombre = str(f, "persona");
    if (!nombre) return { ok: false, message: "Escribe el nombre de la persona." };
    const { data } = await supabase.from("people").select("id, nombre").ilike("nombre", nombre.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(3);
    const hallados = (data ?? []) as { id: string; nombre: string }[];
    if (!hallados.length) return { ok: false, message: `No encontré a "${nombre}" en Personas. Escríbelo como aparece en su ficha.` };
    if (hallados.length > 1) return { ok: false, message: `Hay más de una persona llamada "${nombre}". Pídeme que la ligue por su ficha.` };
    person = hallados[0].id;
  }
  const { error } = await supabase.rpc("hon_asignacion_guardar", {
    p_bolsa: bolsa, p_person: person, p_puesto: str(f, "puesto") || null, p_pct: quitar ? null : pct, p_desde: desde,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(quitar ? "Quitado de la bolsa desde esa fecha." : "Porcentaje guardado.");
}

// ──────── El mes (0150) ────────

const mesOk = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const listoMes = (message: string): HonState => {
  revalidatePath("/panel/honorarios", "layout");
  revalidatePath("/cuenta/honorarios");
  return { ok: true, message };
};

/** Lo que se usó del % de emergencia en una obra ese mes (0 si no se usó; el cálculo nunca pasa del tope). */
export async function guardarEmergencia(_p: HonState, f: FormData): Promise<HonState> {
  const mes = str(f, "mes");
  const monto = num(f, "monto");
  if (!mesOk(mes)) return { ok: false, message: "Mes no válido." };
  if (!Number.isFinite(monto) || monto < 0) return { ok: false, message: "Escribe cuánto se usó (0 si no se usó)." };
  const supabase = await createClient();
  const { error } = await supabase.from("hon_mes_obra").upsert(
    { periodo: `${mes}-01`, production_id: str(f, "production_id"), emergencia_uso: monto, nota: str(f, "nota") || null, updated_at: new Date().toISOString() },
    { onConflict: "periodo,production_id" },
  );
  if (error) return { ok: false, message: mensajeError(error) };
  return listoMes("Emergencia guardada.");
}

/** Mi aprobación (o la retiro) del fondo creativo común de ese mes. */
export async function aprobarFondo(_p: HonState, f: FormData): Promise<HonState> {
  const mes = str(f, "mes");
  if (!mesOk(mes)) return { ok: false, message: "Mes no válido." };
  const aprobar = str(f, "aprobar") !== "0";
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_fondo_aprobar", { p_periodo: `${mes}-01`, p_aprobar: aprobar });
  if (error) return { ok: false, message: mensajeError(error) };
  return listoMes(aprobar ? "Aprobaste el fondo común de este mes." : "Retiraste tu aprobación.");
}

/** Cerrar el mes: se recalcula aquí con lo registrado (no con lo que mandó la pantalla) y se guarda. */
export async function cerrarMes(_p: HonState, f: FormData): Promise<HonState> {
  const mes = str(f, "mes");
  if (!mesOk(mes)) return { ok: false, message: "Mes no válido." };
  const d = await getMes(mes);
  if (d.cerrado) return { ok: false, message: "Ese mes ya se cerró." };
  if (!d.resultado) return { ok: false, message: "Falta la configuración de honorarios." };
  const bloquean = d.resultado.errores.filter((e) => e.includes("suman"));
  if (bloquean.length) return { ok: false, message: "Hay bolsas que no suman 100 %: corrígelas antes de cerrar." };
  const resultado = {
    ...d.resultado, errores: [], avisos: d.resultado.errores,
    // Para rastrear cada peso: los pagos que contó este mes.
    pagos: d.pagos.map((p) => ({ tabla: p.tabla, id: p.id, obra: p.production_id, nombre: p.nombre, fecha: p.fecha_pago, monto: p.monto, recargo: p.perdonado ? 0 : p.recargo })),
  };
  const obrasRef = d.obras.map((o) => ({ id: o.production_id, nombre: o.nombre }));
  const personas = d.resultado.personas.map((p) => ({
    person_id: p.persona, nombre: p.nombre, pago: p.pago, bruto: p.bruto,
    partes: p.partes.map((x) => ({ ...x, nombreBolsa: nombreBolsa(x.bolsa, { obras: obrasRef, compartidas: d.nombres.compartidas }) })),
  }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_cerrar_mes", { p_periodo: `${mes}-01`, p_resultado: resultado, p_personas: personas });
  if (error) return { ok: false, message: mensajeError(error) };
  return listoMes(`Mes cerrado: ${personas.length} pagos por $${d.resultado.totalPagado.toLocaleString("es-MX")}. A cada quien ya le aparece su desglose.`);
}

/** Marcar pagado a una persona de un mes cerrado con la foto de la transferencia (ya subida y comprimida). */
export async function marcarPagado(_p: HonState, f: FormData): Promise<HonState> {
  const mes = str(f, "mes");
  if (!mesOk(mes)) return { ok: false, message: "Mes no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_marcar_pagado", { p_periodo: `${mes}-01`, p_person: str(f, "persona"), p_path: str(f, "path") });
  if (error) return { ok: false, message: mensajeError(error) };
  return listoMes("Pagado.");
}
