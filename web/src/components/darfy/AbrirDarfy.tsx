"use client";

// Liga del pie de página que abre la burbuja de DARFY (escucha el evento "darfy:abrir").
export function AbrirDarfy({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("darfy:abrir"))} className={`text-left ${className}`}>
      Pregúntale a DARFY
    </button>
  );
}
