import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, input } from "@/components/panel/ui";
import { ActionForm } from "@/components/panel/ActionForm";
import { isoToLocalMx } from "@/lib/dates";
import { FAN_CATEGORIAS, FAN_TIPOS, dominio, type FanCategoria } from "@/lib/fanzone-rules";
import { listFanzone } from "@/lib/fanzone";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { moveFanzoneItem, removeFanzoneItem, setFanzoneDetalle, setFanzoneFlag } from "./actions";
import { FanzoneForm } from "./FanzoneForm";
import Link from "next/link";
import { EventosLista } from "@/components/panel/EventosLista";
import { Icono } from "@/components/Icono";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export const metadata: Metadata = { title: "Fan Zone y eventos" };

// Fan Zone de la obra: contenidos solo con cuenta (videos, fotos, documentos, enlaces, textos) en el orden que se
// elija, y los eventos de la obra. Las fotos de cada función y la galería pública están en Fans → Fotos y galería.
export default async function FanZoneEditor({ params }: PageProps<"/panel/producciones/[id]/fanzone">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/fanzone`);
  if (!can(access, id, "fanzone.editar")) redirect(`/panel/producciones/${id}`);
  const items = await listFanzone(id);
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
    </div>
  );
}
