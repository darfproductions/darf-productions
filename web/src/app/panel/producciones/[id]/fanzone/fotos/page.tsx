/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { MiniAction } from "@/components/panel/MiniAction";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate, getGallery } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { addGalleryPhoto, avisarFotosFuncion, removeGalleryPhoto } from "../actions";
import { FotosFuncionSubir } from "../FotosFuncionSubir";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export const metadata: Metadata = { title: "Fotos y galería" };

// Fans → Fotos y galería: las fotos de cada función (con el aviso a quienes fueron) y la galería pública de la obra.
export default async function FotosPage({ params }: PageProps<"/panel/producciones/[id]/fanzone/fotos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone/fotos`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [gallery, estado] = await Promise.all([getGallery(id, true), supabase.rpc("fotos_funcion_estado", { pid: id })]);
  type Funcion = { performance_id: string; starts_at: string; fotos: number; con_boleto: number; avisados: number | null; avisado_at: string | null };
  // Funciones que ya empezaron (la base da también las de hoy).
  const ahora = new Date().toISOString();
  const funciones = ((estado.data ?? []) as Funcion[]).filter((f) => f.starts_at <= ahora);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="titular text-xl">Fotos de cada función</h2>
            <p className="mt-1 text-sm text-texto-2">Elige la función y sube sus fotos (puedes elegir varias a la vez). Salen en la galería y en la página de fotos de esa función. Cuando el álbum esté completo, avisa a quienes fueron: les llega un solo aviso en su cuenta y su teléfono.</p>
          </div>
          <FotosFuncionSubir pid={id} funciones={funciones.map((f) => ({ id: f.performance_id, label: formatPerformanceDate(f.starts_at) }))} />
          {funciones.some((f) => f.fotos > 0) && (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {funciones.filter((f) => f.fotos > 0).map((f) => (
                <li key={f.performance_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <b>{formatPerformanceDate(f.starts_at)}</b>
                    <span className="block text-xs text-texto-3">
                      {f.fotos} {f.fotos === 1 ? "foto" : "fotos"} · {f.con_boleto} {f.con_boleto === 1 ? "persona" : "personas"} con boleto y cuenta ·{" "}
                      <Link href={`/producciones/${id}/fotos?funcion=${f.performance_id}`} className="underline" target="_blank">ver página</Link>
                    </span>
                  </span>
                  {f.avisado_at
                    ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">Avisado a {f.avisados} · {formatPerformanceDate(f.avisado_at)}</span>
                    : <ActionForm inline action={avisarFotosFuncion} hidden={{ pid: id, funcion: f.performance_id }}
                        confirm={`¿Avisar a ${f.con_boleto} ${f.con_boleto === 1 ? "persona" : "personas"} que ya están las fotos? Solo se puede una vez.`}
                        submit="Avisar a quienes fueron" submitClass={small} />}
                </li>
              ))}
            </ul>
          )}
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
                <MiniAction action={removeGalleryPhoto} hidden={{ pid: id, id: ph.id }} confirm="¿Quitar esta foto de la galería?"
                  className="absolute right-2 top-2 flex flex-col items-end gap-1" label={<Icono nombre="x" />} ariaLabel="Quitar foto"
                  buttonClass="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-sm font-bold text-white" />
              </li>
            ))}
          </ul>
        </section>
      </Card>
    </div>
  );
}
