/** Honorarios (especificación de Diego y Patricio, 2026-11-18; por obra desde 0151). Cálculo puro: la página le pasa
 *  los pagos registrados, las reglas de cada obra, los gastos y bolsas compartidas, y las asignaciones. Aquí no hay
 *  montos, porcentajes ni obras fijos.
 *
 *  Mensual, por obra: cobrado − reserva − emergencia usada − su parte de cada gasto compartido (renta del salón,
 *  gastos varios… divididos en partes iguales entre las obras que los comparten) − sus gastos propios = neto.
 *  Del neto: su % creativo a la bolsa creativa de la obra, su % compartido a la bolsa compartida a la que pertenece,
 *  y lo que quede, a la empresa. Fondo creativo común (si se aprueba): entre las obras que participan, su % de cada
 *  bolsa creativa se junta y se reparte en partes iguales. Cada persona cobra su % de cada bolsa; el pago se redondea
 *  hacia abajo y lo que sobra va a la reserva.
 *  Cierre de temporada: ganancia = boletos + patrocinios − costos − préstamos de la reserva; se reparte con el reparto
 *  de la obra entre empresa, creativos (su bolsa), compartida (la suya) y Casa DARF (cabezas / resto, partes iguales). */

export type Asignacion = { bolsa: string; persona: string; nombre: string; puesto?: string | null; pct: number };

/** Clave de la bolsa creativa de una obra y de una bolsa compartida. ("compartida" sola: la de antes de 0151.) */
export const bolsaCreativa = (obraId: string) => `creativa:${obraId}`;
export const bolsaCompartida = (id: string) => `compartida:${id}`;
export const COMPARTIDA = "compartida";

