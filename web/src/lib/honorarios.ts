import { createClient } from "@/lib/supabase/server";
import { COMPARTIDA, bolsaCreativa, calcularMes, diaDePago, sabadoDelMes, type HonConfig, type MesResultado, type ObraMesEntrada, type Parte } from "@/lib/honorarios-rules";

/** Honorarios (0149): lectura para las cabezas. La base (RLS) solo deja ver esto a las cabezas de DARF. */

export type HonConfigFila = {
  id: string; vigente_desde: string; reserva_pct: number; reserva_meta: number; emergencia_pct: number; renta: number; gastos: number;
  creativo_pct: number; recargo: number; redondeo: number; umbral_alumnos: number; fondo_pct: number;
  cierre_empresa_pct: number; cierre_creativos_pct: number; cierre_compartida_pct: number; cierre_casa_pct: number; casa_cabezas_pct: number;
  created_at: string;
};
export type HonObra = {
  production_id: string; nombre: string; mensual: boolean; activa: boolean; orden: number;
  cierre_empresa_pct: number | null; cierre_creativos_pct: number | null; cierre_compartida_pct: number | null; cierre_casa_pct: number | null;
  /** Mensualidad de la obra (production_fees) y si se paga el 1.er sábado con corte el 2.º. */
  mensualidad: number | null; inscripcion: number | null; venceSabado: boolean;
};
export type HonAsignacion = { id: string; bolsa: string; person_id: string; nombre: string; puesto: string | null; pct: number; desde: string; hasta: string | null };

export const configNum = (c: HonConfigFila): HonConfig => ({
  reservaPct: Number(c.reserva_pct), emergenciaPct: Number(c.emergencia_pct), renta: Number(c.renta), gastos: Number(c.gastos),
  creativoPct: Number(c.creativo_pct), redondeo: Number(c.redondeo), umbralAlumnos: Number(c.umbral_alumnos), fondoPct: Number(c.fondo_pct),
});

/** La versión vigente en una fecha ("AAAA-MM-DD"). */
export const configEn = (versiones: HonConfigFila[], fecha: string) =>
  [...versiones].filter((v) => v.vigente_desde <= fecha).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null;

export async function getHonorarios() {
  const supabase = await createClient();
  const [cfg, obras, asig, fees, casa] = await Promise.all([
    supabase.from("hon_config").select("*").order("vigente_desde", { ascending: false }),
    supabase.from("hon_obras").select("*, productions(nombre)").order("orden"),
    supabase.from("hon_asignaciones").select("id, bolsa, person_id, puesto, pct, desde, hasta, people(nombre)").order("desde"),
    supabase.from("production_fees").select("production_id, monto, inscripcion, vence_sabado"),
    supabase.rpc("hon_casa_integrantes"),
  ]);
  const fee = new Map(((fees.data ?? []) as { production_id: string; monto: number; inscripcion: number; vence_sabado: boolean }[]).map((f) => [f.production_id, f]));
  const obrasOut: HonObra[] = ((obras.data ?? []) as unknown as (Omit<HonObra, "nombre" | "mensualidad" | "inscripcion" | "venceSabado"> & { productions: { nombre: string } | null })[]).map((o) => ({
    ...o, nombre: o.productions?.nombre ?? o.production_id,
    mensualidad: fee.get(o.production_id) ? Number(fee.get(o.production_id)!.monto) : null,
    inscripcion: fee.get(o.production_id) ? Number(fee.get(o.production_id)!.inscripcion) : null,
    venceSabado: !!fee.get(o.production_id)?.vence_sabado,
  }));
  const asignaciones: HonAsignacion[] = ((asig.data ?? []) as unknown as (Omit<HonAsignacion, "nombre"> & { people: { nombre: string } | null })[])
    .map((a) => ({ ...a, pct: Number(a.pct), nombre: a.people?.nombre ?? "—" }));
  return {
    versiones: (cfg.data ?? []) as HonConfigFila[],
    obras: obrasOut,
    asignaciones,
    casa: (casa.data ?? []) as { user_id: string; person_id: string | null; nombre: string; cabeza: boolean }[],
  };
}

/** Bolsas del módulo: la creativa de cada obra (en Showman, su equipo) y la compartida. */
export function bolsasDe(obras: HonObra[]): { clave: string; nombre: string; ayuda: string }[] {
  return [
    ...obras.map((o) => ({
      clave: bolsaCreativa(o.production_id),
      nombre: o.mensual ? `Creativa · ${o.nombre}` : `Equipo · ${o.nombre}`,
      ayuda: o.mensual ? "Recibe el % creativo del neto de cada mes y la parte de creativos del cierre." : "Solo cobra al cierre de temporada.",
    })),
    { clave: COMPARTIDA, nombre: "Compartida", ayuda: "Una sola para todas las obras con mensualidad: el % compartido del neto de cada mes y la parte compartida del cierre." },
  ];
}

