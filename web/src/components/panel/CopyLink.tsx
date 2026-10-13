"use client";

import { useState } from "react";

// Copia la dirección completa de una página del sitio (sirve en DEV y en producción).
export function CopyLink({ path }: { path: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          window.prompt("Copia el enlace:", `${window.location.origin}${path}`);
        }
      }}
    >
      {ok ? "¡Copiado!" : "Copiar enlace"}
    </button>
  );
}
