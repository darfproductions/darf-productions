import { NextResponse } from "next/server";
import { ageAt } from "@/lib/audition-rules";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";
import { ORDENES, armarLista, ordenValido, pasaCon } from "@/lib/lista-audicion-rules";
import { cargarLista } from "../lista/datos";

const ESTADO: Record<string, string> = {
  inscrito: "En revisión", convocado: "Aprobada", en_espera: "En espera", no_cumple: "No cumple", callback: "Callback",
  seleccionado: "Seleccionado", no_seleccionado: "No seleccionado", cancelado: "Canceló",
};
const hora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "");

// Inscritos de una convocatoria para Excel (Bloque 4B): datos, horario, estado y respuestas. audiciones.gestionar.
// Desde la lista para imprimir llega ?orden= (turno, grupo, personaje, nombre) y ?solo=aprobadas: entonces sale en ese
// orden, con la misma selección que la hoja (sin canceladas ni «no cumple») y, por grupo o personaje, con su sección.
// Sin ?orden= sale como siempre: todas las solicitudes por turno.
export async function GET(req: Request, ctx: RouteContext<"/panel/audiciones/[aid]/exportar">) {
  const { aid } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("audition_perm", { aid, perm: "audiciones.gestionar" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const [{ data: apps }, { data: campos }] = await Promise.all([
    supabase.from("audition_applications").select("id, numero, nombre, fecha_nacimiento, telefono, estado, walk_in, es_menor, tutor_nombre, tutor_telefono, respuestas, created_at, audition_slots(inicia)").eq("audition_id", aid).order("numero", { nullsFirst: false }).order("created_at"),
    supabase.from("audition_fields").select("id, etiqueta, sistema").eq("audition_id", aid).order("orden"),
  ]);
  // Personajes, grupo y con quién pasa (los mismos de la lista para imprimir). Las preguntas de grupo y de
  // «¿con quién pasas?» ya van en sus columnas, así que no se repiten al final.
  const lista = await cargarLista(aid);
  const deLista = new Map(lista.map((x) => [x.id, x]));
  const preguntas = ((campos ?? []) as { id: string; etiqueta: string; sistema: string | null }[]).filter((q) => !q.sistema);
  const filas = (apps ?? []) as unknown as { id: string; numero: number | null; nombre: string; fecha_nacimiento: string | null; telefono: string; estado: string; walk_in: boolean; es_menor: boolean | null; tutor_nombre: string | null; tutor_telefono: string | null; respuestas: Record<string, unknown> | null; created_at: string; audition_slots: { inicia: string } | null }[];
  const sp = new URL(req.url).searchParams;
  const conOrden = sp.has("orden");
  const orden = ordenValido(sp.get("orden"));
  const seccion = conOrden && (orden === "grupo" || orden === "personaje");
  const base = sp.get("solo") === "aprobadas" ? lista.filter((x) => !["inscrito", "en_espera"].includes(x.estado)) : lista;
  const porId = new Map(filas.map((a) => [a.id, a]));
  const salida: { a: (typeof filas)[number]; sec: string | null }[] = conOrden
    ? armarLista(base, orden).flatMap((s) => s.filas.map((f) => ({ a: porId.get(f.id)!, sec: s.titulo })).filter((x) => x.a))
    : filas.map((a) => ({ a, sec: null }));
  const cuerpo = csv([
    [...(seccion ? [orden === "grupo" ? "Grupo (sección)" : "Personaje (sección)"] : []), "Turno", "Nombre", "Edad", "Audiciona para", "Grupo", "Pasa con", "Teléfono", "Estado", "Horario", "Llegó sin registro", "Tutor", "Teléfono del tutor", "Se inscribió", ...preguntas.map((q) => q.etiqueta)],
    ...salida.map(({ a, sec }) => { const l = deLista.get(a.id); return [...(seccion ? [sec] : []), a.numero, a.nombre, a.fecha_nacimiento ? ageAt(a.fecha_nacimiento, new Date()) : "",
      l?.personajes.join(", ") ?? "", l?.grupo ?? "", l ? pasaCon(l, lista) : "", a.telefono, ESTADO[a.estado] ?? a.estado,
      hora(a.audition_slots?.inicia ?? null), a.walk_in ? "Sí" : "", a.tutor_nombre, a.tutor_telefono, hora(a.created_at),
      ...preguntas.map((q) => { const v = a.respuestas?.[q.id]; return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v); })]; }),
  ]);
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inscritos-${aid.slice(0, 8)}${conOrden ? `-${ORDENES[orden].toLowerCase().replace(/\s+/g, "-")}` : ""}.csv"`, "Cache-Control": "private, no-store" },
  });
}