/** Asignaciones vigentes en una fecha. */
export const vigentesEn = (a: HonAsignacion[], fecha: string) => a.filter((x) => x.desde <= fecha && (!x.hasta || x.hasta > fecha));

// ──────── El mes (0150) ────────

export type PagoMes = { tabla: "cuenta" | "ficha"; id: string; production_id: string; alumno: string; nombre: string; periodo: string; fecha_pago: string; monto: number; recargo: number; perdonado: boolean };
export type MesCerrado = { periodo: string; fondo_aplicado: boolean; total_pagado: number; reserva_mes: number; resultado: MesResultado & { personasIds?: Record<string, string> }; cerrado_por: string | null; cerrado_at: string };

/** "AAAA-MM" → primer día ("AAAA-MM-01"). */
export const primerDia = (mes: string) => `${mes}-01`;

/** Todo lo de un mes: si ya se cerró, lo guardado; si no, el cálculo con los pagos registrados hasta hoy. */
export async function getMes(mes: string) {
  const supabase = await createClient();
  const periodo = primerDia(mes);
  const [anio, m] = mes.split("-").map(Number);
  const corte = sabadoDelMes(anio, m, 2);
  const [base, pagosRes, emerg, aprob, cabezas, cerrado, personasRes, fondoOk] = await Promise.all([
    getHonorarios(),
    supabase.rpc("hon_pagos_mes", { p_periodo: periodo }),
    supabase.from("hon_mes_obra").select("production_id, emergencia_uso, nota").eq("periodo", periodo),
    supabase.from("hon_fondo_aprobaciones").select("user_id, aprobado_at").eq("periodo", periodo),
    supabase.rpc("hon_cabezas"),
    supabase.from("hon_meses").select("*").eq("periodo", periodo).maybeSingle(),
    supabase.from("hon_mes_personas").select("person_id, nombre, pago, bruto, partes").eq("periodo", periodo),
    supabase.rpc("hon_fondo_aprobado", { p_periodo: periodo }),
  ]);
  const pagos = ((pagosRes.data ?? []) as PagoMes[]).map((p) => ({ ...p, monto: Number(p.monto), recargo: Number(p.recargo) }));
  const obras = base.obras.filter((o) => o.mensual && (o.activa || pagos.some((p) => p.production_id === o.production_id)));
  const cfgFila = configEn(base.versiones, corte);
  const usoDe = new Map(((emerg.data ?? []) as { production_id: string; emergencia_uso: number; nota: string | null }[]).map((e) => [e.production_id, e]));
  const entradas: ObraMesEntrada[] = obras.map((o) => {
    const suyos = pagos.filter((p) => p.production_id === o.production_id);
    return {
      id: o.production_id, nombre: o.nombre, cobrado: suyos.reduce((s, p) => s + p.monto, 0),
      alumnos: new Set(suyos.map((p) => `${p.tabla}:${p.alumno}`)).size, emergenciaUso: Number(usoDe.get(o.production_id)?.emergencia_uso ?? 0),
    };
  });
  const asig = vigentesEn(base.asignaciones, corte).filter((a) => a.bolsa === COMPARTIDA || obras.some((o) => a.bolsa === bolsaCreativa(o.production_id)));
  const recargos = pagos.filter((p) => !p.perdonado).reduce((s, p) => s + p.recargo, 0);
  const listaCabezas = (cabezas.data ?? []) as { user_id: string; nombre: string }[];
  const aprobaciones = (aprob.data ?? []) as { user_id: string; aprobado_at: string }[];
  const sinFondo = cfgFila ? calcularMes({
    config: configNum(cfgFila), obras: entradas, fondoComun: false, recargos,
    asignaciones: asig.map((a) => ({ bolsa: a.bolsa, persona: a.person_id, nombre: a.nombre, puesto: a.puesto, pct: a.pct })),
  }) : null;
  const fondoAprobado = fondoOk.data === true;
  const resultado = cfgFila && sinFondo?.alertaFondo && fondoAprobado ? calcularMes({
    config: configNum(cfgFila), obras: entradas, fondoComun: true, recargos,
    asignaciones: asig.map((a) => ({ bolsa: a.bolsa, persona: a.person_id, nombre: a.nombre, puesto: a.puesto, pct: a.pct })),
  }) : sinFondo;
  return {
    mes, periodo, corte, primerSabado: sabadoDelMes(anio, m, 1), diaPago: diaDePago(anio, m),
    config: cfgFila, obras, pagos, emergencia: usoDe, resultado, recargos,
    fondo: { aprobado: fondoAprobado, cabezas: listaCabezas, aprobaciones },
    cerrado: (cerrado.data as MesCerrado | null) ?? null,
    personasCerrado: ((personasRes.data ?? []) as { person_id: string; nombre: string; pago: number; bruto: number; partes: Parte[] }[]),
  };
}
