import { NextResponse } from "next/server";
import { getAdeudos, getPagosObra } from "@/lib/adeudos";
import { mesNombre } from "@/lib/member-rules";
import { METODOS, conceptoPago, csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

// Exportar en CSV para Excel: pagos y adeudos (mensualidades.gestionar), elenco con tutores y
// contactos de emergencia (expedientes.ver) y asistencia a ensayos (ensayos.gestionar).
const PERMISO: Record<string, string> = { pagos: "mensualidades.gestionar", adeudos: "mensualidades.gestionar", elenco: "expedientes.ver", asistencia: "ensayos.gestionar" };
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/expedientes/exportar/[tipo]">) {
  const { id, tipo } = await ctx.params;
  const supabase = await createClient();
  if (!PERMISO[tipo]) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const { data: puede } = await supabase.rpc("has_perm", { pid: id, perm: PERMISO[tipo] });
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
        f.adeudo.meses.filter((m) => m.vencido).length, f.adeudo.total - f.adeudo.inscripcion, f.adeudo.inscripcion, f.adeudo.total, [f.baja ? "Baja" : "", f.sinCuenta ? "Sin cuenta" : ""].filter(Boolean).join(" · ")]),
    ]);
  } else if (tipo === "elenco") {
    const [{ data: roster }, { data: fichas }] = await Promise.all([
      supabase.rpc("cast_roster", { pid: id }),
      supabase.from("person_files").select("user_id, fecha_nacimiento, telefono, emergencia_nombre, emergencia_telefono, emergencia_parentesco, tutor_nombre, tutor_telefono, tutor_email, alergias, tipo_sangre"),
    ]);
    const ficha = new Map(((fichas ?? []) as Record<string, string | null>[]).map((f) => [f.user_id, f]));
    cuerpo = csv([
      ["Integrante", "Correo", "Papel", "Teléfono", "Nacimiento", "Tutor", "Teléfono del tutor", "Correo del tutor", "Emergencia", "Teléfono de emergencia", "Parentesco", "Alergias", "Tipo de sangre"],
      ...((roster ?? []) as { user_id: string; nombre: string; email: string; papeles: string[] | null }[]).map((r) => {
        const f = ficha.get(r.user_id) ?? {};
        return [r.nombre, r.email, (r.papeles ?? []).join(", "), f.telefono, f.fecha_nacimiento, f.tutor_nombre, f.tutor_telefono, f.tutor_email,
          f.emergencia_nombre, f.emergencia_telefono, f.emergencia_parentesco, f.alergias, f.tipo_sangre];
      }),
    ]);
  } else {
    const [{ data: roster }, { data: asis, error: e2 }] = await Promise.all([supabase.rpc("cast_roster", { pid: id }), supabase.rpc("attendance_summary", { pid: id })]);
    if (e2) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const nombre = new Map(((roster ?? []) as { user_id: string; nombre: string }[]).map((r) => [r.user_id, r.nombre]));
    cuerpo = csv([
      ["Integrante", "Presente", "Retardos", "Faltas", "Justificadas"],
      ...((asis ?? []) as { user_id: string; presentes: number; retardos: number; faltas: number; justificadas: number }[])
        .map((a) => [nombre.get(a.user_id) ?? "—", a.presentes, a.retardos, a.faltas, a.justificadas]),
    ]);
  }
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tipo}-${id}-${fecha(new Date().toISOString())}.csv"`, "Cache-Control": "private, no-store" },
  });
}
