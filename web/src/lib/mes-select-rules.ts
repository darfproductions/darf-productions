const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Meses para un desplegable: de enero de (año - antes) a diciembre de (año + despues), como { value: "AAAA-MM", label:
 * "Febrero 2027" }. Si el valor actual queda fuera del rango, se agrega para no perderlo. */
export function opcionesMes(anio: number, antes = 1, despues = 3, actual?: string | null): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let a = anio - antes; a <= anio + despues; a++) {
    for (let m = 1; m <= 12; m++) out.push({ value: `${a}-${String(m).padStart(2, "0")}`, label: `${MESES[m - 1]} ${a}` });
  }
  const v = actual?.slice(0, 7);
  if (v && /^\d{4}-\d{2}$/.test(v) && !out.some((o) => o.value === v)) {
    const [a, m] = v.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      out.push({ value: v, label: `${MESES[m - 1]} ${a}` });
      out.sort((x, y) => x.value.localeCompare(y.value));
    }
  }
  return out;
}
