import { redirect } from "next/navigation";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { Card, input } from "@/components/panel/ui";
import { getEditorData } from "@/lib/panel-content";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getCambios, getCapa } from "@/lib/obra-capa";
import { obraConCapa, ordenarCambios, type Seccion } from "@/lib/obra-capa-rules";

// Editor de la página pública, en 4 páginas (Publicar · Contenido · Imagen · Avisos): lo que comparten.

export const field = (label: string, name: string, value: string | null, extra?: { placeholder?: string; max?: number; wide?: boolean }) => (
  <label className={`flex flex-col gap-1.5 text-sm font-semibold ${extra?.wide ? "sm:col-span-2" : ""}`}>
    {label}
    <input className={input} name={name} defaultValue={value ?? ""} placeholder={extra?.placeholder} maxLength={extra?.max} />
  </label>
);

/** Una sección del editor: abierta en tarjeta, o plegada (se abre con su #ancla). */
export function Block({ id, title, children, note, cambio, abierto = false }: { id: string; title: string; children: React.ReactNode; note?: string; cambio?: "borrador" | "fans"; abierto?: boolean }) {
  const aviso = cambio === "borrador" ? "Borrador sin publicar" : cambio === "fans" ? "Solo lo ven los fans" : undefined;
  if (!abierto) {
    return (
      <AjustesSeccion id={id} titulo={title} resumen={aviso}>
        {note && <p className="text-sm text-texto-2">{note}</p>}
        {children}
      </AjustesSeccion>
    );
  }
  return (
    <Card>
      <section id={id} className="flex scroll-mt-24 flex-col gap-4">
        <div>
          <h2 className="titular text-xl">{title}{aviso && <span className="ml-2 align-middle text-xs font-bold text-aviso">{aviso}</span>}</h2>
          {note && <p className="mt-1 text-sm text-texto-2">{note}</p>}
        </div>
        {children}
      </section>
    </Card>
  );
}

/** Datos del editor con lo más nuevo de cada sección (borrador o lo de fans, 0119) encima de lo publicado. */
export async function cargarEditor(id: string, ruta: string, soloEditar = true) {
  const access = await requirePanel(`/panel/producciones/${id}/${ruta}`);
  const editar = can(access, id, "obra.editar");
  const publicar = can(access, id, "obra.publicar");
  if (!editar && !publicar) redirect(`/panel/producciones/${id}`);
  if (soloEditar && !editar) redirect(`/panel/producciones/${id}/pagina`);
  const [data, capa, cambiosRaw] = await Promise.all([getEditorData(id), getCapa(id, "borrador"), getCambios(id)]);
  if (!data) redirect("/panel/producciones");
  const cambios = ordenarCambios(cambiosRaw);
  const cambio = (...ss: Seccion[]) => {
    const cs = cambios.filter((c) => ss.includes(c.seccion));
    return cs.some((c) => c.borrador) ? "borrador" as const : cs.some((c) => c.fans) ? "fans" as const : undefined;
  };
  return {
    access, editar, publicar, data, capa, cambios, cambio,
    p: obraConCapa(data.production, capa),
    actos: capa.canciones?.actos ?? data.actos,
    facts: capa.ficha?.items ?? data.facts,
    videos: capa.videos?.items ?? data.videos,
    thanks: capa.gracias?.items ?? data.thanks,
    banner: capa.franja ?? data.banner,
  };
}
