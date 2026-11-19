import { createClient } from "@/lib/supabase/server";
import {
  bolsaCompartida, bolsaCreativa, calcularMes, diaDePago, sabadoDelMes,
  type GastoComun, type HonGlobal, type MesResultado, type NombreRef, type ObraMesEntrada, type ObraReglas, type Parte,
} from "@/lib/honorarios-rules";

/** Honorarios (0149–0151): lectura para las cabezas. La base (RLS) solo deja ver esto a las cabezas de DARF.
 *  Lo global en hon_config; cada obra con sus reglas; bolsas y gastos compartidos entre las obras que se elijan. */

export type HonConfigFila = {
  id: string; vigente_desde: string; reserva_meta: number; recargo: number; redondeo: number; umbral_alumnos: number; fondo_pct: number;
  casa_cabezas_pct: number; created_at: string;
};
export type ReglasFila = {
  production_id: string; vigente_desde: string; reserva_pct: number; emergencia_pct: number; creativo_pct: number; compartida_pct: number;
  gastos_propios: number; en_fondo: boolean; cierre_empresa_pct: number; cierre_creativos_pct: number; cierre_compartida_pct: number; cierre_casa_pct: number;
};
export type HonObra = {
  production_id: string; nombre: string; mensual: boolean; activa: boolean; orden: number;
  /** Mensualidad de la obra (production_fees) y si se paga el 1.er sábado con corte el 2.º. */
  mensualidad: number | null; inscripcion: number | null; venceSabado: boolean;
  /** Meses en que se cobra la mensualidad ("AAAA-MM-01"; production_fees) y si la obra cobra. Fuera de ese rango la
   *  obra no entra al reparto del mes (ni carga renta ni gastos). */
  cobroDesde: string | null; cobroHasta: string | null; cobra: boolean;
};

/** ¿La obra reparte ese mes? Solo si cobra mensualidad en ese mes ("AAAA-MM-01"). */
export const cobraEnMes = (o: Pick<HonObra, "cobroDesde" | "cobroHasta" | "cobra">, periodo: string) =>
  o.cobra && !!o.cobroDesde && periodo >= o.cobroDesde.slice(0, 7) + "-01" && (!o.cobroHasta || periodo <= o.cobroHasta.slice(0, 7) + "-01");
export type HonAsignacion = { id: string; bolsa: string; person_id: string; nombre: string; puesto: string | null; pct: number; desde: string; hasta: string | null };
export type Compartida = { id: string; nombre: string; versiones: { vigente_desde: string; obras: string[] }[] };
export type Gasto = { id: string; nombre: string; versiones: { vigente_desde: string; monto: number; obras: string[] }[] };

/** La versión vigente en una fecha ("AAAA-MM-DD") de una lista con vigente_desde. */
export function vigente<T extends { vigente_desde: string }>(versiones: T[], fecha: string): T | null {
  return [...versiones].filter((v) => v.vigente_desde <= fecha).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null;
}
export const configEn = (versiones: HonConfigFila[], fecha: string) => vigente(versiones, fecha);
export const globalNum = (c: HonConfigFila): HonGlobal => ({ redondeo: Number(c.redondeo), umbralAlumnos: Number(c.umbral_alumnos), fondoPct: Number(c.fondo_pct) });

/** Las reglas de una obra en una fecha, con la bolsa compartida a la que aporta en esa fecha. */
export function reglasEn(reglas: ReglasFila[], compartidas: Compartida[], obra: string, fecha: string): (ObraReglas & { fila: ReglasFila }) | null {
  const r = vigente(reglas.filter((x) => x.production_id === obra), fecha);
  if (!r) return null;
  const comp = compartidas.find((c) => vigente(c.versiones, fecha)?.obras.includes(obra)) ?? null;
  return {
    fila: r, reservaPct: Number(r.reserva_pct), emergenciaPct: Number(r.emergencia_pct), creativoPct: Number(r.creativo_pct),
    compartidaPct: Number(r.compartida_pct), compartida: comp?.id ?? null, gastosPropios: Number(r.gastos_propios), enFondo: r.en_fondo,
  };
}
/** Gastos compartidos vigentes en una fecha. */
export const gastosEn = (gastos: Gasto[], fecha: string): GastoComun[] =>
  gastos.map((g) => ({ g, v: vigente(g.versiones, fecha) })).filter(({ v }) => v && Number(v.monto) > 0)
    .map(({ g, v }) => ({ id: g.id, nombre: g.nombre, monto: Number(v!.monto), obras: v!.obras }));

