import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { agregarPersonajeObra, borrarPersonajeObra, editarPersonajeObra, moverPersonajeObra } from "../../../audiciones/votacion-actions";
import { Icono } from "@/components/Icono";

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Personajes de la obra (0089), en orden de importancia: los usan las audiciones de esta obra
// (los traen solos) para las opciones de los jueces, la votación y el cast.
export async function Personajes({ pid }: { pid: string }) {
  const { data } = await (await createClient()).from("production_characters").select("id, nombre, descripcion").eq("production_id", pid).order("orden").order("created_at");
  const lista = (data ?? []) as { id: string; nombre: string; descripcion: string | null }[];
  const h = { pid };
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="titular text-xl">Personajes de la obra</h2>
      <p className="text-sm text-texto-2">En orden de importancia (el de arriba es el principal). Las audiciones de esta obra los toman solos para que los jueces elijan y se vote el cast.</p>
      <ol className="flex flex-col gap-2">
        {lista.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-sala px-3 py-2">
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer"><span className="mr-2 font-mono text-xs text-texto-3">{i + 1}</span><b>{c.nombre}</b>{c.descripcion && <span className="block text-sm text-texto-3">{c.descripcion}</span>}</summary>
              <div className="mt-2">
                <ActionForm action={editarPersonajeObra} hidden={{ ...h, id: c.id }} submit="Guardar" submitClass={ghost}>
                  <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                    <input className={input} name="nombre" required defaultValue={c.nombre} aria-label="Personaje" />
                    <input className={input} name="descripcion" defaultValue={c.descripcion ?? ""} aria-label="Descripción" />
                  </div>
                </ActionForm>
              </div>
            </details>
            <span className="flex items-center gap-1.5">
              {i > 0 && <ActionForm inline action={moverPersonajeObra} hidden={{ ...h, id: c.id, dir: "-1" }} submit={<Icono nombre="flecha-arriba" etiqueta="Subir" />} submitClass={ghost} />}
              {i < lista.length - 1 && <ActionForm inline action={moverPersonajeObra} hidden={{ ...h, id: c.id, dir: "1" }} submit={<Icono nombre="flecha-abajo" etiqueta="Bajar" />} submitClass={ghost} />}
              <ActionForm inline action={borrarPersonajeObra} hidden={{ ...h, id: c.id }} confirm={`¿Quitar a ${c.nombre}? Las audiciones que ya lo tienen lo conservan.`} submit="Quitar" submitClass={ghost} />
            </span>
          </li>
        ))}
        {lista.length === 0 && <li className="text-sm text-texto-3">Aún no hay personajes.</li>}
      </ol>
      <ActionForm action={agregarPersonajeObra} hidden={h} submit="Agregar personaje">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <input className={input} name="nombre" required placeholder="Personaje (ej. Donna)" aria-label="Personaje" />
          <input className={input} name="descripcion" placeholder="Descripción breve (edad, tesitura, baile…)" aria-label="Descripción" />
        </div>
      </ActionForm>
    </Card>
  );
}
