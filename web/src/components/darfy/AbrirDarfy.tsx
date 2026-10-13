"use client";

import { useRouter } from "next/navigation";

// Liga del pie de página que abre la burbuja de DARFY (escucha el evento "darfy:abrir").
// En las páginas donde la burbuja no aparece, lleva a Contacto.
export function AbrirDarfy({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (document.documentElement.dataset.darfy) window.dispatchEvent(new Event("darfy:abrir"));
        else router.push("/contacto"); // donde DARFY no sale (la compra), Contacto
      }}
      className={`text-left ${className}`}
    >
      Pregúntale a DARFY
    </button>
  );
}