export async function getHonorarios() {
  const supabase = await createClient();
  const [cfg, obras, asig, fees, casa, reglas, comps, compVer, gastos, gastoVer] = await Promise.all([
    supabase.from("hon_config").select("*").order("vigente_desde", { ascending: false }),
    supabase.from("hon_obras").select("production_id, mensual, activa, orden, productions(nombre)").order("orden"),
    supabase.from("hon_asignaciones").select("id, bolsa, person_id, puesto, pct, desde, hasta, people(nombre)").order("desde"),
    supabase.from("production_fees").select("production_id, monto, inscripcion, vence_sabado, desde, hasta, cobrar"),
    supabase.rpc("hon_casa_integrantes"),
    supabase.from("hon_obra_reglas").select("*").order("vigente_desde"),
    supabase.from("hon_compartidas").select("id, nombre").order("created_at"),
    supabase.from("hon_compartida_obras").select("compartida_id, vigente_desde, obras"),
    supabase.from("hon_gastos").select("id, nombre").order("created_at"),
    supabase.from("hon_gasto_versiones").select("gasto_id, vigente_desde, monto, obras"),
  ]);
  const fee = new Map(((fees.data ?? []) as { production_id: string; monto: number; inscripcion: number; vence_sabado: boolean; desde: string; hasta: string; cobrar: boolean }[]).map((f) => [f.production_id, f]));
  const obrasOut: HonObra[] = ((obras.data ?? []) as unknown as (Omit<HonObra, "nombre" | "mensualidad" | "inscripcion" | "venceSabado"> & { productions: { nombre: string } | null })[]).map((o) => ({
    production_id: o.production_id, mensual: o.mensual, activa: o.activa, orden: o.orden, nombre: o.productions?.nombre ?? o.production_id,
    mensualidad: fee.get(o.production_id) ? Number(fee.get(o.production_id)!.monto) : null,
    inscripcion: fee.get(o.production_id) ? Number(fee.get(o.production_id)!.inscripcion) : null,
    venceSabado: !!fee.get(o.production_id)?.vence_sabado,
    cobroDesde: fee.get(o.production_id)?.desde ?? null, cobroHasta: fee.get(o.production_id)?.hasta ?? null,
    cobra: fee.get(o.production_id)?.cobrar ?? false,
  }));
  const asignaciones: HonAsignacion[] = ((asig.data ?? []) as unknown as (Omit<HonAsignacion, "nombre"> & { people: { nombre: string } | null })[])
    .map((a) => ({ ...a, pct: Number(a.pct), nombre: a.people?.nombre ?? "—" }));
  const cv = (compVer.data ?? []) as { compartida_id: string; vigente_desde: string; obras: string[] }[];
  const gv = (gastoVer.data ?? []) as { gasto_id: string; vigente_desde: string; monto: number; obras: string[] }[];
  return {
    versiones: (cfg.data ?? []) as HonConfigFila[],
    obras: obrasOut,
    asignaciones,
    casa: (casa.data ?? []) as { user_id: string; person_id: string | null; nombre: string; cabeza: boolean }[],
    reglas: (reglas.data ?? []) as ReglasFila[],
    compartidas: ((comps.data ?? []) as { id: string; nombre: string }[]).map((c) => ({ ...c, versiones: cv.filter((v) => v.compartida_id === c.id).map((v) => ({ vigente_desde: v.vigente_desde, obras: v.obras ?? [] })) })) as Compartida[],
    gastos: ((gastos.data ?? []) as { id: string; nombre: string }[]).map((g) => ({ ...g, versiones: gv.filter((v) => v.gasto_id === g.id).map((v) => ({ vigente_desde: v.vigente_desde, monto: Number(v.monto), obras: v.obras ?? [] })) })) as Gasto[],
  };
}
export type Honorarios = Awaited<ReturnType<typeof getHonorarios>>;

