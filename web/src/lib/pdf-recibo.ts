import { MES_LABEL, INSCRIPCION_LABEL, mesNombre, pesos, type Inscripcion, type Mes } from "@/lib/member-rules";
import { METODOS, conceptoPago, type Recibo } from "@/lib/pago-rules";
import { buildPdf, text, wrap } from "@/lib/pdf-ticket";

// Recibo de pago y estado de cuenta en PDF (0079), con el mismo escritor de PDF de los boletos.

const W = 612; // carta
const H = 792;
const GRIS = "0.45 0.45 0.45 rg";
const NEGRO = "0 0 0 rg";
const fechaMx = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
const hoyMx = () => new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" });

function encabezado(ops: string[], titulo: string, obra: string) {
  ops.push("0.043 0.035 0.063 rg", `0 ${H - 110} ${W} 110 re f`);
  ops.push("1 1 1 rg", text(48, H - 45, 10, `DARF PRODUCTIONS · ${titulo}`, true));
  let y = H - 75;
  for (const l of wrap(obra, 40).slice(0, 2)) { ops.push(text(48, y, 20, l, true)); y -= 22; }
  ops.push(NEGRO);
}

export function reciboPdf(r: Recibo): Uint8Array {
  const ops: string[] = [];
  encabezado(ops, "RECIBO DE PAGO", r.obra);
  let y = H - 150;
  ops.push(GRIS, text(48, y, 9, "FOLIO", true), NEGRO, text(48, y - 22, 22, r.folio, true));
  ops.push(GRIS, text(360, y, 9, "MONTO", true), NEGRO, text(360, y - 22, 22, `${pesos(Number(r.monto))} MXN`, true));
  y -= 60;
  const fila = (k: string, v: string) => {
    ops.push(GRIS, text(48, y, 9, k.toUpperCase(), true), NEGRO);
    y -= 15;
    for (const l of wrap(v, 80).slice(0, 3)) { ops.push(text(48, y, 12, l)); y -= 15; }
    y -= 8;
  };
  fila("Recibimos de", r.nombre);
  fila("Concepto", conceptoPago(r));
  fila("Método de pago", METODOS[r.metodo] ?? r.metodo);
  fila("Fecha", fechaMx(r.registrado_at));
  if (r.registrado_por) fila("Registró", r.registrado_por);
  if (r.nota) fila("Nota", r.nota);
  if (r.anulado_at) {
    y -= 6;
    ops.push("0.82 0.004 0.133 RG", "3 w", `48 ${y - 62} ${W - 96} 76 re S`, "0.82 0.004 0.133 rg");
    ops.push(text(64, y - 14, 26, "ANULADO", true));
    ops.push(text(64, y - 34, 10, `Anulado el ${fechaMx(r.anulado_at)} · Este recibo ya no es válido.`));
    ops.push(text(64, y - 50, 10, `Motivo: ${wrap(r.motivo_anulacion ?? "", 80)[0]}`));
    ops.push(NEGRO, "1 w", "0 0 0 RG");
    y -= 90;
  }
  ops.push("0.85 0.85 0.85 RG", `48 ${y} m ${W - 48} ${y} l S`, "0 0 0 RG");
  y -= 20;
  ops.push(GRIS, text(48, y, 9, "Consérvalo: también lo encuentras en Mi cuenta > tu producción > Mis pagos."));
  ops.push(text(48, 30, 9, `Documento generado por DARF Productions el ${hoyMx()}.`));
  return buildPdf([ops.join("\n")], W, H);
}

export type EstadoCuenta = {
  obra: string; nombre: string; mensualidad: number | null; beca: boolean; diaLimite: number;
  meses: Mes[]; inscripcion: Inscripcion; adeudo: number;
  pagos: { folio: string; concepto: string; periodo: string; monto: number; metodo: string; registrado_at: string; anulado_at: string | null }[];
};

export function estadoCuentaPdf(e: EstadoCuenta): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 0;
  const pie = () => ops.push(GRIS, text(48, 30, 9, `Estado de cuenta al ${hoyMx()} · DARF Productions.`), NEGRO);
  const nueva = () => { pie(); pages.push(ops.join("\n")); ops = [NEGRO]; y = H - 60; };
  const espacio = (n: number) => { if (y - n < 60) nueva(); };
  const titulo = (t: string) => { espacio(50); y -= 10; ops.push(NEGRO, text(48, y, 10, t, true)); y -= 20; };

  encabezado(ops, "ESTADO DE CUENTA", e.obra);
  y = H - 145;
  ops.push(text(48, y, 12, e.nombre, true), GRIS, text(360, y, 10, `Al ${hoyMx()}`), NEGRO);
  y -= 34;
  const datos: [string, string][] = [
    ["Mensualidad", e.beca ? "Beca" : e.mensualidad != null ? pesos(e.mensualidad) : "-"],
    ["Pagar antes del día", String(e.diaLimite)],
    ["Inscripción", INSCRIPCION_LABEL[e.inscripcion.estado].label],
    ["Adeudo a hoy", pesos(e.adeudo)],
  ];
  datos.forEach(([k, v], i) => { const cx = 48 + i * 130; ops.push(GRIS, text(cx, y, 8, k.toUpperCase(), true), NEGRO, text(cx, y - 18, 14, v, true)); });
  y -= 40;

  titulo("MENSUALIDADES");
  ops.push("0.93 0.93 0.95 rg", `48 ${y - 6} ${W - 96} 20 re f`, NEGRO);
  ops.push(text(56, y, 9, "MES", true), text(260, y, 9, "CUOTA", true), text(360, y, 9, "PAGADO", true), text(460, y, 9, "ESTADO", true));
  y -= 22;
  for (const m of e.meses) {
    espacio(20);
    ops.push(text(56, y, 10, mesNombre(m.periodo)), text(260, y, 10, pesos(m.debe)), text(360, y, 10, pesos(m.pagado)), text(460, y, 10, MES_LABEL[m.estado].label, m.estado === "vencido"));
    y -= 16;
  }
  if (!e.meses.length) { ops.push(text(56, y, 10, "No hay mensualidades.")); y -= 16; }

  titulo(`PAGOS REGISTRADOS (${e.pagos.length})`);
  ops.push("0.93 0.93 0.95 rg", `48 ${y - 6} ${W - 96} 20 re f`, NEGRO);
  ops.push(text(56, y, 9, "FECHA", true), text(150, y, 9, "FOLIO", true), text(260, y, 9, "CONCEPTO", true), text(470, y, 9, "MONTO", true));
  y -= 22;
  for (const p of e.pagos) {
    espacio(30);
    const fecha = new Date(p.registrado_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
    ops.push(p.anulado_at ? GRIS : NEGRO, text(56, y, 10, fecha), text(150, y, 10, p.folio), text(260, y, 10, wrap(conceptoPago(p), 34)[0]), text(470, y, 10, pesos(Number(p.monto)), true));
    y -= 13;
    ops.push(GRIS, text(260, y, 8, `${METODOS[p.metodo] ?? p.metodo}${p.anulado_at ? " · ANULADO (no cuenta)" : ""}`), NEGRO);
    y -= 15;
  }
  if (!e.pagos.length) { ops.push(text(56, y, 10, "Aún no hay pagos.")); y -= 16; }
  pie();
  pages.push(ops.join("\n"));
  return buildPdf(pages, W, H);
}