/** Reglas globales (de toda la empresa). */
export type HonGlobal = { redondeo: number; umbralAlumnos: number; fondoPct: number };
/** Reglas mensuales de una obra. */
export type ObraReglas = {
  reservaPct: number; emergenciaPct: number; creativoPct: number; compartidaPct: number;
  /** Id de la bolsa compartida a la que aporta (o null). */
  compartida: string | null;
  gastosPropios: number;
  enFondo: boolean;
};
export type GastoComun = { id: string; nombre: string; monto: number; obras: string[] };
export type NombreRef = { obras: { id: string; nombre: string }[]; compartidas?: { id: string; nombre: string }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const abajo = (n: number, paso: number) => Math.floor(n / paso + 1e-9) * paso;

/** Bolsas cuyos porcentajes no suman 100 (con dos decimales de tolerancia). Si hay alguna, no se calcula. */
export function bolsasIncompletas(asig: Asignacion[], bolsas: string[]): { bolsa: string; suma: number }[] {
  return bolsas
    .map((b) => ({ bolsa: b, suma: r2(asig.filter((a) => a.bolsa === b).reduce((s, a) => s + a.pct, 0)) }))
    .filter((x) => Math.abs(x.suma - 100) > 0.005);
}

// ──────── Fechas del ciclo ────────

/** n-ésimo sábado de un mes (mes 1–12), como "AAAA-MM-DD". */
export function sabadoDelMes(anio: number, mes: number, n: 1 | 2): string {
  const d = new Date(Date.UTC(anio, mes - 1, 1));
  const primero = 1 + ((6 - d.getUTCDay() + 7) % 7);
  const dia = primero + (n - 1) * 7;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
/** El lunes después del 2.º sábado: día de pago al equipo. */
export function diaDePago(anio: number, mes: number): string {
  const s = new Date(`${sabadoDelMes(anio, mes, 2)}T12:00:00Z`);
  s.setUTCDate(s.getUTCDate() + 2);
  return s.toISOString().slice(0, 10);
}
/** A qué mes de reparto ("AAAA-MM") cuenta un pago hecho en esa fecha ("AAAA-MM-DD"): hasta el 2.º sábado de su mes
 *  cuenta para ese mes; después, para el siguiente. */
export function mesDeReparto(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  if (fecha <= sabadoDelMes(a, m, 2)) return `${a}-${String(m).padStart(2, "0")}`;
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

// ──────── Cálculo mensual ────────

export type ObraMesEntrada = { id: string; nombre: string; cobrado: number; alumnos: number; emergenciaUso: number; reglas: ObraReglas };
export type ObraMesResultado = Omit<ObraMesEntrada, "reglas"> & {
  reglas: ObraReglas;
  reserva: number; emergenciaMax: number;
  /** Su parte de cada gasto compartido y sus gastos propios. */
  descuentos: { nombre: string; monto: number }[];
  neto: number; sinReparto: boolean;
  creativa: number; creativaFinal: number; aporteCompartida: number; empresa: number;
};
/** nombreBolsa: se guarda al cerrar el mes, para que cada integrante lea "Creativa Grease" sin ver la configuración. */
export type Parte = { bolsa: string; pct: number; base: number; monto: number; nombreBolsa?: string };
export type PagoPersona = { persona: string; nombre: string; partes: Parte[]; bruto: number; pago: number };

export type MesResultado = {
  obras: ObraMesResultado[];
  /** Monto de cada bolsa compartida (por id). */
  compartidas: { id: string; monto: number }[];
  /** Entre las obras del fondo común, la diferencia de alumnos llega al umbral: se puede pedir el fondo. */
  alertaFondo: boolean;
  fondoAplicado: boolean;
  fondo: number;
  personas: PagoPersona[];
  totalPagado: number;
  sobranteRedondeo: number;
  /** Reserva del mes: la reserva de cada obra + recargos cobrados + sobrante del redondeo. */
  reservaMes: number;
  errores: string[];
};

export function calcularMes(p: {
  global: HonGlobal; obras: ObraMesEntrada[]; gastos: GastoComun[]; asignaciones: Asignacion[]; fondoComun: boolean; recargos?: number;
  nombres?: NombreRef;
}): MesResultado {
  const { global: g, asignaciones } = p;
  const errores: string[] = [];
  const ref: NombreRef = p.nombres ?? { obras: p.obras };
  const ids = new Set(p.obras.map((o) => o.id));

  for (const o of p.obras) {
    const r = o.reglas;
    if (r.creativoPct + r.compartidaPct > 100.005) errores.push(`${o.nombre}: lo creativo y lo compartido suman más de 100 %.`);
    if (r.compartidaPct > 0 && !r.compartida) errores.push(`${o.nombre}: tiene % compartido pero no pertenece a ninguna bolsa compartida.`);
  }
  const compIds = [...new Set(p.obras.map((o) => (o.reglas.compartidaPct > 0 ? o.reglas.compartida : null)).filter((x): x is string => !!x))];
  const bolsas = [...p.obras.filter((o) => o.reglas.creativoPct > 0).map((o) => bolsaCreativa(o.id)), ...compIds.map(bolsaCompartida)];
  for (const b of bolsasIncompletas(asignaciones, bolsas)) errores.push(`Los porcentajes de la bolsa ${nombreBolsa(b.bolsa, ref)} suman ${b.suma} %, no 100 %.`);

  // Cada gasto compartido se divide en partes iguales entre las obras que lo comparten y están en este mes.
  const parteDe = (o: string) => p.gastos
    .map((x) => ({ x, entre: x.obras.filter((id) => ids.has(id)) }))
    .filter(({ entre }) => entre.includes(o))
    .map(({ x, entre }) => ({ nombre: x.nombre, monto: r2(x.monto / entre.length) }));

  const obras: ObraMesResultado[] = p.obras.map((o) => {
    const r = o.reglas;
    const reserva = r2(o.cobrado * r.reservaPct / 100);
    const emergenciaMax = r2(o.cobrado * r.emergenciaPct / 100);
    const uso = Math.min(Math.max(o.emergenciaUso, 0), emergenciaMax);
    const descuentos = [...parteDe(o.id), ...(r.gastosPropios > 0 ? [{ nombre: "Gastos propios", monto: r2(r.gastosPropios) }] : [])];
    const netoCalc = r2(o.cobrado - reserva - uso - descuentos.reduce((s, x) => s + x.monto, 0));
    const sinReparto = netoCalc <= 0;
    const neto = sinReparto ? 0 : netoCalc;
    const creativa = r2(neto * r.creativoPct / 100);
    const aporte = r.compartida ? r2(neto * r.compartidaPct / 100) : 0;
    return { ...o, emergenciaUso: uso, reserva, emergenciaMax, descuentos, neto: netoCalc, sinReparto, creativa, creativaFinal: creativa, aporteCompartida: aporte, empresa: r2(neto - creativa - aporte) };
  });
  for (const o of obras) if (o.sinReparto) errores.push(`${o.nombre}: el neto salió en ${o.neto.toLocaleString("es-MX")}; este mes no reparte (el faltante se resuelve aparte, nunca con la reserva).`);

  const delFondo = obras.filter((o) => o.reglas.enFondo);
  const alumnos = delFondo.map((o) => o.alumnos);
  const alertaFondo = alumnos.length > 1 && Math.max(...alumnos) - Math.min(...alumnos) >= g.umbralAlumnos;
  let fondo = 0;
  const fondoAplicado = p.fondoComun && delFondo.length > 1;
  if (fondoAplicado) {
    fondo = r2(delFondo.reduce((s, o) => s + o.creativa, 0) * g.fondoPct / 100);
    for (const o of delFondo) o.creativaFinal = r2(o.creativa * (100 - g.fondoPct) / 100 + fondo / delFondo.length);
  }
  const compartidas = compIds.map((id) => ({ id, monto: r2(obras.filter((o) => o.reglas.compartida === id).reduce((s, o) => s + o.aporteCompartida, 0)) }));
  const montoBolsa = new Map<string, number>([
    ...obras.map((o) => [bolsaCreativa(o.id), o.creativaFinal] as const),
    ...compartidas.map((c) => [bolsaCompartida(c.id), c.monto] as const),
  ]);

  const personas = repartir(asignaciones, montoBolsa, g.redondeo);
  const totalPagado = personas.reduce((s, x) => s + x.pago, 0);
  const sobranteRedondeo = r2(personas.reduce((s, x) => s + x.bruto, 0) - totalPagado);
  const reservaMes = r2(obras.reduce((s, o) => s + o.reserva, 0) + (p.recargos ?? 0) + sobranteRedondeo);
  return { obras, compartidas, alertaFondo, fondoAplicado, fondo, personas, totalPagado, sobranteRedondeo, reservaMes, errores };
}

/** Reparte el monto de cada bolsa con los % de cada persona y redondea su total hacia abajo. */
function repartir(asignaciones: Asignacion[], montoBolsa: Map<string, number>, paso: number): PagoPersona[] {
  const porPersona = new Map<string, PagoPersona>();
  for (const a of asignaciones) {
    const base = montoBolsa.get(a.bolsa);
    if (base === undefined) continue;
    const x = porPersona.get(a.persona) ?? { persona: a.persona, nombre: a.nombre, partes: [], bruto: 0, pago: 0 };
    const monto = r2(base * a.pct / 100);
    x.partes.push({ bolsa: a.bolsa, pct: a.pct, base, monto });
    x.bruto = r2(x.bruto + monto);
    porPersona.set(a.persona, x);
  }
  return [...porPersona.values()].map((x) => ({ ...x, pago: abajo(x.bruto, paso) })).sort((a, b) => b.pago - a.pago || a.nombre.localeCompare(b.nombre, "es"));
}

export function nombreBolsa(bolsa: string, ref: NombreRef | { id: string; nombre: string }[]): string {
  const r: NombreRef = Array.isArray(ref) ? { obras: ref } : ref;
  if (bolsa === COMPARTIDA) return "Compartida";
  if (bolsa === CASA_CABEZAS) return "Casa DARF · cabezas";
  if (bolsa === CASA_OTROS) return "Casa DARF · integrantes";
  if (bolsa === EMPRESA) return "Empresa";
  if (bolsa.startsWith("compartida:")) {
    const id = bolsa.slice("compartida:".length);
    return r.compartidas?.find((c) => c.id === id)?.nombre ?? "Compartida";
  }
  const id = bolsa.replace(/^creativa:/, "");
  return `Creativa ${r.obras.find((o) => o.id === id)?.nombre ?? id}`;
}

const pesos2 = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Una línea del desglose: "Creativa Grease 29 % de $10,110.00 = $2,931.90". */
export function lineaParte(p: Parte, ref: NombreRef | { id: string; nombre: string }[]): string {
  return `${p.nombreBolsa ?? nombreBolsa(p.bolsa, ref)} ${p.pct} % de ${pesos2(p.base)} = ${pesos2(p.monto)}`;
}

// ──────── Cierre de temporada ────────

export const CASA_CABEZAS = "casa:cabezas";
export const CASA_OTROS = "casa:otros";
export const EMPRESA = "empresa";

export type CierreReparto = { empresaPct: number; creativosPct: number; compartidaPct: number; casaPct: number; casaCabezasPct: number };
export type CierreEntrada = { boletos: number; patrocinios: number; costos: number; prestamos: number };
export type CierreResultado = {
  ganancia: number; sinReparto: boolean;
  partes: { empresa: number; creativos: number; compartida: number; casa: number; casaCabezas: number; casaOtros: number };
  personas: PagoPersona[]; totalPagado: number; sobranteRedondeo: number; errores: string[];
};

/** Cierre de una obra. La bolsa creativa es la de su equipo (en Showman, el equipo con el 45 %); `compartida` es la
 *  bolsa compartida de la obra (o null); `cabezas` y `otros`, quienes están en Casa DARF en ese momento. */
export function calcularCierre(p: {
  obra: { id: string; nombre: string }; entrada: CierreEntrada; reparto: CierreReparto; asignaciones: Asignacion[];
  compartida?: string | null;
  cabezas: { persona: string; nombre: string }[]; otros: { persona: string; nombre: string }[]; redondeo: number;
  nombres?: NombreRef;
}): CierreResultado {
  const { entrada: e, reparto: rp } = p;
  const errores: string[] = [];
  const ref: NombreRef = p.nombres ?? { obras: [p.obra] };
  const suma = r2(rp.empresaPct + rp.creativosPct + rp.compartidaPct + rp.casaPct);
  if (Math.abs(suma - 100) > 0.005) errores.push(`El reparto del cierre suma ${suma} %, no 100 %.`);
  const comp = p.compartida ? bolsaCompartida(p.compartida) : null;
  if (rp.compartidaPct > 0 && !comp) errores.push(`${p.obra.nombre}: el cierre tiene % compartido pero la obra no pertenece a ninguna bolsa compartida.`);
  const bolsas = [bolsaCreativa(p.obra.id), ...(rp.compartidaPct > 0 && comp ? [comp] : [])];
  for (const b of bolsasIncompletas(p.asignaciones, bolsas)) errores.push(`Los porcentajes de la bolsa ${nombreBolsa(b.bolsa, ref)} suman ${b.suma} %, no 100 %.`);

  const ganancia = r2(e.boletos + e.patrocinios - e.costos - e.prestamos);
  const sinReparto = ganancia <= 0;
  const g = sinReparto ? 0 : ganancia;
  const casa = r2(g * rp.casaPct / 100);
  const partes = {
    empresa: r2(g * rp.empresaPct / 100), creativos: r2(g * rp.creativosPct / 100), compartida: r2(g * rp.compartidaPct / 100),
    casa, casaCabezas: r2(casa * rp.casaCabezasPct / 100), casaOtros: r2(casa - r2(casa * rp.casaCabezasPct / 100)),
  };
  const asig: Asignacion[] = [
    ...p.asignaciones.filter((a) => bolsas.includes(a.bolsa)),
    ...p.cabezas.map((x) => ({ bolsa: CASA_CABEZAS, persona: x.persona, nombre: x.nombre, pct: 100 / p.cabezas.length })),
    ...p.otros.map((x) => ({ bolsa: CASA_OTROS, persona: x.persona, nombre: x.nombre, pct: 100 / p.otros.length })),
  ];
  const montoBolsa = new Map<string, number>([
    [bolsaCreativa(p.obra.id), partes.creativos], ...(comp ? [[comp, partes.compartida] as const] : []),
    [CASA_CABEZAS, partes.casaCabezas], [CASA_OTROS, partes.casaOtros],
  ]);
  const personas = sinReparto ? [] : repartir(asig, montoBolsa, p.redondeo);
  const totalPagado = personas.reduce((s, x) => s + x.pago, 0);
  const sobranteRedondeo = r2(personas.reduce((s, x) => s + x.bruto, 0) - totalPagado);
  if (sinReparto) errores.push(`La ganancia salió en ${ganancia.toLocaleString("es-MX")}: no hay reparto (nadie devuelve lo ya cobrado).`);
  return { ganancia, sinReparto, partes, personas, totalPagado, sobranteRedondeo, errores };
}
