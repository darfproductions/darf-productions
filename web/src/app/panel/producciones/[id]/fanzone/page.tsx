/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card } from "@/components/panel/ui";
import { ActionForm } from "@/components/panel/ActionForm";
import { FAN_TIPOS, dominio } from "@/lib/fanzone-rules";
import { listFanzone } from "@/lib/fanzone";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getGallery } from "@/lib/productions";
import { addGalleryPhoto, moveFanzoneItem, removeFanzoneItem, removeGalleryPhoto, setFanzoneFlag } from "./actions";
import { FanzoneForm } from "./FanzoneForm";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone de la obra: contenidos solo con cuenta (videos, fotos, documentos, enlaces, textos)
// en el orden que se elija, y la galería pública de la página de la obra.
export default async function FanZoneEditor({ params }: PageProps<"/panel/producciones/[id]/fanzone">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const [items, gallery] = await Promise.all([listFanzone(id), getGallery(id)]);
  const h = (iid: string, extra: Record<string, string>) => ({ pid: id, id: iid, ...extra });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="titular text-xl">Contenidos <span className="text-base font-normal text-texto-3">· {items.length}</span></h2>
            <p className="mt-1 text-sm text-texto-2">Solo los ve quien tiene cuenta en DARF, en este orden. Los destacados van hasta arriba; los ocultos no se ven.</p>
          </div>
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {items.map((it, i) => (
              <li key={it.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${it.visible ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="mr-1 text-texto-3">{FAN_TIPOS[it.tipo].icono}</span>
                  <b>{it.titulo}</b>
                  {it.destacado && <span className="ml-2 rounded-full bg-[#fde68a]/20 px-2 py-0.5 text-[11px] font-bold text-[#fde68a]">Destacado</span>}
                  {!it.visible && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">Oculto</span>}
                  <span className="block truncate text-xs text-texto-3">
                    {FAN_TIPOS[it.tipo].label}
                    {it.url && ` · ${dominio(it.url)}`}
                    {it.archivo_url && <> · <a href={it.archivo_url} target="_blank" rel="noreferrer" className="underline">ver archivo</a></>}
                    {it.youtube_id && <> · <a href={`https://youtu.be/${it.youtube_id}`} target="_blank" rel="noreferrer" className="underline">ver video</a></>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {i > 0 && items[i - 1].destacado === it.destacado && <ActionForm inline action={moveFanzoneItem} hidden={h(it.id, { dir: "arriba" })} submit="↑" submitClass={small} />}
                  {i < items.length - 1 && items[i + 1].destacado === it.destacado && <ActionForm inline action={moveFanzoneItem} hidden={h(it.id, { dir: "abajo" })} submit="↓" submitClass={small} />}
                  <ActionForm inline action={setFanzoneFlag} hidden={h(it.id, { campo: "destacado", valor: it.destacado ? "no" : "si" })} submit={it.destacado ? "Quitar destacado" : "Destacar"} submitClass={small} />
                  <ActionForm inline action={setFanzoneFlag} hidden={h(it.id, { campo: "visible", valor: it.visible ? "no" : "si" })} submit={it.visible ? "Ocultar" : "Mostrar"} submitClass={small} />
                  <ActionForm inline action={removeFanzoneItem} hidden={h(it.id, {})} confirm={`¿Quitar “${it.titulo}”?${it.archivo_path ? " Se borra el archivo." : ""}`} submit="Quitar" submitClass={small} />
                </span>
              </li>
            ))}
            {items.length === 0 && <li className="py-2 text-texto-3">Aún no hay contenidos.</li>}
          </ul>
        </section>
      </Card>
      <Card>
        <h2 className="titular mb-3 text-xl">Agregar contenido</h2>
        <FanzoneForm pid={id} />
      </Card>
      <Card>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="titular text-xl">Galería <span className="text-base font-normal text-texto-3">· {gallery.length}</span></h2>
            <p className="mt-1 text-sm text-texto-2">Fotos públicas de la obra. Se muestran en su página, en el orden en que se suben.</p>
          </div>
          <ImageUpload productionId={id} kind="galeria" carpeta="galeria" bucket="gallery" base="foto" save={addGalleryPhoto.bind(null, id)} label="Subir foto" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((ph) => (
              <li key={ph.id} className="relative overflow-hidden rounded-xl">
                <img src={ph.url} alt="" className="aspect-[4/3] w-full object-cover" />
                <form action={removeGalleryPhoto} className="absolute right-2 top-2">
                  <input type="hidden" name="pid" value={id} />
                  <input type="hidden" name="id" value={ph.id} />
                  <ConfirmSubmit message="¿Quitar esta foto de la galería?" className="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-sm font-bold text-white">×</ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </Card>
    </div>
  );
}
