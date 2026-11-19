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

const CAMPOS = [
  "reserva_pct", "reserva_meta", "emergencia_pct", "renta", "gastos", "creativo_pct", "recargo", "redondeo", "umbral_alumnos", "fondo_pct",
  "cierre_empresa_pct", "cierre_creativos_pct", "cierre_compartida_pct", "cierre_casa_pct", "casa_cabezas_pct",
] as const;

/** Nueva versión de la configuración desde una fecha (si ya hay una con esa fecha, se corrige). */
export async function guardarConfig(_p: HonState, f: FormData): Promise<HonState> {
  const desde = str(f, "vigente_desde");
  if (!fechaOk(desde)) return { ok: false, message: "Elige desde qué fecha aplica." };
  const fila: Record<string, number | string> = { vigente_desde: desde };
  for (const c of CAMPOS) {
    const v = num(f, c);
    if (!Number.isFinite(v) || v < 0) return { ok: false, message: "Revisa los valores: todos deben ser números de 0 en adelante." };
    fila[c] = v;
  }
  const suma = ["cierre_empresa_pct", "cierre_creativos_pct", "cierre_compartida_pct", "cierre_casa_pct"].reduce((s, k) => s + Number(fila[k]), 0);
  if (Math.abs(suma - 100) > 0.001) return { ok: false, message: `El reparto del cierre suma ${suma} %; debe sumar 100 %.` };
  const supabase = await createClient();
  const { error } = await supabase.from("hon_config").upsert(fila, { onConflict: "vigente_desde" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(`Configuración guardada; aplica desde el ${desde.split("-").reverse().join("/")}. Lo anterior queda en el historial.`);
}

/** Agregar una obra al módulo o cambiar su tipo, si está activa y su reparto de cierre propio. */
export async function guardarObra(_p: HonState, f: FormData): Promise<HonState> {
  const pid = str(f, "production_id");
  if (!pid) return { ok: false, message: "Elige la obra." };
  const propio = f.get("cierre_propio") === "on";
  const pcts = ["cierre_empresa_pct", "cierre_creativos_pct", "cierre_compartida_pct", "cierre_casa_pct"].map((k) => num(f, k));
  if (propio && (pcts.some((v) => !Number.isFinite(v) || v < 0) || Math.abs(pcts.reduce((s, v) => s + v, 0) - 100) > 0.001)) {
    return { ok: false, message: "El reparto del cierre de la obra debe sumar 100 %." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("hon_obras").upsert({
    production_id: pid, mensual: str(f, "mensual") !== "0", activa: str(f, "activa") !== "0", updated_at: new Date().toISOString(),
    cierre_empresa_pct: propio ? pcts[0] : null, cierre_creativos_pct: propio ? pcts[1] : null,
    cierre_compartida_pct: propio ? pcts[2] : null, cierre_casa_pct: propio ? pcts[3] : null,
  }, { onConflict: "production_id" });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo("Obra guardada.");
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
    partes: p.partes.map((x) => ({ ...x, nombreBolsa: nombreBolsa(x.bolsa, obrasRef) })),
  }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_cerrar_mes", { p_periodo: `${mes}-01`, p_resultado: resultado, p_personas: personas });
  if (error) return { ok: false, message: mensajeError(error) };
  return listoMes(`Mes cerrado: ${personas.length} pagos por $${d.resultado.totalPagado.toLocaleString("es-MX")}. A cada quien ya le aparece su desglose.`);
}