/** Para nombrar bolsas: obras y compartidas. */
export const nombresDe = (h: Pick<Honorarios, "obras" | "compartidas">): NombreRef => ({
  obras: h.obras.map((o) => ({ id: o.production_id, nombre: o.nombre })),
  compartidas: h.compartidas.map((c) => ({ id: c.id, nombre: c.nombre })),
});

/** Bolsas del módulo: la creativa de cada obra (en las de solo temporada, su equipo) y cada compartida. */
export function bolsasDe(h: Pick<Honorarios, "obras" | "compartidas">, fecha: string): { clave: string; nombre: string; ayuda: string }[] {
  const nom = new Map(h.obras.map((o) => [o.production_id, o.nombre]));
  return [
    ...h.obras.map((o) => ({
      clave: bolsaCreativa(o.production_id),
      nombre: o.mensual ? `Creativa · ${o.nombre}` : `Equipo · ${o.nombre}`,
      ayuda: o.mensual ? "Recibe el % creativo del neto de cada mes y la parte de creativos del cierre." : "Solo cobra al cierre de temporada.",
    })),
    ...h.compartidas.map((c) => ({
      clave: bolsaCompartida(c.id), nombre: c.nombre,
      ayuda: `Bolsa compartida entre: ${(vigente(c.versiones, fecha)?.obras ?? []).map((id) => nom.get(id) ?? id).join(", ") || "ninguna obra todavía"}.`,
    })),
  ];
}

/** Asignaciones vigentes en una fecha. */
export const vigentesEn = (a: HonAsignacion[], fecha: string) => a.filter((x) => x.desde <= fecha && (!x.hasta || x.hasta > fecha));

// ──────── El mes (0150) ────────

export type PagoMes = { tabla: "cuenta" | "ficha"; id: string; production_id: string; alumno: string; nombre: string; periodo: string; fecha_pago: string; monto: number; recargo: number; perdonado: boolean };
export type MesCerrado = { periodo: string; fondo_aplicado: boolean; total_pagado: number; reserva_mes: number; resultado: MesResultado; cerrado_por: string | null; cerrado_at: string };

export type PersonaCerrada = { person_id: string; nombre: string; pago: number; bruto: number; partes: Parte[]; pagado_at: string | null; comprobante_path: string | null; recibido_at: string | null };

/** "AAAA-MM" → primer día ("AAAA-MM-01"). */
export const primerDia = (mes: string) => `${mes}-01`;

