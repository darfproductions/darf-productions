"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GafeteVista } from "@/components/gafete/GafeteVista";
import { descargarPase } from "@/components/gafete/gafete-canvas";
import { regenerarCredencial } from "@/lib/club-actions";
import { paseCredencialFan } from "@/lib/credencial-fan-rules";
import type { MiCredencialFan as Datos } from "@/lib/fanzone";

// "Mi credencial" del Club Fan (0080): como el gafete, dorada y con QR. Se muestra en la entrada
// de los eventos del club (foto con el elenco y otros) y se descarga en PDF.
export function MiCredencialFan({ c, compacto = false }: { c: Datos; compacto?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [regen, startRegen] = useTransition();
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [abierto]);

  const pase = paseCredencialFan(c);

  return (
    <>
      {compacto ? (
        <button type="button" onClick={() => setAbierto(true)} className="fb fb-sm border border-oro/60 text-oro-claro hover:bg-oro/10">Mi credencial con QR →</button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="flex w-full items-center gap-4 rounded-2xl border border-oro/40 bg-[linear-gradient(160deg,#1a1622,#0b0910)] p-5 text-left hover:border-oro/70">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#8a6b1f,#d7bb5f,#f3e3a3)] text-xl">★</span>
          <span className="flex flex-col gap-0.5">
            <span className="font-bold text-oro-claro">Mi credencial del Club Fan →</span>
            <span className="text-xs text-texto-2">Muéstrala en la entrada de los eventos del club.</span>
          </span>
        </button>
      )}
      {abierto && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Mi credencial del Club Fan" className="fixed inset-0 z-[60] flex flex-col items-center gap-5 overflow-y-auto bg-[#050407]/95 px-4 py-8 backdrop-blur">
          <button type="button" onClick={() => setAbierto(false)} className="self-end rounded-full border border-white/25 px-4 py-2 text-sm font-bold" autoFocus>Cerrar ✕</button>
          <GafeteVista p={pase} />
          <p className="max-w-[340px] text-center text-sm text-texto-2">Muéstrala en la entrada de la foto con el elenco y de los eventos del club. Sube el brillo de tu pantalla para que el QR se lea fácil.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" disabled={bajando} onClick={async () => { setBajando(true); try { await descargarPase(pase, `credencial-club-fan-${c.codigo}.pdf`); } finally { setBajando(false); } }} className="fb fb-claro fb-sm">{bajando ? "Preparando…" : "Descargar PDF"}</button>
            <a href={c.liga} target="_blank" rel="noreferrer" className="fb fb-o fb-sm">Ver verificación ↗</a>
          </div>
          <button
            type="button"
            disabled={regen}
            onClick={() => {
              if (!window.confirm("¿Hacer una credencial nueva? La anterior (y su PDF) dejará de servir.")) return;
              startRegen(async () => { const r = await regenerarCredencial(); setAviso(r.message); router.refresh(); });
            }}
            className="text-xs font-bold text-texto-3 underline"
          >
            {regen ? "…" : "Regenerar código"}
          </button>
          {aviso && <p role="status" className="text-xs text-texto-2">{aviso}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
