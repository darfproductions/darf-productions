"use client";

import { usePathname } from "next/navigation";

/** No muestra lo de adentro en una ruta (por ejemplo, la barra de etapas del layout donde ya hay una guía propia). */
export function OcultarEn({ ruta, children }: { ruta: string; children: React.ReactNode }) {
  const path = usePathname().replace(/\/+$/, "");
  return path === ruta ? null : <>{children}</>;
}
