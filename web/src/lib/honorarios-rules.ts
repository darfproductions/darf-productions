/** Honorarios (especificación de Diego y Patricio, 2026-11-18). Cálculo puro: la página le pasa los pagos registrados,
 *  la configuración vigente y las asignaciones; aquí no hay montos ni porcentajes fijos.
 *
 *  Mensual (obras con mensualidad): por obra, cobrado − reserva − emergencia usada − renta − gastos = neto;
 *  neto × 60 % a la bolsa creativa de la obra y × 40 % a la bolsa compartida (una sola para todas). Con el fondo creativo
 *  común aprobado, 30 % de las bolsas creativas se junta y se reparte en partes iguales entre ellas. Cada persona cobra
 *  su % de cada bolsa; el pago se redondea hacia abajo a 10 pesos y lo que sobra va a la reserva.
 *  Cierre de temporada: ganancia = boletos + patrocinios − costos − préstamos de la reserva; se reparte entre empresa,
 *  creativos (bolsa de la obra), compartida y Casa DARF (60 % cabezas / 40 % el resto, en partes iguales). */

export type HonConfig = {
  reservaPct: number;      // 10
  emergenciaPct: number;   // 5 (tope)
  renta: number;           // 8000 al mes, entre las obras con mensualidad
  gastos: number;          // 1500 al mes, entre las obras con mensualidad
  creativoPct: number;     // 60 (el resto, a la compartida)
  redondeo: number;        // 10
  umbralAlumnos: number;   // 10
  fondoPct: number;        // 30
};

export type Asignacion = { bolsa: string; persona: string; nombre: string; puesto?: string | null; pct: number };

/** Clave de la bolsa creativa de una obra. La compartida es "compartida". */
export const bolsaCreativa = (obraId: string) => `creativa:${obraId}`;
export const COMPARTIDA = "compartida";

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

export type ObraMesEntrada = { id: string; nombre: string; cobrado: number; alumnos: number; emergenciaUso: number };
export type ObraMesResultado = ObraMesEntrada & {
  reserva: number; emergenciaMax: number; renta: number; gastos: number; neto: number; sinReparto: boolean;
  creativa: number; creativaFinal: number; aporteCompartida: number;
};
/** nombreBolsa: se guarda al cerrar el mes, para que cada integrante lea "Creativa Grease" sin ver la configuración. */
export type Parte = { bolsa: string; pct: number; base: number; monto: number; nombreBolsa?: string };
export type PagoPersona = { persona: string; nombre: string; partes: Parte[]; bruto: number; pago: number };

export type MesResultado = {
  obras: ObraMesResultado[];
  compartida: number;
  /** La diferencia de alumnos pagados entre obras llega al umbral: se puede pedir el fondo común. */
  alertaFondo: boolean;
  fondoAplicado: boolean;
  fondo: number;
  personas: PagoPersona[];
  totalPagado: number;
  sobranteRedondeo: number;
  /** Reserva del mes: 10 % de cada obra + recargos cobrados + sobrante del redondeo. */
  reservaMes: number;
  errores: string[];
};

