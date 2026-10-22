/* eslint-disable @next/next/no-img-element -- vistas previas generadas por la ruta de imagen */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, button, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { funcionPorOmision, getObraDifusion } from "@/lib/difusion-datos";
import { DISENOS, fechaLarga, hora } from "@/lib/difusion-rules";
import { MODOS_FAN, TAMANO_PREVENTA, modoSugerido, rangoCorto, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Difusión" };

const pill = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Difusión (0111): diseños listos para redes (post 4:5 e historia 9:16) con los colores, el logo y la imagen
// de ambiente de la obra, en el mismo estilo de la tarjeta del elenco.
export default async function Difusion({ params, searchParams }: PageProps<"/panel/producciones/[id]/difusion">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/difusion`);
  if (!can(access, id, "obra.editar") && !can(access, id, "obra.publicar")) redirect(`/panel/producciones/${id}`);
  const obra = await getObraDifusion(id);
  if (!obra) redirect("/panel/producciones");
  const pedida = typeof sp.funcion === "string" ? obra.funciones.find((f) => f.id === sp.funcion) : undefined;
  const funcion = pedida ?? funcionPorOmision(obra.funciones);
  const liga = (tipo: string, f: "post" | "historia", extra: Record<string, string> = {}) =>
    `/panel/producciones/${id}/difusion/${tipo}?${new URLSearchParams({ f, ...(funcion ? { funcion: funcion.id } : {}), ...extra })}`;

  // Preventa (Club Fan en 3 momentos y códigos de preventa privada): cuadrado, post 3:4 e historia 9:16.
  const prevDesde = pedida ? pedida.preventa_desde ?? null : obra.preventa.desde;
  const prevHasta = pedida ? pedida.preventa_hasta ?? null : obra.preventa.hasta;
  const sugerido = modoSugerido(prevDesde, prevHasta);
  const ligaFan = (modo: string, f: FormatoPreventa, descargar = false) =>
    `/panel/producciones/${id}/difusion/preventa/${modo}?${new URLSearchParams({ f, ...(pedida ? { funcion: pedida.id } : {}), ...(descargar ? { descargar: "1" } : {}) })}`;
  const verCodigos = can(access, id, "funciones.gestionar") || can(access, id, "ventas.ver");
  const { data: codigosRes } = verCodigos ? await (await createClient()).from("preventa_codigos").select("codigo, nombre").eq("production_id", id).eq("activo", true).order("created_at") : { data: [] };
  const codigos = (codigosRes ?? []) as { codigo: string; nombre: string }[];
  const formatos = Object.entries(TAMANO_PREVENTA) as [FormatoPreventa, { label: string }][];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="titular text-xl">Difusión</h2>
        <p className="mt-1 text-sm text-texto-2">
          Diseños listos para Instagram, Facebook y WhatsApp con los colores y el logo de la obra. Cada uno se descarga en post (4:5) o en historia (9:16).
          {obra.fondo.post ? " Usan la imagen de ambiente de la obra." : " Para que lleven foto, sube la imagen de ambiente en Página pública."}
        </p>
        {obra.funciones.length > 0 ? (
          <form className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-xs font-semibold">Función (para los diseños que hablan de una fecha)
              <select name="funcion" defaultValue={funcion?.id} className={input}>
                {obra.funciones.map((f) => <option key={f.id} value={f.id}>{fechaLarga(f.starts_at)} · {hora(f.starts_at)}</option>)}
              </select>
            </label>
            <button className={button}>Usar esta función</button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-aviso">Esta obra aún no tiene funciones: los diseños con fecha dirán “Próximamente”.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="titular text-xl">Preventa Club Fan</h2>
          <p className="text-sm text-texto-2">Con el póster de la obra de fondo y el logo de la Fan Zone. Se descargan en cuadrado (1:1), post (3:4) o historia (9:16).
            {prevDesde || prevHasta ? ` Fechas: ${rangoCorto(prevDesde, prevHasta)}${pedida ? " (de la función elegida)" : " (de la obra)"}.` : ""}</p>
          {!prevDesde && !prevHasta && <p className="mt-1 text-sm font-semibold text-aviso">Esta obra aún no tiene fechas de preventa: ponlas en <Link href={`/panel/producciones/${id}/boletos/funciones`} className="underline">Funciones y precios, en Preventas</Link>.</p>}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODOS_FAN.map((m) => (
            <li key={m.id} className={`flex flex-col gap-2 rounded-xl p-3 ${m.id === sugerido ? "bg-oro/10 ring-1 ring-oro/50" : "bg-telon-2"}`}>
              <div>
                <h3 className="font-bold">{m.label}{m.id === sugerido && <span className="ml-2 rounded-full bg-oro/20 px-2 py-0.5 text-[10px] font-black uppercase text-oro-claro">Hoy toca</span>}</h3>
                <p className="text-xs text-texto-3">{m.ayuda}</p>
              </div>
              <img src={ligaFan(m.id, "post")} alt={`Vista previa: ${m.label}`} loading="lazy" width={1080} height={1440} className="aspect-[3/4] w-full rounded-lg bg-sala object-cover" />
              <div className="mt-auto flex flex-wrap gap-2">
                {formatos.map(([f, t]) => <a key={f} href={ligaFan(m.id, f, true)} className={pill}>{t.label} <Icono nombre="flecha-abajo" /></a>)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {verCodigos && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Preventa privada (con código)</h2>
            <p className="text-sm text-texto-2">Un diseño por código, con el código, la liga y su QR. Los códigos se crean en <Link href={`/panel/producciones/${id}/boletos/preventa`} className="underline">Boletos, en Preventa privada</Link>.</p>
          </div>
          {codigos.length === 0 ? <p className="text-sm text-texto-3">No hay códigos activos.</p> : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {codigos.map((c) => (
                <li key={c.codigo} className="flex flex-col gap-2 rounded-xl bg-telon-2 p-3">
                  <h3 className="font-bold">{c.nombre} <span className="text-xs text-texto-3">{c.codigo}</span></h3>
                  <img src={`/panel/producciones/${id}/boletos/preventa/${c.codigo}/diseno?f=post`} alt={`Vista previa: ${c.nombre}`} loading="lazy" width={1080} height={1440} className="aspect-[3/4] w-full rounded-lg bg-sala object-cover" />
                  <div className="mt-auto flex flex-wrap gap-2">
                    {formatos.map(([f, t]) => <a key={f} href={`/panel/producciones/${id}/boletos/preventa/${c.codigo}/diseno?f=${f}&descargar=1`} className={pill}>{t.label} <Icono nombre="flecha-abajo" /></a>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {DISENOS.filter((d) => d.id !== "preventa").map((d) => {
          const temporada: Record<string, string> = d.id === "agotadas" ? { funcion: "todas" } : {};
          return (
            <li key={d.id}>
              <Card className="flex h-full flex-col gap-3">
                <div>
                  <h3 className="font-bold">{d.label}</h3>
                  <p className="text-xs text-texto-3">{d.ayuda}</p>
                </div>
                <img src={liga(d.id, "post", temporada)} alt={`Vista previa: ${d.label}`} loading="lazy" width={1080} height={1350} className="aspect-[4/5] w-full rounded-lg bg-sala object-cover" />
                <div className="mt-auto flex flex-wrap gap-2">
                  {d.id === "agotadas" ? (
                    <>
                      <a href={liga(d.id, "post", { funcion: "todas", descargar: "1" })} className={pill}>Temporada · post <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia", { funcion: "todas", descargar: "1" })} className={pill}>Temporada · historia <Icono nombre="flecha-abajo" /></a>
                      {funcion && <a href={liga(d.id, "post", { descargar: "1" })} className={pill}>Esta función · post <Icono nombre="flecha-abajo" /></a>}
                      {funcion && <a href={liga(d.id, "historia", { descargar: "1" })} className={pill}>Esta función · historia <Icono nombre="flecha-abajo" /></a>}
                    </>
                  ) : (
                    <>
                      <a href={liga(d.id, "post", { descargar: "1" })} className={pill}>Post <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia", { descargar: "1" })} className={pill}>Historia <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia")} target="_blank" rel="noopener" className={`${pill} border-transparent text-texto-3`}>Ver historia</a>
                    </>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
