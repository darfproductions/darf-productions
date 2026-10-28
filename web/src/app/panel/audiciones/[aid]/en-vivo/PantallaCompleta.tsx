"use client";

import { useEffect, useState } from "react";

// Botón para poner la pantalla del juez en pantalla completa (tablet o computadora). Si el navegador no lo permite
// (iPhone), no se muestra.
export function PantallaCompleta() {
  const [puede, setPuede] = useState(false);
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- solo existe en el navegador
    setPuede(typeof document !== "undefined" && !!document.documentElement.requestFullscreen);
    const cambio = () => setActiva(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);
  if (!puede) return null;
  return (
    <button type="button" onClick={() => (activa ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
      className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold hover:border-white/60">
      {activa ? "Salir de pantalla completa" : "Pantalla completa"}
    </button>
  );
}
