import { buildPdf, text, wrap } from "@/lib/pdf-ticket";
import { asistenciaPct, type Extras, type FilaBoleta } from "@/lib/rubric-rules";

// Boleta de evaluación del taller en PDF (0058/0059), con el mismo escritor de PDF de los boletos.

export type BoletaData = {
  obra: string; periodo: string; alumno: string; fecha: string;
  filas: FilaBoleta[]; promedio: number | null; comentario: string | null; extras?: Extras | null;
};

const W = 612; // carta
const H = 792;
const NIVEL: Record<string, string> = { advertencia: "Advertencia", grave: "Grave" };

export function boletaPdf(b: BoletaData): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 0;
  const nueva = () => {
    if (ops.length) { ops.push("0.45 0.45 0.45 rg", text(48, 30, 9, "Documento generado por DARF Productions.")); pages.push(ops.join("\n")); }
    ops = [];
    y = H - 60;
  };
  const espacio = (n: number) => { if (y - n < 60) { nueva(); ops.push("0 0 0 rg"); } };
  const titulo = (t: string) => { espacio(40); y -= 10; ops.push("0 0 0 rg", text(48, y, 10, t, true)); y -= 18; };

  // Encabezado
  ops.push("0.043 0.035 0.063 rg", `0 ${H - 110} ${W} 110 re f`);
  ops.push("1 1 1 rg", text(48, H - 45, 10, "DARF PRODUCTIONS · BOLETA DE EVALUACIÓN", true));
  y = H - 75;
  for (const l of wrap(b.obra, 40).slice(0, 2)) { ops.push(text(48, y, 20, l, true)); y -= 22; }
  ops.push("0 0 0 rg");
  y = H - 145;
  ops.push(text(48, y, 12, `Alumno: ${b.alumno}`, true), text(340, y, 12, `Periodo: ${b.periodo}`, true));
  y -= 16;
  ops.push("0.45 0.45 0.45 rg", text(48, y, 9, `Fecha: ${b.fecha}`), "0 0 0 rg");
  y -= 30;

  // Calificaciones
  ops.push("0.93 0.93 0.95 rg", `48 ${y - 6} ${W - 96} 22 re f`, "0 0 0 rg");
  ops.push(text(56, y, 10, "MATERIA", true), text(330, y, 10, "NIVEL", true), text(480, y, 10, "CALIFICACIÓN", true));
  y -= 26;
  for (const f of b.filas) {
    espacio(30);
    const lines = wrap(f.criterio, 42).slice(0, 2);
    ops.push(text(56, y, 11, lines[0]), text(330, y, 11, f.nivel ?? "-"), text(500, y, 11, f.numero != null ? String(f.numero) : "-", true));
    if (f.maestros) { y -= 12; ops.push("0.45 0.45 0.45 rg", text(56, y, 8, `Promedio de ${f.maestros} ${f.maestros === 1 ? "maestro" : "maestros"}`), "0 0 0 rg"); }
    if (lines[1]) { y -= 14; ops.push(text(56, y, 11, lines[1])); }
    y -= 8;
    ops.push("0.85 0.85 0.85 RG", `48 ${y} m ${W - 48} ${y} l S`, "0 0 0 RG");
    y -= 16;
  }
  if (b.promedio != null) { ops.push(text(330, y, 12, "Promedio general", true), text(500, y, 12, String(b.promedio), true)); y -= 24; }

  const x = b.extras;
  if (x) {
    titulo("ASISTENCIA A ENSAYOS DEL PERIODO");
    const pct = asistenciaPct(x);
    const datos: [string, string][] = [
      ["Ensayos", String(x.citados)], ["Asistencias", String(x.presentes)], ["Retardos", String(x.retardos)],
      ["Faltas", String(x.faltas)], ["Justificadas", String(x.justificadas)], ["Asistencia", pct == null ? "-" : `${pct} %`],
    ];
    datos.forEach(([k, v], i) => { const cx = 48 + (i % 6) * 86; ops.push("0.45 0.45 0.45 rg", text(cx, y, 8, k.toUpperCase(), true), "0 0 0 rg", text(cx, y - 16, 13, v, true)); });
    y -= 36;

    titulo(`LLAMADAS DE ATENCIÓN DEL PERIODO (${x.incidencias.length})`);
    if (!x.incidencias.length) { ops.push(text(48, y, 11, "Ninguna.")); y -= 16; }
    for (const i of x.incidencias) {
      espacio(30);
      ops.push(text(48, y, 10, `${i.fecha} · ${NIVEL[i.nivel] ?? i.nivel}`, true));
      y -= 14;
      for (const l of wrap(i.descripcion, 90).slice(0, 3)) { ops.push(text(60, y, 10, l)); y -= 13; }
      y -= 4;
    }
  }

  const notas = [...(b.comentario ? [{ quien: "Comentario general", texto: b.comentario }] : []),
    ...(x?.notas ?? []).map((n) => ({ quien: `${n.maestro}${n.materias.length ? ` (${n.materias.join(", ")})` : ""}`, texto: n.comentario }))];
  if (notas.length) {
    titulo("COMENTARIOS DE LOS MAESTROS");
    for (const n of notas) {
      espacio(40);
      ops.push(text(48, y, 10, n.quien, true));
      y -= 14;
      for (const l of wrap(n.texto, 90).slice(0, 10)) { espacio(16); ops.push(text(48, y, 10, l)); y -= 13; }
      y -= 6;
    }
  }
  ops.push("0.45 0.45 0.45 rg", text(48, 30, 9, "Documento generado por DARF Productions."));
  pages.push(ops.join("\n"));
  return buildPdf(pages, W, H);
}
