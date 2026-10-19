/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, input } from "@/components/panel/ui";
import { ActionForm } from "@/components/panel/ActionForm";
import { isoToLocalMx } from "@/lib/dates";
import { FAN_CATEGORIAS, FAN_TIPOS, dominio, type FanCategoria } from "@/lib/fanzone-rules";
import { listFanzone } from "@/lib/fanzone";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate, getGallery } from "@/lib/productions";
import { addGalleryPhoto, avisarFotosFuncion, moveFanzoneItem, removeFanzoneItem, removeGalleryPhoto, setFanzoneDetalle, setFanzoneFlag } from "./actions";
import { FanzoneForm } from "./FanzoneForm";
import { FotosFuncionSubir } from "./FotosFuncionSubir";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { EventosLista } from "@/components/panel/EventosLista";
import { MiniAction } from "@/components/panel/MiniAction";
import { Icono } from "@/components/Icono";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone de la obra: contenidos solo con cuenta (videos, fotos, documentos, enlaces, textos)
// en el orden que se elija, y la galería pública de la página de la obra.
export default async function FanZoneEditor({ params }: PageProps<"/panel/producciones/[id]/fanzone">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [items, gallery, estado] = await Promise.all([
    listFanzone(id),
    getGallery(id),
    supabase.rpc("fotos_funcion_estado", { pid: id }),
  ]);
  type Funcion = { performance_id: string; starts_at: string; fotos: number; con_boleto: number; avisados: number | null; avisado_at: string | null };
  // Funciones que ya empezaron (la base da también las de hoy).
  const ahora = new Date().toISOString();
  const funciones = ((estado.data ?? []) as Funcion[]).filter((f) => f.starts_at <= ahora);
  const h = (iid: string, extra: Record<string, string>) => ({ pid: id, id: iid, ...extra });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="titular text-xl">Contenidos <span className="text-base font-normal text-texto-3">· {items.length}</span></h2>
            <p className="mt-1 text-sm text-texto-2">Solo los ven los socios del Club Fan, en este orden y en su pestaña. Los destacados van hasta arriba; los ocultos no se ven; con fecha de desbloqueo se ven con candado hasta ese día.</p>
          </div>
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {items.map((it, i) => (
              <li key={it.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${it.visible ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="mr-1 text-texto-3"><Icono nombre={FAN_TIPOS[it.tipo].icono} /></span>
                  <b>{it.titulo}</b>
                  {it.destacado && <span className="ml-2 rounded-full bg-aviso/20 px-2 py-0.5 text-[11px] font-bold text-aviso">Destacado</span>}
                  {!it.visible && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">Oculto</span>}
                  <span className="block truncate text-xs text-texto-3">
                    {FAN_CATEGORIAS[it.categoria]} · {FAN_TIPOS[it.tipo].label}
                    {it.disponible_desde && <> · <Icono nombre="candado" /> hasta el {formatPerformanceDate(it.disponible_desde).toLowerCase()}</>}
                    {it.url && ` · ${dominio(it.url)}`}
                    {it.archivo_url && <> · <a href={it.archivo_url} target="_blank" rel="noreferrer" className="underline">ver archivo</a></>}
                    {it.youtube_id && <> · <a href={`https://youtu.be/${it.youtube_id}`} target="_blank" rel="noreferrer" className="underline">ver video</a></>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {i > 0 && items[i - 1].destacado === it.destacado && <ActionForm inline action={moveFanzoneItem} hidden={h(it.id, { dir: "arriba" })} submit={<Icono nombre="flecha-arriba" etiqueta="Subir" />} submitClass={small} />}
                  {i < items.length - 1 && items[i + 1].destacado === it.destacado && <ActionForm inline action={moveFanzoneItem} hidden={h(it.id, { dir: "abajo" })} submit={<Icono nombre="flecha-abajo" etiqueta="Bajar" />} submitClass={small} />}
                  <ActionForm inline action={setFanzoneFlag} hidden={h(it.id, { campo: "destacado", valor: it.destacado ? "no" : "si" })} submit={it.destacado ? "Quitar destacado" : "Destacar"} submitClass={small} />
                  <ActionForm inline action={setFanzoneFlag} hidden={h(it.id, { campo: "visible", valor: it.visible ? "no" : "si" })} submit={it.visible ? "Ocultar" : "Mostrar"} submitClass={small} />
                  <details className="relative">
                    <summary className={`${small} cursor-pointer list-none`}>Pestaña y fecha</summary>
                    <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-linea-2 bg-telon p-3 shadow-xl">
                      <ActionForm action={setFanzoneDetalle} hidden={h(it.id, {})} submit="Guardar" submitClass={small}>
                        <select name="categoria" defaultValue={it.categoria} className={input}>
                          {(Object.keys(FAN_CATEGORIAS) as FanCategoria[]).map((c) => <option key={c} value={c}>{FAN_CATEGORIAS[c]}</option>)}
                        </select>
                        <label className="flex flex-col gap-1 text-xs font-semibold">Se desbloquea el (vacío = ya)
                          <input type="datetime-local" name="disponible_desde" defaultValue={isoToLocalMx(it.disponible_desde)} className={input} />
                        </label>
                      </ActionForm>
                    </div>
                  </details>
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="titular text-xl">Eventos de esta obra</h2>
              <p className="mt-1 text-sm text-texto-2">Foto con el elenco, tours, early access, ensayos abiertos, transmisiones… Se crean en Panel <Icono nombre="flecha-der" /> Eventos. En la entrada se valida la credencial del Club Fan (también desde Puerta).</p>
            </div>
            <Link href={`/panel/eventos?obra=${id}`} className="fb fb-fz fb-sm">+ Crear evento</Link>
          </div>
          <EventosLista access={access} pid={id} />
        </section>
      </Card>
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
