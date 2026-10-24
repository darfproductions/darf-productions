/* eslint-disable @next/next/no-img-element -- miniaturas del kit (Storage o archivos propios) */
import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { FORMATOS, FORMATOS_ALT, FORMATO_INFO, poster, posterAlt } from "@/lib/poster";
import { assetUrl } from "@/lib/productions";
import { quitarPoster, saveKitImage, savePoster, savePosterAlt } from "../actions";
import { ColorsForm } from "../ColorsForm";
import { PosterSlot } from "../PosterSlot";
import { Block, cargarEditor } from "../editor";

export const metadata: Metadata = { title: "Imagen y pósters" };

// Página pública → Imagen: logo, ambiente, póster oficial y alterno, colores. Difusión y Programa usan esto.
export default async function ImagenPage({ params }: PageProps<"/panel/producciones/[id]/pagina/imagen">) {
  const { id } = await params;
  const { p, cambio } = await cargarEditor(id, "pagina/imagen");
  return (
    <div className="flex flex-col gap-4">
          <Block id="kit" abierto cambio={cambio("kit", "colores", "poster")} title="Kit visual" note="Las mismas piezas en todas las obras. El logo va en una caja fija y la imagen de ambiente al fondo del encabezado.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-lg bg-sala p-4">
                <p className="font-bold">Logo</p>
                <div className="grid h-32 place-items-center rounded-lg p-3" style={{ background: p.color_fondo ?? "#17121f" }}>
                  {p.logo_path ? <img src={assetUrl(p.logo_path)} alt="Logo actual" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-texto-3">Sin logo</span>}
                </div>
                <ImageUpload productionId={id} kind="logo" carpeta="kit" base="logo" save={saveKitImage.bind(null, id, "logo")} label={p.logo_path ? "Cambiar logo" : "Subir logo"} />
              </div>
              <div className="flex flex-col gap-3 rounded-lg bg-sala p-4">
                <p className="font-bold">Imagen de ambiente</p>
                <div className="aspect-video overflow-hidden rounded-lg bg-telon-2">
                  {p.ambiente_path ? <img src={assetUrl(p.ambiente_path)} alt="Ambiente actual" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-sm text-texto-3">Sin imagen</span>}
                </div>
                <ImageUpload productionId={id} kind="ambiente" carpeta="kit" base="ambiente" save={saveKitImage.bind(null, id, "ambiente")} label={p.ambiente_path ? "Cambiar imagen" : "Subir imagen"} />
              </div>
            </div>
            <section id="poster" aria-label="Póster oficial" className="flex scroll-mt-24 flex-col gap-3 rounded-lg bg-sala p-4">
              <div>
                <p className="font-bold">Póster oficial <span className="font-normal text-texto-3">(opcional; súbelo cuando ya exista)</span></p>
                <p className="text-sm text-texto-3">
                  Cada formato en dos versiones: <b>con toda la información</b> (fechas, lugar, créditos) para donde la página no pone los datos —al compartir la liga y en la página de la obra—
                  y <b>solo imagen</b> (sin textos) para donde la página ya pone el logo y los datos encima —obra destacada, tarjetas, boletos, “Voy a ir”—. Mientras falten, se usa la imagen de ambiente.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {FORMATOS.map((f) => (
                  <div key={f} className="flex flex-col gap-2">
                    <p className="text-sm font-bold">{FORMATO_INFO[f].titulo} <span className="font-normal text-texto-3">· ideal {FORMATO_INFO[f].ideal}</span></p>
                    <p className="text-xs text-texto-3">{FORMATO_INFO[f].uso}</p>
                    {[true, false].map((info) => {
                      const ruta = poster(p, f, info);
                      return (
                        <div key={String(info)} className="flex flex-col gap-1.5 rounded-lg bg-telon-2 p-2">
                          <span className="text-xs font-semibold">{info ? "Con toda la información" : "Solo imagen (sin textos)"}</span>
                          <div className="mx-auto w-28 overflow-hidden rounded bg-sala" style={{ aspectRatio: FORMATO_INFO[f].ratio }}>
                            {ruta ? <img src={assetUrl(ruta)} alt={`${FORMATO_INFO[f].titulo} ${info ? "con información" : "solo imagen"}`} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[11px] text-texto-3">Falta</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <PosterSlot pid={id} formato={f} info={info} tiene={!!ruta} save={savePoster.bind(null, id, f, info)} />
                            {ruta && <ActionForm inline action={quitarPoster} hidden={{ pid: id, formato: f, info: info ? "1" : "0" }} confirm="¿Quitar esta imagen del póster?" submit="Quitar" submitClass="text-xs font-bold text-texto-3 underline" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
            <section id="poster-alterno" aria-label="Póster alterno" className="flex scroll-mt-24 flex-col gap-3 rounded-lg bg-sala p-4">
              <div>
                <p className="font-bold">Póster alterno <span className="font-normal text-texto-3">(opcional)</span></p>
                <p className="text-sm text-texto-3">
                  Otro arte de la obra, en dos versiones: <b>con la información</b> (sale en el kit de prensa) y <b>sin textos ni logo</b>,
                  que se usa de fondo en la invitación de Difusión. Si falta, la invitación usa la imagen de ambiente.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {FORMATOS_ALT.map((f) => (
                  <div key={f} className="flex flex-col gap-2">
                    <p className="text-sm font-bold">{FORMATO_INFO[f].titulo} <span className="font-normal text-texto-3">· ideal {FORMATO_INFO[f].ideal}</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      {[true, false].map((info) => {
                        const ruta = posterAlt(p, f, info);
                        return (
                          <div key={String(info)} className="flex flex-col gap-1.5 rounded-lg bg-telon-2 p-2">
                            <span className="text-xs font-semibold">{info ? "Con la información" : "Sin textos ni logo"}</span>
                            <div className="mx-auto w-28 overflow-hidden rounded bg-sala" style={{ aspectRatio: FORMATO_INFO[f].ratio }}>
                              {ruta ? <img src={assetUrl(ruta)} alt={`Póster alterno ${FORMATO_INFO[f].titulo} ${info ? "con información" : "sin textos"}`} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[11px] text-texto-3">Falta</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <PosterSlot pid={id} formato={f} info={info} alt tiene={!!ruta} save={savePosterAlt.bind(null, id, f, info)} />
                              {ruta && <ActionForm inline action={quitarPoster} hidden={{ pid: id, formato: f, info: info ? "1" : "0", alt: "1" }} confirm="¿Quitar esta imagen del póster alterno?" submit="Quitar" submitClass="text-xs font-bold text-texto-3 underline" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <ColorsForm
              pid={id}
              initial={{ fondo: p.color_fondo ?? "#0b0910", superficie: p.color_superficie ?? "#17121f", texto: p.color_texto ?? "#f4f1f8", acento: p.color_acento ?? "#a48bff" }}
            />
          </Block>

    </div>
  );
}
