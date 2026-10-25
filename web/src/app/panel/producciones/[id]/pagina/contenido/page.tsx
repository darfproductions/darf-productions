import type { Metadata } from "next";
import { input } from "@/components/panel/ui";
import { saveFacts, saveGeneral, saveThanks, saveVideos } from "../actions";
import { EditForm } from "../EditForm";
import { RowsEditor } from "../RowsEditor";
import { SongsEditor } from "../SongsEditor";
import { Block, cargarEditor, field } from "../editor";

export const metadata: Metadata = { title: "Contenido de la página" };

// Página pública → Contenido: datos y ficha, canciones, ficha extra, videos y agradecimientos.
export default async function ContenidoPage({ params }: PageProps<"/panel/producciones/[id]/pagina/contenido">) {
  const { id } = await params;
  const { p, cambio, actos, facts, videos, thanks } = await cargarEditor(id, "pagina/contenido");
  return (
    <div className="flex flex-col gap-4">
          <Block id="datos" abierto cambio={cambio("datos")} title="Datos y ficha técnica" note="La ficha se muestra en este orden en todas las obras. Deja vacío lo que no aplique.">
            <EditForm action={saveGeneral} pid={id} submit="Guardar datos">
              <div className="grid gap-3 sm:grid-cols-2">
                {field("Nombre de la obra", "nombre", p.nombre, { wide: true })}
                {field("Frase corta (bajo el logo, máx. 120)", "frase", p.frase, { max: 120, wide: true, placeholder: "Una boda, tres posibles padres y la música de ABBA." })}
                {field("Temporada", "temporada", p.temporada, { placeholder: "2027" })}
                {field("Fechas", "fecha", p.fecha, { placeholder: "Mayo de 2027" })}
                {field("Sede", "venue", p.venue, { placeholder: "Teatro…" })}
                {field("Duración", "duracion", p.duracion, { placeholder: "~2 h con intermedio" })}
                {field("Clasificación", "clasificacion", p.clasificacion, { placeholder: "Toda la familia" })}
                {field("Idioma", "idioma", p.idioma, { placeholder: "Español" })}
                {field("Basada en", "basada_en", p.basada_en)}
                <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Sinopsis (deja una línea en blanco entre párrafos)
                  <textarea className={`${input} min-h-48 leading-7`} name="sinopsis" defaultValue={p.sinopsis ?? ""} />
                </label>
              </div>
            </EditForm>
          </Block>

          <Block id="canciones" cambio={cambio("canciones")} title="Canciones">
            <SongsEditor pid={id} initial={actos.length ? actos : [{ nombre: "", canciones: [] }]} />
          </Block>

          <Block id="extra" cambio={cambio("ficha")} title="Ficha extra" note="Datos que no están en la ficha fija (por ejemplo: Colectivo, Producción asociada).">
            <RowsEditor pid={id} action={saveFacts} initial={facts.map((f) => [f.etiqueta, f.valor])} fields={[{ name: "etiqueta", placeholder: "Etiqueta" }, { name: "valor", placeholder: "Valor" }]} submit="Guardar ficha extra" addLabel="+ Agregar dato" />
          </Block>

          <Block id="videos" cambio={cambio("videos")} title="Videos públicos" note="Enlaces de YouTube (pro-shot, tráiler…). Los ensayos van en la pestaña Fan Zone.">
            <RowsEditor pid={id} action={saveVideos} hidden={{ tipo: "video" }} initial={videos.map((v) => [v.titulo, `https://youtu.be/${v.youtube_id}`])} fields={[{ name: "titulo", placeholder: "Título" }, { name: "enlace", placeholder: "https://youtu.be/…" }]} submit="Guardar videos" addLabel="+ Agregar video" />
          </Block>

          <Block id="gracias" cambio={cambio("gracias")} title="Agradecimientos" note="Uno por renglón.">
            <EditForm action={saveThanks} pid={id} submit="Guardar agradecimientos">
              <textarea className={`${input} min-h-36 leading-7`} name="thanks" defaultValue={thanks.join("\n")} />
            </EditForm>
          </Block>
    </div>
  );
}
