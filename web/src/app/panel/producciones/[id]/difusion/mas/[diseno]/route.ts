import { NextResponse } from "next/server";
import { funcionPorOmision, getObraDifusion } from "@/lib/difusion-datos";
import { extraPng } from "@/lib/difusion-extra";
import { getDatosExtra } from "@/lib/difusion-extra-datos";
import { DISENOS_EXTRA, esDisenoExtra, esInvitacion, funcionesPorDia, pasosComprar, renglonesCalendario, telefonoLegible, textoInvitacion } from "@/lib/difusion-extra-rules";
import { esFormatoPreventa, sitioCorto, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { rangoFechas } from "@/lib/difusion-rules";
import { env } from "@/lib/env";
import { can } from "@/lib/panel-nav";
import { horarioDeFuncion } from "@/lib/logistica";
import { horario, ligaMaps } from "@/lib/logistica-rules";
import { textosPreparate } from "@/lib/difusion-extra-rules";
import { requirePanel } from "@/lib/permissions";

// Más diseños: invitación, mapa de zonas, cómo comprar, calendario y lo que incluye cada zona.
// ?f=cuadrado|post|historia, &funcion=<id> (invitación y mapa) y &descargar=1. Mismo permiso que Difusión.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/difusion/mas/[diseno]">) {
  const { id, diseno } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/difusion`);
  if (!can(access, id, "obra.editar") && !can(access, id, "obra.publicar")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!esDisenoExtra(diseno)) return NextResponse.json({ error: "Ese diseño no existe." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const f = sp.get("f");
  const formato: FormatoPreventa = esFormatoPreventa(f) ? f : "post";
  const obra = await getObraDifusion(id);
  if (!obra) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const usaFuncion = DISENOS_EXTRA.find((x) => x.id === diseno)!.funcion;
  const pedida = sp.get("funcion");
  const funcion = !usaFuncion ? null : pedida === "todas" ? null : pedida ? obra.funciones.find((x) => x.id === pedida) ?? null : funcionPorOmision(obra.funciones);
  const base = (env.siteUrl || "https://darfproductions.com").replace(/\/$/, "");
  const datos = diseno === "mapa" || diseno === "incluye" || diseno === "comprar" ? await getDatosExtra(id, funcion?.id ?? null) : undefined;
  // Los precios salen en los diseños aunque la página web los oculte (el diseño se publica a propósito); ?precios=0
  // baja la versión sin precios.
  const extra = datos && { ...datos, mostrarPrecios: sp.get("precios") !== "0" };
  const fecha = textoInvitacion({ funcion, rango: rangoFechas(obra.funciones) });
  // La invitación va sobre el póster alterno sin textos; los diseños con mucha información, sobre el ambiente
  // (el póster tiene personajes y textos que compiten con lo de encima). Si faltan, el póster solo imagen.
  const historia = formato === "historia";
  const poster = historia ? obra.poster.p9x16 : obra.poster.p3x4;
  // Dos invitaciones generales (2026-10-25): sobre el póster alterno o sobre el ambiente.
  const fondoUrl = diseno === "invitacion"
    ? (historia ? obra.alterno.p9x16 ?? obra.alterno.p3x4 : obra.alterno.p3x4 ?? obra.alterno.p9x16) ?? obra.ambiente ?? poster
    : obra.ambiente ?? poster;
  // 0127: el horario sale de Funciones y horarios (sin logística: puertas 30 min antes, 2 h de duración).
  const prep = diseno === "preparate" && funcion ? await horarioDeFuncion(funcion.id, id) : null;
  const preparate = prep && funcion ? (() => {
    const h = prep.h ?? horario(funcion, prep.l);
    return { ...textosPreparate(h, prep.l), direccion: prep.l?.direccion ?? null, maps: ligaMaps(prep.l, funcion.venue ?? obra.venue) };
  })() : undefined;
  const png = await extraPng({
    diseno, formato, obra: obra.nombre, logoUrl: obra.logoUrl, colores: obra.colores,
    fondoUrl,
    liga: `${sitioCorto(base)}/producciones/${id}`, url: `${base}/producciones/${id}`,
    whatsapp: telefonoLegible(env.whatsapp), lugar: (funcion?.venue ?? obra.venue) || null,
    fecha: fecha.fecha, hora: fecha.hora, extra, preparate,
    pasos: diseno === "comprar" ? pasosComprar({ whatsapp: env.whatsapp, liga: `${sitioCorto(base)}/producciones/${id}`, modo: extra?.modoVenta }) : undefined,
    calendario: diseno === "calendario" ? renglonesCalendario(obra.funciones, formato === "historia" ? 9 : formato === "post" ? 6 : 4) : undefined,
    // Las invitaciones llevan todas las funciones, agrupadas por día (los días que caben; el resto "y N fechas más").
    dias: esInvitacion(diseno) ? funcionesPorDia(obra.funciones, formato === "historia" ? 6 : formato === "post" ? 4 : 3) : undefined,
  });
  const archivo = `${obra.nombre}-${diseno}-${formato}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="${archivo}.png"` } : {}) },
  });
}
