"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GafeteVista } from "@/components/gafete/GafeteVista";
import { descargarPase } from "@/components/gafete/gafete-canvas";
import { guardarCompartir, regenerarGafete } from "@/lib/gafete-actions";
import type { MiGafeteVista } from "@/lib/gafete";
import { paseGafete } from "@/lib/gafete-rules";

// "Mi gafete" (0078): se abre a pantalla completa para mostrarlo (asistencia a ensayos o
// compartir contacto), se descarga en PDF y se elige qué ve quien lo escanea.
export function MiGafete({ g }: { g: MiGafeteVista }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [estado, guardar, guardando] = useActionState(guardarCompartir, null);
  const [regen, startRegen] = useTransition();
  const [aviso, setAviso] = useState("");
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [abierto]);

  const pase = paseGafete(g);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="flex w-full items-center gap-4 rounded-2xl border border-linea bg-telon p-5 text-left hover:bg-telon-2">
        <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#340feb,#830886,#d20122)] text-xl">🪪</span>
        <span className="flex flex-col gap-0.5">
          <span className="font-bold">Mi gafete →</span>
          <span className="text-xs text-texto-2">Muéstralo al llegar a ensayos o compártelo para que tengan tu contacto.</span>
        </span>
      </button>
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Mi gafete" className="fixed inset-0 z-[60] flex flex-col items-center gap-5 overflow-y-auto bg-[#050407]/95 px-4 py-8 backdrop-blur">
          <button type="button" onClick={() => setAbierto(false)} className="self-end rounded-full border border-white/25 px-4 py-2 text-sm font-bold" autoFocus>Cerrar ✕</button>
          <GafeteVista p={pase} />
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" disabled={bajando} onClick={async () => { setBajando(true); try { await descargarPase(pase, `gafete-darf-${g.codigo}.pdf`); } finally { setBajando(false); } }} className="fb fb-claro fb-sm">{bajando ? "Preparando…" : "Descargar PDF"}</button>
            <button type="button" onClick={() => setAjustes(!ajustes)} aria-expanded={ajustes} className="fb fb-o fb-sm">Qué compartir</button>
          </div>
          {ajustes && (
            <div className="flex w-[min(420px,92vw)] flex-col gap-4 rounded-[22px] border border-linea-2 bg-telon p-5 text-sm">
              <p className="text-texto-2">Cuando alguien escanee tu gafete con su celular verá tu nombre y tu papel, y además:</p>
              <form action={guardar} className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2"><input type="checkbox" name="telefono" defaultChecked={g.compartir_telefono} /> Mi teléfono</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="correo" defaultChecked={g.compartir_correo} /> Mi correo</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="instagram" defaultChecked={g.compartir_instagram} /> Mi Instagram (de mi perfil profesional)</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="perfil" defaultChecked={g.compartir_perfil} /> Liga a mi perfil profesional (si es público)</label>
                <p className="text-xs text-texto-3">Si eres menor de edad, tu teléfono y correo no se comparten aunque los marques.</p>
                <button disabled={guardando} className="fb fb-luz fb-sm self-start">{guardando ? "Guardando…" : "Guardar"}</button>
                {estado && <p role="status" className={`text-xs ${estado.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{estado.message}</p>}
              </form>
              <div className="flex flex-col gap-2 border-t border-linea pt-4">
                <a href={g.liga} target="_blank" rel="noreferrer" className="text-xs font-bold text-lila">Ver cómo lo ven los demás ↗</a>
                <button
                  type="button"
                  disabled={regen}
                  onClick={() => {
                    if (!window.confirm("¿Hacer un código nuevo? El gafete anterior (y su PDF) dejará de servir.")) return;
                    startRegen(async () => { const r = await regenerarGafete(); setAviso(r.message); router.refresh(); });
                  }}
                  className="self-start text-xs font-bold text-texto-3 underline"
                >
                  {regen ? "…" : "Regenerar código"}
                </button>
                {aviso && <p role="status" className="text-xs text-texto-2">{aviso}</p>}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
