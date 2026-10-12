/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Card, input } from "@/components/panel/ui";
import { ActionForm } from "@/components/panel/ActionForm";
import { isoToLocalMx } from "@/lib/dates";
import { FAN_CATEGORIAS, FAN_TIPOS, dominio, numeroSocio, type FanCategoria } from "@/lib/fanzone-rules";
import { listFanzone } from "@/lib/fanzone";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate, getGallery } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { addEncuentro, addGalleryPhoto, moveFanzoneItem, removeFanzoneItem, removeGalleryPhoto, setEncuentro, setFanzoneDetalle, setFanzoneFlag } from "./actions";
import { FanzoneForm } from "./FanzoneForm";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export const metadata: Metadata = { title: "Fan Zone" };

// Fan Zone de la obra: contenidos solo con cuenta (videos, fotos, documentos, enlaces, textos)
// en el orden que se elija, y la galería pública de la página de la obra.
export default async function FanZoneEditor({ params }: PageProps<"/panel/producciones/[id]/fanzone">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [items, gallery, funcionesRes, encRes] = await Promise.all([
    listFanzone(id),
    getGallery(id),
    supabase.from("performances").select("id, starts_at").eq("production_id", id).order("starts_at"),
    supabase.from("fan_encuentros").select("id, performance_id, cupo, abierto, notas").eq("production_id", id),
  ]);
  const funciones = (funcionesRes.data ?? []) as { id: string; starts_at: string | null }[];
  const encuentros = (encRes.data ?? []) as { id: string; performance_id: string; cupo: number; abierto: boolean; notas: string | null }[];
  const personas = await Promise.all(encuentros.map(async (e) => ((await supabase.rpc("fan_encuentro_personas", { eid: e.id })).data ?? []) as { user_id: string; nombre: string; telefono: string | null; numero: number | null }[]));
  const fechaDe = new Map(funciones.map((f) => [f.id, f.starts_at]));
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
                  <span className="mr-1 text-texto-3">{FAN_TIPOS[it.tipo].icono}</span>
                  <b>{it.titulo}</b>
                  {it.destacado && <span className="ml-2 rounded-full bg-aviso/20 px-2 py-0.5 text-[11px] font-bold text-aviso">Destacado</span>}
                  {!it.visible && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">Oculto</span>}
                  <span className="block truncate text-xs text-texto-3">
                    {FAN_CATEGORIAS[it.categoria]} · {FAN_TIPOS[it.tipo].label}
                    {it.disponible_desde && ` · 🔒 hasta ${formatPerformanceDate(it.disponible_desde)}`}
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
          <div>
            <h2 className="titular text-xl">Foto con el elenco</h2>
            <p className="mt-1 text-sm text-texto-2">Encuentro después de una función, con cupo. Los socios del Club Fan con boleto aprobado de esa función apartan su lugar en la Fan Zone.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {encuentros.map((e, i) => {
              const lista = personas[i];
              const f = fechaDe.get(e.performance_id) ?? null;
              return (
                <li key={e.id} className="rounded-xl border border-linea p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b className="capitalize">{formatPerformanceDate(f)}</b> · {lista.length} de {e.cupo} lugares · {e.abierto ? "Abierto" : "Cerrado"}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <ActionForm inline action={setEncuentro} hidden={{ pid: id, id: e.id, accion: e.abierto ? "cerrar" : "abrir" }} submit={e.abierto ? "Cerrar registro" : "Abrir registro"} submitClass={small} />
                      <ActionForm inline action={setEncuentro} hidden={{ pid: id, id: e.id, accion: "borrar" }} confirm="¿Borrar este encuentro y su lista?" submit="Borrar" submitClass={small} />
                    </span>
                  </div>
                  {e.notas && <p className="mt-1 text-xs text-texto-3">{e.notas}</p>}
                  {lista.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-bold text-lila">Ver lista ({lista.length})</summary>
                      <ol className="mt-2 list-decimal pl-5 text-xs">
                        {lista.map((x) => <li key={x.user_id}>{x.nombre || "Sin nombre"}{x.numero ? ` · socio ${numeroSocio(x.numero)}` : ""}{x.telefono ? ` · ${x.telefono}` : ""}</li>)}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
            {encuentros.length === 0 && <li className="text-sm text-texto-3">Aún no hay encuentros.</li>}
          </ul>
          <ActionForm action={addEncuentro} hidden={{ pid: id }} submit="Crear encuentro">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="flex flex-col gap-1 text-sm font-semibold">Función
                <select name="performance" required className={input}>
                  <option value="">Elige…</option>
                  {funciones.filter((f) => f.starts_at && !encuentros.some((e) => e.performance_id === f.id)).map((f) => <option key={f.id} value={f.id}>{formatPerformanceDate(f.starts_at)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Cupo
                <input type="number" name="cupo" min={1} max={500} defaultValue={20} required className={input} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">Notas <span className="text-xs font-normal text-texto-3">Opcional: dónde se reúnen, a qué hora…</span>
              <input name="notas" maxLength={300} className={input} />
            </label>
          </ActionForm>
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
