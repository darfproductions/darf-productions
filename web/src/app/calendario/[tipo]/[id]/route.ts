import { NextResponse } from "next/server";
import { archivoIcs, type EventoCal } from "@/lib/calendario";
import { origenSitio } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";
import { getLogistica } from "@/lib/logistica";
import { horario, textoPuertas } from "@/lib/logistica-rules";

// "Agregar al calendario" (Bloque 4B): archivo .ics de una función con boleto, un ensayo o un evento.
// Cada quien solo puede bajar lo suyo: la base (RLS) solo le deja leer sus órdenes y sus ensayos.
export async function GET(_req: Request, ctx: RouteContext<"/calendario/[tipo]/[id]">) {
  const { tipo, id } = await ctx.params;
  const supabase = await createClient();
  const sitio = await origenSitio();
  let ev: EventoCal | null = null;
  if (tipo === "boleto") {
    const { data } = await supabase.from("orders")
      .select("order_code, status, performances(starts_at, venue, puertas_at, termina_at, production_id, productions(nombre, venue))")
      .eq("order_code", id.toUpperCase()).maybeSingle();
    const o = data as unknown as { order_code: string; status: string; performances: { starts_at: string | null; venue: string | null; puertas_at: string | null; termina_at: string | null; production_id: string; productions: { nombre: string; venue: string | null } | null } | null } | null;
    if (o?.status === "aprobado" && o.performances?.starts_at) {
      // 0127: con la logística de la obra, termina a su hora y lleva puertas y dirección.
      const pf = o.performances;
      const lg = await getLogistica(pf.production_id);
      const h = lg || pf.puertas_at || pf.termina_at ? horario({ ...pf, starts_at: pf.starts_at! }, lg) : null;
      const lugar = [pf.venue ?? pf.productions?.venue, lg?.direccion].filter(Boolean).join(", ") || null;
      ev = { uid: `orden-${o.order_code}`, titulo: `${pf.productions?.nombre ?? "DARF"} · DARF Productions`, inicia: pf.starts_at!, termina: h?.termina ?? null,
        lugar, detalle: `${h ? `${textoPuertas(h)} ` : ""}Orden ${o.order_code}. Tus boletos con QR están en Mi cuenta.`, url: `${sitio}/cuenta` };
    }
  } else if (tipo === "ensayo") {
    const { data } = await supabase.from("rehearsals").select("id, titulo, inicia, termina, lugar, notas, production_id, estado").eq("id", id).maybeSingle();
    if (data && data.estado !== "cancelado") {
      ev = { uid: `ensayo-${data.id}`, titulo: `Ensayo: ${data.titulo}`, inicia: data.inicia as string, termina: data.termina as string | null,
        lugar: data.lugar as string | null, detalle: (data.notas as string | null) ?? null, url: `${sitio}/cuenta/produccion/${data.production_id}` };
    }
  } else if (tipo === "evento") {
    const { data } = await supabase.from("fan_encuentros").select("id, titulo, inicia, termina, lugar, cancelado_at, performances(starts_at)").eq("id", id).maybeSingle();
    const e = data as unknown as { id: string; titulo: string | null; inicia: string | null; termina: string | null; lugar: string | null; cancelado_at: string | null; performances: { starts_at: string | null } | null } | null;
    const inicia = e?.performances?.starts_at ?? e?.inicia;
    if (e && inicia && !e.cancelado_at) {
      ev = { uid: `evento-${e.id}`, titulo: e.titulo ?? "Evento DARF", inicia, termina: e.termina, lugar: e.lugar, url: `${sitio}/cuenta/eventos` };
    }
  }
  if (!ev) return NextResponse.json({ error: "No encontramos esa fecha en tu cuenta." }, { status: 404 });
  return new NextResponse(archivoIcs(ev), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="darf-${tipo}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
