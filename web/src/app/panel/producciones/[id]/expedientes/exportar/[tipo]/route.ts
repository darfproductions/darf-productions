import { NextResponse } from "next/server";
import { getAdeudos, getPagosObra } from "@/lib/adeudos";
import { mesNombre } from "@/lib/member-rules";
import { METODOS, conceptoPago, csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

// Exportar pagos o adeudos de la obra en CSV (para Excel o contabilidad). mensualidades.gestionar.
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/expedientes/exportar/[tipo]">) {
  const { id, tipo } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("has_perm", { pid: id, perm: "mensualidades.gestionar" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const fecha = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  let cuerpo: string;
  if (tipo === "pagos") {
    const pagos = await getPagosObra(id);
    cuerpo = csv([
      ["Folio", "Fecha", "Integrante", "Concepto", "Mes", "Monto", "Método", "Nota", "Estado", "Motivo de anulación"],
      ...pagos.map((p) => [p.folio, fecha(p.registrado_at), p.nombre, p.concepto === "inscripcion" ? "Inscripción" : "Mensualidad", p.concepto === "inscripcion" ? "" : mesNombre(p.periodo),
        Number(p.monto), METODOS[p.metodo] ?? p.metodo, p.nota, p.anulado_at ? "Anulado" : "Vigente", p.motivo_anulacion]),
    ]);
  } else if (tipo === "adeudos") {
    const { filas } = await getAdeudos(id);
    cuerpo = csv([
      ["Integrante", "Correo", "Meses que debe", "Meses vencidos", "Mensualidades", "Inscripción", "Total", "Nota"],
      ...filas.filter((f) => f.adeudo.total > 0).sort((a, b) => b.adeudo.total - a.adeudo.total).map((f) => [
        f.nombre, f.email, f.adeudo.meses.map((m) => conceptoPago({ periodo: m.periodo }).replace("Mensualidad de ", "")).join("; "),
        f.adeudo.meses.filter((m) => m.vencido).length, f.adeudo.total - f.adeudo.inscripcion, f.adeudo.inscripcion, f.adeudo.total, f.baja ? "Baja" : ""]),
    ]);
  } else return NextResponse.json({ error: "No existe." }, { status: 404 });
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tipo}-${id}-${fecha(new Date().toISOString())}.csv"`, "Cache-Control": "private, no-store" },
  });
}
