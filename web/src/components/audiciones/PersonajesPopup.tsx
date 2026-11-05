"use client";

import { useEffect, useRef, useState } from "react";
import { Icono } from "@/components/Icono";
import { compararPerfil, resumenPersonaje, type FichaAudicion, type PerfilAspirante } from "@/lib/produccion-nueva-rules";

// Personajes por los que audiciona, como botones (0135). Al tocar uno se abre su ficha y, junto, lo que pide el
// personaje contra lo que dijo la persona (✓ cumple, ✗ no, — no se sabe).
export function PersonajesPopup({ fichas, perfil, edad }: { fichas: FichaAudicion[]; perfil: PerfilAspirante | null; edad: number | null }) {
  const [abierto, setAbierto] = useState<FichaAudicion | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  if (!fichas.length) return null;
  const comp = abierto ? compararPerfil(abierto, perfil, edad) : [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-3">Audiciona para:</span>
        {fichas.map((f) => {
          const c = compararPerfil(f, perfil, edad);
          const no = c.filter((x) => x.ok === false).length;
          return (
            <button key={f.id} type="button" onClick={() => setAbierto(f)}
              className="rounded-full border border-lila/60 bg-lila/10 px-3 py-1.5 font-bold hover:bg-lila/25"
              aria-haspopup="dialog" title="Ver la ficha del personaje">
              {f.nombre}{no > 0 && <span className="ml-1.5 text-xs text-aviso" aria-label={`${no} no coincide`}>({no} no {no === 1 ? "coincide" : "coinciden"})</span>}
            </button>
          );
        })}
      </div>
      <dialog ref={ref} onClose={() => setAbierto(null)} onClick={(e) => { if (e.target === ref.current) setAbierto(null); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-telon p-0 text-texto backdrop:bg-black/70">
        {abierto && (
          <div className="flex max-h-[80dvh] flex-col gap-3 overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">{abierto.categoria === "ensamble" ? "Grupo de ensamble" : abierto.categoria === "apoyo" ? "Personaje de apoyo" : abierto.categoria ? "Protagonista" : "Personaje"}</p>
                <h3 className="text-2xl font-black">{abierto.nombre}</h3>
                {resumenPersonaje({ ...abierto, categoria: (abierto.categoria ?? "protagonista") as "protagonista", cupo: abierto.cupo ?? 1 }) && (
                  <p className="text-sm text-lila">{resumenPersonaje({ ...abierto, categoria: (abierto.categoria ?? "protagonista") as "protagonista", cupo: abierto.cupo ?? 1 })}</p>
                )}
              </div>
              <button type="button" onClick={() => setAbierto(null)} className="rounded-full border border-white/25 px-3 py-1 text-sm font-bold" aria-label="Cerrar">Cerrar</button>
            </div>
            {abierto.descripcion && <p className="whitespace-pre-line text-sm text-texto-2">{abierto.descripcion}</p>}
            {abierto.rasgos && <p className="rounded-lg bg-sala px-3 py-2 text-sm"><span className="text-xs font-bold uppercase tracking-wide text-texto-3">Notas</span><br />{abierto.rasgos}</p>}
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
          </div>
        )}
      </dialog>
    </>
  );
}
