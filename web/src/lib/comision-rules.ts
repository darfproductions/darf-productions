// Comisiones de vendedores (0129). Puro, con pruebas en comision-rules.test.ts.
// El cálculo de verdad está en la base (comision_calculo); aquí, el mismo para la vista previa y los textos.

export type Tramo = { desde: number; hasta: number | null; porcentaje: number };
export type ComisionRow = {
  seller_id: string; boletos: number; base: number; comision: number; pagado: number; por_pagar: number;
  pct_actual: number; siguiente_desde: number | null; siguiente_pct: number | null; propia: boolean;
};

/** Tramos ordenados y revisados (mismas reglas que comision_guardar). Devuelve el error en palabras o null. */
export function validarTramos(tramos: Tramo[]): string | null {
  if (tramos.length > 20) return "Máximo 20 tramos.";
  const t = [...tramos].sort((a, b) => a.desde - b.desde);
  for (let i = 0; i < t.length; i++) {
    const { desde, hasta, porcentaje } = t[i];
    if (!Number.isInteger(desde) || desde < 1) return "Cada tramo empieza en el boleto 1 o después.";
    if (hasta != null && (!Number.isInteger(hasta) || hasta < desde)) return `En el tramo que empieza en ${desde}, el final va antes del inicio.`;
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) return "El porcentaje va de 0 a 100.";
    const prev = t[i - 1];
    if (prev && (prev.hasta == null || desde <= prev.hasta)) return `Los tramos se enciman cerca del boleto ${desde}.`;
  }
  return null;
}

/** % del boleto número n (0 si ningún tramo lo cubre). */
export function pctDe(tramos: Tramo[], n: number): number {
  const t = [...tramos].sort((a, b) => a.desde - b.desde).find((x) => n >= x.desde && (x.hasta == null || n <= x.hasta));
  return t?.porcentaje ?? 0;
}

/** Comisión de una lista de precios, en el orden en que se vendieron (boleto 1 = el primero). */
export function comisionDe(precios: number[], tramos: Tramo[]): number {
  const total = precios.reduce((s, p, i) => s + (p * pctDe(tramos, i + 1)) / 100, 0);
  return Math.round(total * 100) / 100;
}

const pct = (n: number) => `${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;

/** "Del 26 al 35: 10 %", "Desde el 46: 25 %", "Del 1 en adelante: 10 %" → "Todos los boletos: 10 %". */
export function textoTramo(t: Tramo): string {
  if (t.hasta == null) return t.desde === 1 ? `Todos los boletos: ${pct(t.porcentaje)}` : `Desde el boleto ${t.desde}: ${pct(t.porcentaje)}`;
  if (t.hasta === t.desde) return `Boleto ${t.desde}: ${pct(t.porcentaje)}`;
  return `Del ${t.desde} al ${t.hasta}: ${pct(t.porcentaje)}`;
}

/** "va en 20 % · faltan 3 para el 25 %" (lo que sigue para el boleto que viene). */
export function textoAvance(r: Pick<ComisionRow, "boletos" | "pct_actual" | "siguiente_desde" | "siguiente_pct">): string {
  const partes = [`va en ${pct(Number(r.pct_actual))}`];
  if (r.siguiente_desde != null && r.siguiente_pct != null) {
    const faltan = r.siguiente_desde - (r.boletos + 1);
    partes.push(faltan <= 0 ? `el siguiente ya va al ${pct(Number(r.siguiente_pct))}` : `${faltan === 1 ? "falta 1" : `faltan ${faltan}`} para el ${pct(Number(r.siguiente_pct))}`);
  }
  return partes.join(" · ");
}

/** Lo que manda el formulario: filas con texto → tramos (se ignoran las filas vacías). */
export function leerTramos(filas: { desde: string; hasta: string; porcentaje: string }[]): Tramo[] {
  return filas
    .filter((f) => f.desde.trim() || f.hasta.trim() || f.porcentaje.trim())
    .map((f) => ({ desde: Number(f.desde), hasta: f.hasta.trim() ? Number(f.hasta) : null, porcentaje: Number(f.porcentaje.replace(",", ".")) }))
    .sort((a, b) => a.desde - b.desde);
}
