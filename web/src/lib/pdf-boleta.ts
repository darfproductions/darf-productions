import { buildPdf, text, wrap } from "@/lib/pdf-ticket";

// Boleta de evaluación del taller en PDF (0058), con el mismo escritor de PDF de los boletos.

export type BoletaData = {
  obra: string; periodo: string; alumno: string; fecha: string;
  filas: { criterio: string; nivel: string | null; numero: number | null }[];
  promedio: number | null; comentario: string | null;
};

const W = 612; // carta
const H = 792;

export function boletaPdf(b: BoletaData): Uint8Array {
  const ops: string[] = [];
  ops.push("0.043 0.035 0.063 rg", `0 ${H - 110} ${W} 110 re f`);
  ops.push("1 1 1 rg", text(48, H - 45, 10, "DARF PRODUCTIONS · BOLETA DE EVALUACIÓN", true));
  let y = H - 75;
  for (const l of wrap(b.obra, 40).slice(0, 2)) { ops.push(text(48, y, 20, l, true)); y -= 22; }
  ops.push("0 0 0 rg");
  y = H - 145;
  ops.push(text(48, y, 12, `Alumno: ${b.alumno}`, true));
  ops.push(text(340, y, 12, `Periodo: ${b.periodo}`, true));
  y -= 16;
  ops.push("0.45 0.45 0.45 rg", text(48, y, 9, `Fecha: ${b.fecha}`), "0 0 0 rg");
  y -= 30;
  // Encabezado de tabla
  ops.push("0.93 0.93 0.95 rg", `48 ${y - 6} ${W - 96} 22 re f`, "0 0 0 rg");
  ops.push(text(56, y, 10, "CRITERIO", true), text(330, y, 10, "NIVEL", true), text(480, y, 10, "CALIFICACIÓN", true));
  y -= 26;
  for (const f of b.filas) {
    const lines = wrap(f.criterio, 42).slice(0, 2);
    ops.push(text(56, y, 11, lines[0]), text(330, y, 11, f.nivel ?? "-"), text(500, y, 11, f.numero != null ? String(f.numero) : "-", true));
    if (lines[1]) { y -= 14; ops.push(text(56, y, 11, lines[1])); }
    y -= 8;
    ops.push("0.85 0.85 0.85 RG", `48 ${y} m ${W - 48} ${y} l S`, "0 0 0 RG");
    y -= 16;
    if (y < 200) break;
  }
  if (b.promedio != null) { ops.push(text(330, y, 12, "Promedio", true), text(500, y, 12, String(b.promedio), true)); y -= 30; }
  if (b.comentario) {
    ops.push(text(48, y, 10, "COMENTARIOS DEL MAESTRO", true));
    y -= 16;
    for (const l of wrap(b.comentario, 90).slice(0, 14)) { ops.push(text(48, y, 11, l)); y -= 14; }
  }
  ops.push("0.45 0.45 0.45 rg", text(48, 40, 9, "Documento generado por DARF Productions."));
  return buildPdf([ops.join("\n")], W, H);
}
