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
import { EscanerFan } from "@/components/fanzone/EscanerFan";

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
    supabase.from("fan_encuentros").select("id, performance_id, tipo, titulo, lugar, inicia, requiere_registro, requiere_boleto, cupo, abierto, notas").eq("production_id", id),
  ]);
  const funciones = (funcionesRes.data ?? []) as { id: string; starts_at: string | null }[];
  const fechaDe = new Map(funciones.map((f) => [f.id, f.starts_at]));
  type Ev = { id: string; performance_id: string | null; tipo: "foto" | "evento"; titulo: string | null; lugar: string | null; inicia: string | null; requiere_registro: boolean; requiere_boleto: boolean; cupo: number; abierto: boolean; notas: string | null };
  const cuando = (e: Ev) => (e.performance_id ? fechaDe.get(e.performance_id) ?? null : e.inicia);
  const encuentros = ((encRes.data ?? []) as Ev[]).sort((a, b) => (cuando(a) ?? "").localeCompare(cuando(b) ?? ""));
  const personas = await Promise.all(encuentros.map(async (e) => ((await supabase.rpc("fan_encuentro_personas", { eid: e.id })).data ?? []) as { user_id: string; nombre: string; telefono: string | null; numero: number | null; llegada_at: string | null }[]));
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
            <h2 className="titular text-xl">Eventos del Club Fan</h2>
            <p className="mt-1 text-sm text-texto-2">Foto con el elenco después de una función o eventos exclusivos para socios. En la entrada se escanea la credencial del Club Fan (con QR) y la base revisa si puede pasar: lugar apartado, boleto y cupo. También se puede validar desde Puerta.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {encuentros.map((e, i) => {
              const lista = personas[i];
              const llegaron = lista.filter((x) => x.llegada_at).length;
              const nombre = e.tipo === "foto" ? "Foto con el elenco" : e.titulo ?? "Evento";
              return (
                <li key={e.id} className="rounded-xl border border-linea p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="mr-2 rounded-full bg-oro/15 px-2 py-0.5 text-[11px] font-bold text-oro">{e.tipo === "foto" ? "Foto con el elenco" : "Evento"}</span>
                      <b>{e.tipo === "evento" ? `${nombre} · ` : ""}<span className="capitalize">{formatPerformanceDate(cuando(e))}</span></b>
                      <span className="block text-xs text-texto-3">
                        {e.requiere_registro ? `${lista.length} de ${e.cupo} lugares apartados` : `Sin registro · cupo ${e.cupo}`}
                        {` · ${llegaron} ${llegaron === 1 ? "llegó" : "llegaron"}`}
                        {e.requiere_boleto ? " · pide boleto" : ""}{e.lugar ? ` · ${e.lugar}` : ""}{e.requiere_registro ? ` · registro ${e.abierto ? "abierto" : "cerrado"}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <EscanerFan pid={id} eid={e.id} titulo={nombre} botonClass="fb fb-fz fb-sm" />
                      {e.requiere_registro && <ActionForm inline action={setEncuentro} hidden={{ pid: id, id: e.id, accion: e.abierto ? "cerrar" : "abrir" }} submit={e.abierto ? "Cerrar registro" : "Abrir registro"} submitClass={small} />}
                      <ActionForm inline action={setEncuentro} hidden={{ pid: id, id: e.id, accion: "borrar" }} confirm="¿Borrar este evento y su lista?" submit="Borrar" submitClass={small} />
                    </span>
                  </div>
                  {e.notas && <p className="mt-1 text-xs text-texto-3">{e.notas}</p>}
                  {lista.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-bold text-lila">Ver lista ({lista.length})</summary>
                      <ol className="mt-2 list-decimal pl-5 text-xs">
                        {lista.map((x) => <li key={x.user_id}>{x.nombre || "Sin nombre"}{x.numero ? ` · socio ${numeroSocio(x.numero)}` : ""}{x.telefono ? ` · ${x.telefono}` : ""}{x.llegada_at ? ` · ✓ llegó ${new Date(x.llegada_at).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}` : ""}</li>)}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
            {encuentros.length === 0 && <li className="text-sm text-texto-3">Aún no hay eventos.</li>}
          </ul>
          <details className="rounded-xl border border-linea p-3">
            <summary className="cursor-pointer text-sm font-bold">+ Foto con el elenco (después de una función)</summary>
            <div className="mt-3">
              <ActionForm action={addEncuentro} hidden={{ pid: id, tipo: "foto" }} submit="Crear foto con el elenco">
                <p className="text-xs text-texto-3">Los socios con boleto aprobado de esa función apartan su lugar en la Fan Zone.</p>
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Función
                    <select name="performance" required className={input}>
                      <option value="">Elige…</option>
                      {funciones.filter((f) => f.starts_at && !encuentros.some((e) => e.tipo === "foto" && e.performance_id === f.id)).map((f) => <option key={f.id} value={f.id}>{formatPerformanceDate(f.starts_at)}</option>)}
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
            </div>
          </details>
          <details className="rounded-xl border border-linea p-3">
            <summary className="cursor-pointer text-sm font-bold">+ Evento exclusivo del Club Fan</summary>
            <div className="mt-3">
              <ActionForm action={addEncuentro} hidden={{ pid: id, tipo: "evento" }} submit="Crear evento">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Nombre del evento
                    <input name="titulo" required maxLength={120} placeholder="Ensayo abierto para el club" className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Fecha y hora
                    <input type="datetime-local" name="inicia" required className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Lugar
                    <input name="lugar" maxLength={160} placeholder="Teatro, foro, salón…" className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">Cupo
                    <input type="number" name="cupo" min={1} max={500} defaultValue={30} required className={input} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm font-semibold">Descripción <span className="text-xs font-normal text-texto-3">Opcional: qué pasará, qué llevar…</span>
                  <textarea name="descripcion" maxLength={600} rows={2} className={input} />
                </label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="registro" defaultChecked /> Pide registro (los socios apartan su lugar en la Fan Zone). Sin registro, entra cualquier socio hasta llenar el cupo.</label>
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr] sm:items-end">
                  <label className="flex flex-col gap-1 text-sm font-semibold">Ligado a una función <span className="text-xs font-normal text-texto-3">Opcional</span>
                    <select name="performance" className={input}>
                      <option value="">Ninguna</option>
                      {funciones.filter((f) => f.starts_at).map((f) => <option key={f.id} value={f.id}>{formatPerformanceDate(f.starts_at)}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="boleto" /> Pide boleto de esa función</label>
                </div>
              </ActionForm>
            </div>
          </details>
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