export function calcularMes(p: {
  config: HonConfig; obras: ObraMesEntrada[]; asignaciones: Asignacion[]; fondoComun: boolean; recargos?: number;
}): MesResultado {
  const { config: c, asignaciones } = p;
  const errores: string[] = [];
  const bolsas = [...p.obras.map((o) => bolsaCreativa(o.id)), COMPARTIDA];
  for (const b of bolsasIncompletas(asignaciones, bolsas)) errores.push(`Los porcentajes de la bolsa ${nombreBolsa(b.bolsa, p.obras)} suman ${b.suma} %, no 100 %.`);

  const n = p.obras.length || 1;
  const obras: ObraMesResultado[] = p.obras.map((o) => {
    const reserva = r2(o.cobrado * c.reservaPct / 100);
    const emergenciaMax = r2(o.cobrado * c.emergenciaPct / 100);
    const uso = Math.min(Math.max(o.emergenciaUso, 0), emergenciaMax);
    const renta = r2(c.renta / n), gastos = r2(c.gastos / n);
    const netoCalc = r2(o.cobrado - reserva - uso - renta - gastos);
    const sinReparto = netoCalc <= 0;
    const neto = sinReparto ? 0 : netoCalc;
    const creativa = r2(neto * c.creativoPct / 100);
    return { ...o, emergenciaUso: uso, reserva, emergenciaMax, renta, gastos, neto: netoCalc, sinReparto, creativa, creativaFinal: creativa, aporteCompartida: r2(neto - creativa) };
  });
  for (const o of obras) if (o.sinReparto) errores.push(`${o.nombre}: el neto salió en ${o.neto.toLocaleString("es-MX")}; este mes no reparte (el faltante se resuelve aparte, nunca con la reserva).`);

  const alumnos = p.obras.map((o) => o.alumnos);
  const alertaFondo = alumnos.length > 1 && Math.max(...alumnos) - Math.min(...alumnos) >= c.umbralAlumnos;
  let fondo = 0;
  if (p.fondoComun && obras.length > 1) {
    fondo = r2(obras.reduce((s, o) => s + o.creativa, 0) * c.fondoPct / 100);
    for (const o of obras) o.creativaFinal = r2(o.creativa * (100 - c.fondoPct) / 100 + fondo / obras.length);
  }
  const compartida = r2(obras.reduce((s, o) => s + o.aporteCompartida, 0));
  const montoBolsa = new Map<string, number>([...obras.map((o) => [bolsaCreativa(o.id), o.creativaFinal] as const), [COMPARTIDA, compartida]]);

  const personas = repartir(asignaciones, montoBolsa, c.redondeo);
  const totalPagado = personas.reduce((s, x) => s + x.pago, 0);
  const sobranteRedondeo = r2(personas.reduce((s, x) => s + x.bruto, 0) - totalPagado);
  const reservaMes = r2(obras.reduce((s, o) => s + o.reserva, 0) + (p.recargos ?? 0) + sobranteRedondeo);
  return { obras, compartida, alertaFondo, fondoAplicado: p.fondoComun && obras.length > 1, fondo, personas, totalPagado, sobranteRedondeo, reservaMes, errores };
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

export function nombreBolsa(bolsa: string, obras: { id: string; nombre: string }[]): string {
  if (bolsa === COMPARTIDA) return "Compartida";
  if (bolsa === CASA_CABEZAS) return "Casa DARF · cabezas";
  if (bolsa === CASA_OTROS) return "Casa DARF · integrantes";
  if (bolsa === EMPRESA) return "Empresa";
  const id = bolsa.replace(/^creativa:/, "");
  return `Creativa ${obras.find((o) => o.id === id)?.nombre ?? id}`;
}

const pesos2 = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Una línea del desglose: "Creativa Grease 29 % de $10,110.00 = $2,931.90". */
export function lineaParte(p: Parte, obras: { id: string; nombre: string }[]): string {
  return `${p.nombreBolsa ?? nombreBolsa(p.bolsa, obras)} ${p.pct} % de ${pesos2(p.base)} = ${pesos2(p.monto)}`;
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

/** Cierre de una obra. `creativa` es la bolsa de su equipo (en Showman, el equipo de la obra con el 45 %);
 *  `cabezas` y `otros` son las personas de Casa DARF en ese momento (el reparto sale del número de integrantes). */
export function calcularCierre(p: {
  obra: { id: string; nombre: string }; entrada: CierreEntrada; reparto: CierreReparto; asignaciones: Asignacion[];
  cabezas: { persona: string; nombre: string }[]; otros: { persona: string; nombre: string }[]; redondeo: number;
}): CierreResultado {
  const { entrada: e, reparto: rp } = p;
  const errores: string[] = [];
  const suma = r2(rp.empresaPct + rp.creativosPct + rp.compartidaPct + rp.casaPct);
  if (Math.abs(suma - 100) > 0.005) errores.push(`El reparto del cierre suma ${suma} %, no 100 %.`);
  const bolsas = [bolsaCreativa(p.obra.id), ...(rp.compartidaPct > 0 ? [COMPARTIDA] : [])];
  for (const b of bolsasIncompletas(p.asignaciones, bolsas)) errores.push(`Los porcentajes de la bolsa ${nombreBolsa(b.bolsa, [p.obra])} suman ${b.suma} %, no 100 %.`);

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
    [bolsaCreativa(p.obra.id), partes.creativos], [COMPARTIDA, partes.compartida],
    [CASA_CABEZAS, partes.casaCabezas], [CASA_OTROS, partes.casaOtros],
  ]);
  const personas = sinReparto ? [] : repartir(asig, montoBolsa, p.redondeo);
  const totalPagado = personas.reduce((s, x) => s + x.pago, 0);
  const sobranteRedondeo = r2(personas.reduce((s, x) => s + x.bruto, 0) - totalPagado);
  if (sinReparto) errores.push(`La ganancia salió en ${ganancia.toLocaleString("es-MX")}: no hay reparto (nadie devuelve lo ya cobrado).`);
  return { ganancia, sinReparto, partes, personas, totalPagado, sobranteRedondeo, errores };
}