/** Todo lo de un mes: si ya se cerró, lo guardado; si no, el cálculo con los pagos registrados hasta hoy y las reglas
 *  de cada obra vigentes al corte. */
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
    supabase.from("hon_mes_personas").select("person_id, nombre, pago, bruto, partes, pagado_at, comprobante_path, recibido_at").eq("periodo", periodo),
    supabase.rpc("hon_fondo_aprobado", { p_periodo: periodo }),
  ]);
  const pagos = ((pagosRes.data ?? []) as PagoMes[]).map((p) => ({ ...p, monto: Number(p.monto), recargo: Number(p.recargo) }));
  // Entran las obras con mensualidad que ese mes cobran (rango de cobro de sus cuotas); si alguna tiene pagos que cuentan
  // aunque esté fuera de su rango, también entra (para no dejar dinero sin repartir).
  const conPagos = (o: HonObra) => pagos.some((p) => p.production_id === o.production_id);
  const obras = base.obras.filter((o) => o.mensual && ((o.activa && cobraEnMes(o, periodo)) || conPagos(o)));
  const fueraDeRango = base.obras.filter((o) => o.mensual && o.activa && !obras.includes(o)).map((o) => o.nombre);
  const cfgFila = configEn(base.versiones, corte);
  const usoDe = new Map(((emerg.data ?? []) as { production_id: string; emergencia_uso: number; nota: string | null }[]).map((e) => [e.production_id, e]));
  const sinReglas = obras.filter((o) => !reglasEn(base.reglas, base.compartidas, o.production_id, corte)).map((o) => o.nombre);
  const entradas: ObraMesEntrada[] = obras.filter((o) => !sinReglas.includes(o.nombre)).map((o) => {
    const suyos = pagos.filter((p) => p.production_id === o.production_id);
    return {
      id: o.production_id, nombre: o.nombre, cobrado: suyos.reduce((s, p) => s + p.monto, 0),
      alumnos: new Set(suyos.map((p) => `${p.tabla}:${p.alumno}`)).size, emergenciaUso: Number(usoDe.get(o.production_id)?.emergencia_uso ?? 0),
      reglas: reglasEn(base.reglas, base.compartidas, o.production_id, corte)!,
    };
  });
  const comps = new Set(entradas.map((e) => e.reglas.compartida).filter(Boolean) as string[]);
  const asig = vigentesEn(base.asignaciones, corte)
    .filter((a) => entradas.some((o) => a.bolsa === bolsaCreativa(o.id)) || [...comps].some((c) => a.bolsa === bolsaCompartida(c)))
    .map((a) => ({ bolsa: a.bolsa, persona: a.person_id, nombre: a.nombre, puesto: a.puesto, pct: a.pct }));
  const recargos = pagos.filter((p) => !p.perdonado).reduce((s, p) => s + p.recargo, 0);
  const listaCabezas = (cabezas.data ?? []) as { user_id: string; nombre: string }[];
  const aprobaciones = (aprob.data ?? []) as { user_id: string; aprobado_at: string }[];
  const nombres = nombresDe(base);
  const gastos = gastosEn(base.gastos, corte);
  const calcular = (fondo: boolean) => calcularMes({ global: globalNum(cfgFila!), obras: entradas, gastos, asignaciones: asig, fondoComun: fondo, recargos, nombres });
  const sinFondo = cfgFila ? calcular(false) : null;
  const fondoAprobado = fondoOk.data === true;
  const resultado = cfgFila && sinFondo?.alertaFondo && fondoAprobado ? calcular(true) : sinFondo;
  if (resultado && sinReglas.length) resultado.errores.unshift(`Sin reglas configuradas para este mes: ${sinReglas.join(", ")} (Honorarios, Obras).`);
  // Comprobantes de pago (0151): ligas temporales a la carpeta privada.
  const filasCerradas = (personasRes.data ?? []) as PersonaCerrada[];
  const paths = filasCerradas.map((p) => p.comprobante_path).filter((x): x is string => !!x);
  const firmadas = paths.length ? (await supabase.storage.from("honorarios").createSignedUrls(paths, 600)).data ?? [] : [];
  const urlDe = new Map(firmadas.map((x) => [x.path, x.signedUrl]));
  return {
    mes, periodo, corte, primerSabado: sabadoDelMes(anio, m, 1), diaPago: diaDePago(anio, m),
    config: cfgFila, obras, pagos, emergencia: usoDe, resultado, recargos, nombres, fueraDeRango,
    fondo: { aprobado: fondoAprobado, cabezas: listaCabezas, aprobaciones },
    cerrado: (cerrado.data as MesCerrado | null) ?? null,
    personasCerrado: filasCerradas.map((p) => ({ ...p, comprobanteUrl: p.comprobante_path ? urlDe.get(p.comprobante_path) ?? null : null })),
  };
}
