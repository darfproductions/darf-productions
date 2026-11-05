import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIAS, resumenPersonaje, type PersonajeFicha } from "@/lib/produccion-nueva-rules";
import { borrarPersonajeObra, moverPersonajeObra } from "@/app/panel/audiciones/votacion-actions";
import { guardarPersonaje } from "@/app/panel/producciones/obra-actions";
import { PersonajeCampos } from "./PersonajeCampos";

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
export const COLS_PERSONAJE = "id, nombre, descripcion, categoria, cupo, genero, edad_min, edad_max, tesituras, canto, baile, actuacion, habilidades, rasgos, canciones, orden";

export async function cargarPersonajes(pid: string) {
  const supabase = await createClient();
  const [{ data }, { data: songs }] = await Promise.all([
    supabase.from("production_characters").select(COLS_PERSONAJE).eq("production_id", pid).order("orden").order("created_at"),
    supabase.from("production_songs").select("id, titulo").eq("production_id", pid).order("orden"),
  ]);
  return { personajes: (data ?? []) as PersonajeFicha[], canciones: (songs ?? []) as { id: string; titulo: string }[] };
}

// Personajes de la obra (0089 + 0135) en tres secciones: protagonistas, apoyo y ensamble (por grupos). Dentro de cada
// sección, en orden de importancia. Las audiciones de la obra los toman para que la gente elija y los jueces vean su ficha.
export async function PersonajesEditor({ pid, editable = true }: { pid: string; editable?: boolean }) {
  const { personajes, canciones } = await cargarPersonajes(pid);
  const h = { pid };
  return (
    <div className="flex flex-col gap-4">
      {CATEGORIAS.map((cat) => {
        const lista = personajes.filter((p) => (p.categoria ?? "protagonista") === cat.valor);
        return (
          <Card key={cat.valor} className="flex flex-col gap-3">
            <div>
              <h3 className="titular text-lg">{cat.label} <span className="text-sm font-normal text-texto-3">({lista.length})</span></h3>
              <p className="text-sm text-texto-2">{cat.ayuda}</p>
            </div>
            <ol className="flex flex-col gap-2">
              {lista.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-sala px-3 py-2">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer">
                      <b>{c.nombre}</b>
                      {resumenPersonaje(c) && <span className="block text-xs text-lila">{resumenPersonaje(c)}</span>}
                      {c.descripcion && <span className="block text-sm text-texto-3">{c.descripcion}</span>}
                      {c.rasgos && <span className="block text-xs text-texto-3">Notas: {c.rasgos}</span>}
                    </summary>
                    {editable && (
                      <div className="mt-3">
                        <ActionForm action={guardarPersonaje} hidden={{ ...h, id: c.id }} submit="Guardar" submitClass={ghost}>
                          <PersonajeCampos categoria={cat.valor} p={c} canciones={canciones} />
                        </ActionForm>
                      </div>
                    )}
                  </details>
                  {editable && (
                    <span className="flex items-center gap-1.5">
                      {i > 0 && <ActionForm inline action={moverPersonajeObra} hidden={{ ...h, id: c.id, dir: "-1" }} submit={<Icono nombre="flecha-arriba" etiqueta="Subir" />} submitClass={ghost} />}
                      {i < lista.length - 1 && <ActionForm inline action={moverPersonajeObra} hidden={{ ...h, id: c.id, dir: "1" }} submit={<Icono nombre="flecha-abajo" etiqueta="Bajar" />} submitClass={ghost} />}
                      <ActionForm inline action={borrarPersonajeObra} hidden={{ ...h, id: c.id }} confirm={`¿Quitar a ${c.nombre}? Las audiciones que ya lo tienen lo conservan.`} submit="Quitar" submitClass={ghost} />
                    </span>
                  )}
                </li>
              ))}
              {lista.length === 0 && <li className="text-sm text-texto-3">{cat.valor === "ensamble" ? "Aún no hay grupos." : "Aún no hay personajes."}</li>}
            </ol>
            {editable && (
              <details className="rounded-lg border border-white/10 p-3">
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">+ {cat.valor === "ensamble" ? "Agregar grupo de ensamble" : "Agregar personaje"}</summary>
                <div className="mt-3">
                  <ActionForm action={guardarPersonaje} hidden={h} submit={cat.valor === "ensamble" ? "Agregar grupo" : "Agregar personaje"}>
                    <PersonajeCampos categoria={cat.valor} canciones={canciones} />
                  </ActionForm>
                </div>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}
