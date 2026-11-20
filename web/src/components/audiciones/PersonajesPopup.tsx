"use client";

import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import { compararPerfil, resumenPersonaje, type FichaAudicion, type PerfilAspirante } from "@/lib/produccion-nueva-rules";

const tipo = (f: FichaAudicion) => f.categoria === "ensamble" ? "Grupo de ensamble" : f.categoria === "apoyo" ? "Personaje de apoyo" : f.categoria ? "Protagonista" : "Personaje";
const resumen = (f: FichaAudicion) => resumenPersonaje({ ...f, categoria: (f.categoria ?? "protagonista") as "protagonista", cupo: f.cupo ?? 1 });

/** Ventana modal controlada por "abierto". */
function Ventana({ abierto, cerrar, children }: { abierto: boolean; cerrar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} onClose={cerrar} onClick={(e) => { if (e.target === ref.current) cerrar(); }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-telon p-0 text-texto backdrop:bg-black/70">
      {abierto && <div className="flex max-h-[80dvh] flex-col gap-3 overflow-y-auto p-5">{children}</div>}
    </dialog>
  );
}

/** La ficha de un personaje y, si hay persona, lo que pide contra lo que dijo (✓ cumple, ✗ no, — no se sabe). */
function FichaDetalle({ f, perfil, edad, cerrar, volver }: { f: FichaAudicion; perfil: PerfilAspirante | null; edad: number | null; cerrar: () => void; volver?: () => void }) {
  const comp = compararPerfil(f, perfil, edad);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">{tipo(f)}</p>
          <h3 className="text-2xl font-black">{f.nombre}</h3>
          {resumen(f) && <p className="text-sm text-lila">{resumen(f)}</p>}
        </div>
        <span className="flex shrink-0 gap-2">
          {volver && <button type="button" onClick={volver} className="rounded-full border border-white/25 px-3 py-1 text-sm font-bold"><Icono nombre="flecha-izq" /> Todos</button>}
          <button type="button" onClick={cerrar} className="rounded-full border border-white/25 px-3 py-1 text-sm font-bold" aria-label="Cerrar">Cerrar</button>
        </span>
      </div>
      {f.descripcion && <p className="whitespace-pre-line text-sm text-texto-2">{f.descripcion}</p>}
      {f.rasgos && <p className="rounded-lg bg-sala px-3 py-2 text-sm"><span className="text-xs font-bold uppercase tracking-wide text-texto-3">Notas</span><br />{f.rasgos}</p>}
      {comp.length > 0 && (
        <table className="w-full text-sm">
          <caption className="mb-1 text-left text-xs font-bold uppercase tracking-wide text-texto-3">Lo que pide · lo que dijo</caption>
          <tbody>
            {comp.map((c) => (
              <tr key={c.que} className="border-t border-white/10">
                <th scope="row" className="py-1.5 pr-2 text-left font-semibold">{c.que}</th>
                <td className="py-1.5 pr-2 text-texto-2">{c.pide}</td>
                <td className="py-1.5 pr-2">{c.tiene}</td>
                <td className={`py-1.5 text-right font-bold ${c.ok === true ? "text-exito" : c.ok === false ? "text-aviso" : "text-texto-3"}`}
                  aria-label={c.ok === true ? "Coincide" : c.ok === false ? "No coincide" : "No se sabe"}>{c.ok === true ? <Icono nombre="check" /> : c.ok === false ? <Icono nombre="x" /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!perfil && comp.length > 0 && <p className="text-xs text-texto-3">Esta persona no llenó su perfil (tesitura, baile, habilidades).</p>}
    </>
  );
}

// Personajes por los que audiciona, como botones (0135). Al tocar uno se abre su ficha y, junto, lo que pide el
// personaje contra lo que dijo la persona.
export function PersonajesPopup({ fichas, perfil, edad }: { fichas: FichaAudicion[]; perfil: PerfilAspirante | null; edad: number | null }) {
  const [abierto, setAbierto] = useState<FichaAudicion | null>(null);
  if (!fichas.length) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-3">Audiciona para:</span>
        {fichas.map((f) => {
          const no = compararPerfil(f, perfil, edad).filter((x) => x.ok === false).length;
          return (
            <button key={f.id} type="button" onClick={() => setAbierto(f)}
              className="rounded-full border border-lila/60 bg-lila/10 px-3 py-1.5 font-bold hover:bg-lila/25"
              aria-haspopup="dialog" title="Ver la ficha del personaje">
              {f.nombre}{no > 0 && <span className="ml-1.5 text-xs text-aviso" aria-label={`${no} no coincide`}>({no} no {no === 1 ? "coincide" : "coinciden"})</span>}
            </button>
          );
        })}
      </div>
      <Ventana abierto={!!abierto} cerrar={() => setAbierto(null)}>
        {abierto && <FichaDetalle f={abierto} perfil={perfil} edad={edad} cerrar={() => setAbierto(null)} />}
      </Ventana>
    </>
  );
}

// "Ver todos los personajes" (Diego 2026-11-20): la lista completa de la convocatoria con su descripción, para pensar en
// alguien para un personaje por el que no se inscribió. Cada uno abre su ficha comparada con quien está en escena.
export function TodosPersonajes({ fichas, perfil, edad, nombre }: { fichas: FichaAudicion[]; perfil: PerfilAspirante | null; edad: number | null; nombre?: string }) {
  const [vista, setVista] = useState<"lista" | FichaAudicion | null>(null);
  if (!fichas.length) return null;
  const cerrar = () => setVista(null);
  return (
    <>
      <button type="button" onClick={() => setVista("lista")} aria-haspopup="dialog"
        className="self-start rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/60">
        Ver todos los personajes
      </button>
      <Ventana abierto={vista !== null} cerrar={cerrar}>
        {vista === "lista" && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">{fichas.length} personajes</p>
                <h3 className="text-2xl font-black">Todos los personajes</h3>
                {nombre && <p className="text-sm text-texto-3">Toca uno para compararlo con {nombre.split(" ")[0]}.</p>}
              </div>
              <button type="button" onClick={cerrar} className="rounded-full border border-white/25 px-3 py-1 text-sm font-bold">Cerrar</button>
            </div>
            <ul className="flex flex-col gap-2">
              {fichas.map((f) => {
                const no = nombre ? compararPerfil(f, perfil, edad).filter((x) => x.ok === false).length : 0;
                return (
                  <li key={f.id}>
                    <button type="button" onClick={() => setVista(f)} className="flex w-full flex-col gap-1 rounded-xl bg-sala px-4 py-3 text-left hover:bg-telon-2">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <b>{f.nombre}</b>
                        <span className="text-xs text-texto-3">{tipo(f)}{no > 0 && <span className="ml-1.5 text-aviso">· {no} no {no === 1 ? "coincide" : "coinciden"}</span>}</span>
                      </span>
                      {resumen(f) && <span className="text-xs text-lila">{resumen(f)}</span>}
                      {f.descripcion && <span className="line-clamp-3 text-sm text-texto-2">{f.descripcion}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {vista && vista !== "lista" && <FichaDetalle f={vista} perfil={nombre ? perfil : null} edad={nombre ? edad : null} cerrar={cerrar} volver={() => setVista("lista")} />}
      </Ventana>
    </>
  );
}
