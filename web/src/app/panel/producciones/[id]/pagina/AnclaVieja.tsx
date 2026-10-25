"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Las ligas viejas a una sección del editor (pagina#kit, #canciones…) llevan a su página nueva.
const DESTINO: Record<string, string> = {
  datos: "contenido", canciones: "contenido", extra: "contenido", videos: "contenido", gracias: "contenido",
  kit: "imagen", poster: "imagen#poster", "poster-alterno": "imagen#poster-alterno",
  franja: "avisos", anuncios: "avisos#anuncios",
};

export function AnclaVieja({ base }: { base: string }) {
  const router = useRouter();
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    const ir = DESTINO[h];
    if (ir) router.replace(`${base}/${ir.includes("#") ? ir : `${ir}#${h}`}`);
  }, [base, router]);
  return null;
}
