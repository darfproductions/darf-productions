"use client";

import { useState } from "react";

// Compartir una página (la obra, un anuncio). En celular abre el menú de compartir del
// teléfono; si no existe (computadora), ofrece copiar la liga o mandarla por WhatsApp.
export function Compartir({ titulo, texto, ruta, className = "fb fb-obra" }: { titulo: string; texto?: string; ruta: string; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const url = () => new URL(ruta, window.location.origin).toString();

  const compartir = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: titulo, text: texto, url: url() });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // la persona lo canceló
      }
    }
    setAbierto((a) => !a);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copia la liga:", url());
    }
  };

  return (
    <div className="relative inline-flex">
      <button type="button" onClick={compartir} aria-expanded={abierto} className={className}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v13" /><path d="m7 8 5-5 5 5" />
        </svg>
        Compartir
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-2 flex w-56 flex-col gap-1 rounded-[18px] border border-linea-2 bg-telon p-2 text-texto shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)]">
          <button type="button" onClick={copiar} className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-telon-2" aria-live="polite">
            {copiado ? "¡Liga copiada!" : "Copiar liga"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${texto ?? titulo} ${typeof window === "undefined" ? "" : url()}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-telon-2"
          >
            Enviar por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
