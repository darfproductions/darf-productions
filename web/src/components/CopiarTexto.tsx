"use client";

import { useState } from "react";

// Copia un texto (por ejemplo, una CLABE) con un toque.
export function CopiarTexto({ texto, etiqueta = "Copiar", className }: { texto: string; etiqueta?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={className ?? "rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-bold hover:border-white/50"}
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); }
        catch { window.prompt("Copia:", texto); }
      }}>
      {ok ? "¡Copiado!" : etiqueta}
    </button>
  );
}
