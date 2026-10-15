/* eslint-disable @next/next/no-img-element -- miniaturas del kit (Storage o archivos propios) */
import type { Metadata } from "next";
import Link from "next/link";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { redirect } from "next/navigation";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, EstadoChip, input } from "@/components/panel/ui";
import { getEditorData } from "@/lib/panel-content";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl } from "@/lib/productions";
import { kitMissing } from "@/lib/themes";
import { quitarPoster, saveFacts, saveGeneral, saveKitImage, savePoster, saveThanks, saveVideos } from "./actions";
import { ActionForm } from "@/components/panel/ActionForm";
import { AnunciosEditor } from "@/components/anuncios/AnunciosEditor";
import { BannerEditor } from "./BannerEditor";
import { ColorsForm } from "./ColorsForm";
import { EditForm } from "./EditForm";
import { EstadoPanel } from "./EstadoPanel";
import { RowsEditor } from "./RowsEditor";
import { SongsEditor } from "./SongsEditor";
import { FORMATOS, FORMATO_INFO, poster } from "@/lib/poster";
import { PosterSlot } from "./PosterSlot";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Página pública" };

const field = (label: string, name: string, value: string | null, extra?: { placeholder?: string; max?: number; wide?: boolean }) => (
  <label className={`flex flex-col gap-1.5 text-sm font-semibold ${extra?.wide ? "sm:col-span-2" : ""}`}>
    {label}
    <input className={input} name={name} defaultValue={value ?? ""} placeholder={extra?.placeholder} maxLength={extra?.max} />
  </label>
);

// 0085: Estado queda abierto arriba; las demás secciones se pliegan (se abren con su pastilla o #ancla).
function Block({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  if (id !== "estado") {
    return (
      <AjustesSeccion id={id} titulo={title}>
        {note && <p className="text-sm text-texto-2">{note}</p>}
        {children}
      </AjustesSeccion>
    );
  }
  return (
    <Card>
      <section id={id} className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">{title}</h2>
          {note && <p className="mt-1 text-sm text-texto-2">{note}</p>}
        </div>
        {children}
      </section>
    </Card>
  );
}

// Editor de la página pública: misma plantilla para todas las obras (docs/DARF-2.0-PRODUCCIONES.md).
export default async function PageEditor({ params }: PageProps<"/panel/producciones/[id]/pagina">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/pagina`);
  const editar = can(access, id, "obra.editar");
  const publicar = can(access, id, "obra.publicar");
  if (!editar && !publicar) redirect(`/panel/producciones/${id}`);
  const data = await getEditorData(id);
  if (!data) redirect("/panel/producciones");
  const p = data.production;
  const faltan = kitMissing(p);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Secciones del editor" className="flex flex-wrap gap-2 text-sm">
        {[["estado", "Estado"], ["datos", "Datos y ficha"], ["kit", "Kit visual"], ["franja", "Franja de avisos"], ["anuncios", "Anuncios"], ["canciones", "Canciones"], ["extra", "Ficha extra"], ["videos", "Videos"], ["gracias", "Agradecimientos"]]
          .filter(([k]) => editar || k === "estado")
          .map(([k, l]) => <a key={k} href={`#${k}`} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:border-white/50">{l}</a>)}
        <Link href={`/vista-previa/${id}`} target="_blank" className="rounded-full bg-texto px-3 py-1.5 font-bold text-sala">Vista previa <Icono nombre="externo" /></Link>
      </nav>

      <Block id="estado" title="Estado y publicación" note="El público solo ve obras publicadas o archivadas. Nada se borra al ocultar, archivar o cancelar.">
        <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-texto-2">Estado actual:</span><EstadoChip estado={p.estado} /></div>
        {faltan.length > 0 ? (
          <div className="rounded-lg bg-sala p-3 text-sm">
            <p className="font-bold text-aviso">Para publicar falta:</p>
            <ul className="mt-1 text-texto-2">{faltan.map((f) => <li key={f}><Icono nombre="punto" className="h-2 w-2 opacity-70" /> {f}</li>)}</ul>
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#bbf7d0]">El kit está completo.</p>
        )}
        {publicar ? <EstadoPanel pid={id} estado={p.estado} onSale={p.on_sale} /> : <p className="text-sm text-texto-3">Publicar o archivar lo hace la Dirección de la obra o el Director.</p>}
      </Block>

      {editar && (
        <>
          <Block id="datos" title="Datos y ficha técnica" note="La ficha se muestra en este orden en todas las obras. Deja vacío lo que no aplique.">
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

          <Block id="kit" title="Kit visual" note="Las mismas piezas en todas las obras. El logo va en una caja fija y la imagen de ambiente al fondo del encabezado.">
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
            <ColorsForm
              pid={id}
              initial={{ fondo: p.color_fondo ?? "#0b0910", superficie: p.color_superficie ?? "#17121f", texto: p.color_texto ?? "#f4f1f8", acento: p.color_acento ?? "#a48bff" }}
            />
          </Block>

          <Block id="franja" title="Franja de avisos" note="Una barra abajo del encabezado de la obra para anunciar cosas: últimas funciones, promociones, audiciones… Puede correr como marquesina o quedarse fija, con varios avisos que se turnan.">
            <BannerEditor pid={id} banner={data.banner} acento={p.color_acento ?? "#a48bff"} />
          </Block>

          <Block id="anuncios" title="Anuncios" note="Tarjetas en la página de la obra o en la Fan Zone: revelación del elenco, nuevas fechas, convocatorias… Con fecha de revelación se ve una cuenta regresiva y el botón Avísame.">
            <AnunciosEditor scope={id} />
          </Block>

          <Block id="canciones" title="Canciones">
            <SongsEditor pid={id} initial={data.actos} />
          </Block>

          <Block id="extra" title="Ficha extra" note="Datos que no están en la ficha fija (por ejemplo: Colectivo, Producción asociada).">
            <RowsEditor pid={id} action={saveFacts} initial={data.facts.map((f) => [f.etiqueta, f.valor])} fields={[{ name: "etiqueta", placeholder: "Etiqueta" }, { name: "valor", placeholder: "Valor" }]} submit="Guardar ficha extra" addLabel="+ Agregar dato" />
          </Block>

          <Block id="videos" title="Videos públicos" note="Enlaces de YouTube (pro-shot, tráiler…). Los ensayos van en la pestaña Fan Zone.">
            <RowsEditor pid={id} action={saveVideos} hidden={{ tipo: "video" }} initial={data.videos.map((v) => [v.titulo, `https://youtu.be/${v.youtube_id}`])} fields={[{ name: "titulo", placeholder: "Título" }, { name: "enlace", placeholder: "https://youtu.be/…" }]} submit="Guardar videos" addLabel="+ Agregar video" />
          </Block>

          <Block id="gracias" title="Agradecimientos" note="Uno por renglón.">
            <EditForm action={saveThanks} pid={id} submit="Guardar agradecimientos">
              <textarea className={`${input} min-h-36 leading-7`} name="thanks" defaultValue={data.thanks.join("\n")} />
            </EditForm>
          </Block>
        </>
      )}
    </div>
  );
}
