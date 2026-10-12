"use client";

import { useRef, useState } from "react";
import { mover, type BoletoVista, type EstiloBoleto } from "@/lib/ticket-design";
import { TicketCard } from "./TicketCard";
import { descargarPdf } from "./ticket-canvas";

const btn = "rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold hover:border-white/60 disabled:opacity-60";

// "Ver boletos": ventana con un boleto diseñado por asiento, con flechas; y descarga en PDF.
export function OrderTickets({ boletos, estilo, orden, pdfServidor }: { boletos: BoletoVista[]; estilo: EstiloBoleto; orden: string; pdfServidor: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const total = boletos.length;
  const toque = useRef<number | null>(null);

  const pdf = async () => {
    setGenerando(true);
    setAviso("");
    try {
      await descargarPdf(boletos, estilo, orden);
    } catch {
      if (pdfServidor) window.location.href = pdfServidor;
      else setAviso("No se pudo crear el PDF en este navegador.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setI(0); setAbierto(true); }} className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">
          Ver boletos ({total})
        </button>
        {pdfServidor && <button type="button" onClick={pdf} disabled={generando} className={btn}>{generando ? "Preparando PDF…" : "Descargar PDF"}</button>}
      </div>
      {aviso && <p role="alert" className="text-sm text-[#ff8fa3]">{aviso}</p>}

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Boletos de la orden ${orden}`}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbierto(false);
            if (e.key === "ArrowRight") setI((x) => mover(x, 1, total));
            if (e.key === "ArrowLeft") setI((x) => mover(x, -1, total));
          }}
          onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (toque.current === null) return;
            const dx = e.changedTouches[0].clientX - toque.current;
            toque.current = null;
            if (Math.abs(dx) > 50) setI((x) => mover(x, dx < 0 ? 1 : -1, total));
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-[#0b0910]/95 p-4 outline-none"
        >
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="absolute right-4 top-4 h-11 w-11 rounded-full border border-white/30 text-xl font-bold">×</button>
          <TicketCard b={boletos[i]} estilo={estilo} i={i} total={total} />
          {total > 1 && (
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setI((x) => mover(x, -1, total))} disabled={i === 0} aria-label="Boleto anterior" className="h-12 w-12 rounded-full border border-white/30 text-xl font-bold disabled:opacity-30">←</button>
              <span className="text-sm font-semibold">{i + 1} / {total}</span>
              <button type="button" onClick={() => setI((x) => mover(x, 1, total))} disabled={i === total - 1} aria-label="Boleto siguiente" className="h-12 w-12 rounded-full border border-white/30 text-xl font-bold disabled:opacity-30">→</button>
            </div>
          )}
          {pdfServidor && <button type="button" onClick={pdf} disabled={generando} className={btn}>{generando ? "Preparando PDF…" : "Descargar PDF"}</button>}
        </div>
      )}
    </>
  );
}
