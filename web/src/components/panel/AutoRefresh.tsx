"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Vuelve a cargar los datos cada cierto tiempo (varias personas usan la lista a la vez). Cada recarga vuelve a dibujar
// todo el panel, así que nunca más seguido que cada 20 s (2026-10-24: cada 10 s en varios celulares saturó la base).
// Con la pestaña oculta no recarga; al volver a ella, recarga una vez si ya tocaba.
const MINIMO = 20;

export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const cada = Math.max(MINIMO, seconds) * 1000;
    let ultima = Date.now();
    const recargar = () => { ultima = Date.now(); router.refresh(); };
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - ultima >= cada) recargar();
    }, cada);
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima >= cada) recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [router, seconds]);
  return null;
}
