import { createClient } from "@/lib/supabase/server";
import { COMPARTIDA, bolsaCreativa, type HonConfig } from "@/lib/honorarios-rules";

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
