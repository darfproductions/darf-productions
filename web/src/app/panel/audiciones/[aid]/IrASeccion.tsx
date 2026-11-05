"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Las ligas viejas con #ancla (por ejemplo #preguntas-del-formulario) siguen funcionando: si el ancla vive en otra
// pestaña de la configuración, se cambia a esa pestaña conservando el ancla.
export function IrASeccion({ seccion, mapa }: { seccion: string; mapa: Record<string, string> }) {
  const router = useRouter();
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    const destino = h && mapa[h];
    if (destino && destino !== seccion) router.replace(`?seccion=${destino}#${h}`);
  }, [seccion, mapa, router]);
  return null;
}
