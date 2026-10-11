/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card } from "@/components/panel/ui";
import { getEditorData } from "@/lib/panel-content";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getGallery } from "@/lib/productions";
import { saveVideos } from "../pagina/actions";
import { RowsEditor } from "../pagina/RowsEditor";
import { addGalleryPhoto, removeGalleryPhoto } from "./actions";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone de la obra: videos de ensayo (solo con cuenta) y galería pública.
export default async function FanZoneEditor({ params }: PageProps<"/panel/producciones/[id]/fanzone">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const [data, gallery] = await Promise.all([getEditorData(id), getGallery(id)]);
  if (!data) redirect("/panel/producciones");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="titular text-xl">Videos de ensayo</h2>
            <p className="mt-1 text-sm text-texto-2">Solo los ve quien tiene cuenta en DARF (Fan Zone). Enlaces de YouTube.</p>
          </div>
          <RowsEditor pid={id} action={saveVideos} hidden={{ tipo: "ensayo" }} initial={data.ensayos.map((v) => [v.titulo, `https://youtu.be/${v.youtube_id}`])} fields={[{ name: "titulo", placeholder: "Dancing Queen · Ensayo" }, { name: "enlace", placeholder: "https://youtu.be/…" }]} submit="Guardar ensayos" addLabel="+ Agregar ensayo" />
        </section>
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
