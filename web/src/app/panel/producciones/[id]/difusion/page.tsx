/* eslint-disable @next/next/no-img-element -- vistas previas generadas por la ruta de imagen */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, button, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { funcionPorOmision, getObraDifusion } from "@/lib/difusion-datos";
import { DISENOS, fechaLarga, hora } from "@/lib/difusion-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Difusión" };

const pill = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Difusión (0111): diseños listos para redes (post 4:5 e historia 9:16) con los colores, el logo y la imagen
// de ambiente de la obra, en el mismo estilo de la tarjeta del elenco.
export default async function Difusion({ params, searchParams }: PageProps<"/panel/producciones/[id]/difusion">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/difusion`);
  if (!can(access, id, "obra.editar") && !can(access, id, "obra.publicar")) redirect(`/panel/producciones/${id}`);
  const obra = await getObraDifusion(id);
  if (!obra) redirect("/panel/producciones");
  const pedida = typeof sp.funcion === "string" ? obra.funciones.find((f) => f.id === sp.funcion) : undefined;
  const funcion = pedida ?? funcionPorOmision(obra.funciones);
  const liga = (tipo: string, f: "post" | "historia", extra: Record<string, string> = {}) =>
    `/panel/producciones/${id}/difusion/${tipo}?${new URLSearchParams({ f, ...(funcion ? { funcion: funcion.id } : {}), ...extra })}`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="titular text-xl">Difusión</h2>
        <p className="mt-1 text-sm text-texto-2">
          Diseños listos para Instagram, Facebook y WhatsApp con los colores y el logo de la obra. Cada uno se descarga en post (4:5) o en historia (9:16).
          {obra.fondo.post ? " Usan la imagen de ambiente de la obra." : " Para que lleven foto, sube la imagen de ambiente en Página pública."}
        </p>
        {obra.funciones.length > 0 ? (
          <form className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-xs font-semibold">Función (para los diseños que hablan de una fecha)
              <select name="funcion" defaultValue={funcion?.id} className={input}>
                {obra.funciones.map((f) => <option key={f.id} value={f.id}>{fechaLarga(f.starts_at)} · {hora(f.starts_at)}</option>)}
              </select>
            </label>
            <button className={button}>Usar esta función</button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-aviso">Esta obra aún no tiene funciones: los diseños con fecha dirán “Próximamente”.</p>
        )}
      </Card>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {DISENOS.map((d) => {
          const temporada: Record<string, string> = d.id === "agotadas" ? { funcion: "todas" } : {};
          return (
            <li key={d.id}>
              <Card className="flex h-full flex-col gap-3">
                <div>
                  <h3 className="font-bold">{d.label}</h3>
                  <p className="text-xs text-texto-3">{d.ayuda}</p>
                </div>
                <img src={liga(d.id, "post", temporada)} alt={`Vista previa: ${d.label}`} loading="lazy" width={1080} height={1350} className="aspect-[4/5] w-full rounded-lg bg-sala object-cover" />
                <div className="mt-auto flex flex-wrap gap-2">
                  {d.id === "agotadas" ? (
                    <>
                      <a href={liga(d.id, "post", { funcion: "todas", descargar: "1" })} className={pill}>Temporada · post <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia", { funcion: "todas", descargar: "1" })} className={pill}>Temporada · historia <Icono nombre="flecha-abajo" /></a>
                      {funcion && <a href={liga(d.id, "post", { descargar: "1" })} className={pill}>Esta función · post <Icono nombre="flecha-abajo" /></a>}
                      {funcion && <a href={liga(d.id, "historia", { descargar: "1" })} className={pill}>Esta función · historia <Icono nombre="flecha-abajo" /></a>}
                    </>
                  ) : (
                    <>
                      <a href={liga(d.id, "post", { descargar: "1" })} className={pill}>Post <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia", { descargar: "1" })} className={pill}>Historia <Icono nombre="flecha-abajo" /></a>
                      <a href={liga(d.id, "historia")} target="_blank" rel="noopener" className={`${pill} border-transparent text-texto-3`}>Ver historia</a>
                    </>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
