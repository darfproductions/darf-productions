import { NextResponse } from "next/server";
import { ageAt } from "@/lib/audition-rules";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

const ESTADO: Record<string, string> = {
  inscrito: "Inscrito", convocado: "Convocado", en_espera: "En espera", no_cumple: "No cumple", callback: "Callback",
  seleccionado: "Seleccionado", no_seleccionado: "No seleccionado", cancelado: "Canceló",
};
const hora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "");

// Inscritos de una convocatoria para Excel (Bloque 4B): datos, horario, estado y respuestas. audiciones.gestionar.
export async function GET(_req: Request, ctx: RouteContext<"/panel/audiciones/[aid]/exportar">) {
  const { aid } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("audition_perm", { aid, perm: "audiciones.gestionar" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const [{ data: apps }, { data: campos }] = await Promise.all([
    supabase.from("audition_applications").select("numero, nombre, fecha_nacimiento, telefono, estado, walk_in, es_menor, tutor_nombre, tutor_telefono, respuestas, created_at, audition_slots(inicia)").eq("audition_id", aid).order("numero", { nullsFirst: false }).order("created_at"),
    supabase.from("audition_fields").select("id, etiqueta").eq("audition_id", aid).order("orden"),
  ]);
  const preguntas = (campos ?? []) as { id: string; etiqueta: string }[];
  const filas = (apps ?? []) as unknown as { numero: number | null; nombre: string; fecha_nacimiento: string | null; telefono: string; estado: string; walk_in: boolean; es_menor: boolean | null; tutor_nombre: string | null; tutor_telefono: string | null; respuestas: Record<string, unknown> | null; created_at: string; audition_slots: { inicia: string } | null }[];
  const cuerpo = csv([
    ["Número", "Nombre", "Edad", "Teléfono", "Estado", "Horario", "Llegó sin registro", "Tutor", "Teléfono del tutor", "Se inscribió", ...preguntas.map((q) => q.etiqueta)],
    ...filas.map((a) => [a.numero, a.nombre, a.fecha_nacimiento ? ageAt(a.fecha_nacimiento, new Date()) : "", a.telefono, ESTADO[a.estado] ?? a.estado,
      hora(a.audition_slots?.inicia ?? null), a.walk_in ? "Sí" : "", a.tutor_nombre, a.tutor_telefono, hora(a.created_at),
      ...preguntas.map((q) => { const v = a.respuestas?.[q.id]; return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v); })]),
  ]);
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inscritos-${aid.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
