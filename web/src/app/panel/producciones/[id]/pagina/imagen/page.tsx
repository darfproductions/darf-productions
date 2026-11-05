import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { FORMATOS, FORMATOS_ALT, FORMATO_INFO, poster, posterAlt } from "@/lib/poster";
import { assetUrl } from "@/lib/productions";
import { quitarPoster, saveKitImage, savePoster, savePosterAlt } from "../actions";
import { ColorsForm } from "../ColorsForm";
import { Miniatura } from "../Miniatura";
import { PosterSlot } from "../PosterSlot";
import { Block, cargarEditor } from "../editor";

export const metadata: Metadata = { title: "Imágenes" };

const quitar = "text-[11px] font-bold text-texto-2 underline";

// Página pública → Imágenes (0138): todo en miniaturas. Logo y ambiente lado a lado; el póster oficial en una fila
// (cada formato con y sin textos) y el alterno en otra. "Cambiar" aparece al pasar el cursor. Difusión y Programa usan esto.
export default async function ImagenPage({ params }: PageProps<"/panel/producciones/[id]/pagina/imagen">) {
  const { id } = await params;
  const { p, cambio } = await cargarEditor(id, "pagina/imagen");
  const fila = "flex flex-wrap gap-3";
  return (
    <div className="flex flex-col gap-4">
      <Block id="kit" abierto cambio={cambio("kit", "colores", "poster")} title="Logo e imagen de ambiente" note="Las mismas piezas en todas las obras: el logo va en una caja fija y la imagen de ambiente al fondo del encabezado. Pasa el cursor por una imagen para cambiarla.">
        <div className={fila}>
          <Miniatura titulo="Logo" nota="PNG con fondo transparente" src={p.logo_path ? assetUrl(p.logo_path) : null} alt="Logo actual" ratio={1} fondo={p.color_fondo ?? "#17121f"} contener falta="Sin logo"
            acciones={<ImageUpload productionId={id} kind="logo" carpeta="kit" base="logo" save={saveKitImage.bind(null, id, "logo")} label={p.logo_path ? "Cambiar" : "Subir"} compact />} />
          <Miniatura titulo="Imagen de ambiente" nota="Fondo del encabezado" src={p.ambiente_path ? assetUrl(p.ambiente_path) : null} alt="Ambiente actual" ratio={16 / 9} falta="Sin imagen"
            acciones={<ImageUpload productionId={id} kind="ambiente" carpeta="kit" base="ambiente" save={saveKitImage.bind(null, id, "ambiente")} label={p.ambiente_path ? "Cambiar" : "Subir"} compact />} />
        </div>
      </Block>

      <Block id="poster" abierto title="Póster oficial" note="Opcional: súbelo cuando ya exista. Cada formato en dos versiones: con toda la información (fechas, lugar, créditos) para donde la página no pone los datos, y solo imagen (sin textos) para donde la página ya pone el logo y los datos encima. Mientras falten, se usa la imagen de ambiente.">
        <div className={fila}>
          {FORMATOS.flatMap((f) => [true, false].map((info) => {
            const ruta = poster(p, f, info);
            return (
              <Miniatura key={`${f}-${info}`} titulo={FORMATO_INFO[f].titulo} nota={`${info ? "Con información" : "Solo imagen"} · ideal ${FORMATO_INFO[f].ideal}`}
                src={ruta ? assetUrl(ruta) : null} alt={`${FORMATO_INFO[f].titulo} ${info ? "con información" : "solo imagen"}`} ratio={FORMATO_INFO[f].ratio}
                acciones={<>
                  <PosterSlot pid={id} formato={f} info={info} tiene={!!ruta} save={savePoster.bind(null, id, f, info)} />
                  {ruta && <ActionForm inline action={quitarPoster} hidden={{ pid: id, formato: f, info: info ? "1" : "0" }} confirm="¿Quitar esta imagen del póster?" submit="Quitar" submitClass={quitar} />}
                </>} />
            );
          }))}
        </div>
        <details className="text-sm text-texto-3">
          <summary className="cursor-pointer font-semibold text-texto-2">¿Dónde se usa cada formato?</summary>
          <ul className="mt-2 flex flex-col gap-1">{FORMATOS.map((f) => <li key={f}><b className="text-texto">{FORMATO_INFO[f].titulo}:</b> {FORMATO_INFO[f].uso}</li>)}</ul>
        </details>
      </Block>

      <Block id="poster-alterno" abierto title="Póster alterno" note="Opcional. Otro arte de la obra: con la información (sale en el kit de prensa) y sin textos ni logo (fondo de la invitación de Difusión). Si falta, la invitación usa la imagen de ambiente.">
        <div className={fila}>
          {FORMATOS_ALT.flatMap((f) => [true, false].map((info) => {
            const ruta = posterAlt(p, f, info);
            return (
              <Miniatura key={`${f}-${info}`} titulo={FORMATO_INFO[f].titulo} nota={`${info ? "Con información" : "Sin textos ni logo"} · ideal ${FORMATO_INFO[f].ideal}`}
                src={ruta ? assetUrl(ruta) : null} alt={`Póster alterno ${FORMATO_INFO[f].titulo} ${info ? "con información" : "sin textos"}`} ratio={FORMATO_INFO[f].ratio}
                acciones={<>
                  <PosterSlot pid={id} formato={f} info={info} alt tiene={!!ruta} save={savePosterAlt.bind(null, id, f, info)} />
                  {ruta && <ActionForm inline action={quitarPoster} hidden={{ pid: id, formato: f, info: info ? "1" : "0", alt: "1" }} confirm="¿Quitar esta imagen del póster alterno?" submit="Quitar" submitClass={quitar} />}
                </>} />
            );
          }))}
        </div>
      </Block>

      <Block id="colores" abierto cambio={cambio("colores")} title="Colores">
        <ColorsForm
          pid={id}
          initial={{ fondo: p.color_fondo ?? "#0b0910", superficie: p.color_superficie ?? "#17121f", texto: p.color_texto ?? "#f4f1f8", acento: p.color_acento ?? "#a48bff" }}
          logoUrl={p.logo_path ? assetUrl(p.logo_path) : null}
        />
      </Block>
    </div>
  );
}
