"use client";

import { useEffect, useRef } from "react";
import { Icono } from "@/components/Icono";

// "Ajustes de esta sección" (0085): la configuración que casi no se toca va plegada debajo del
// trabajo diario. Se abre sola si la liga apunta a ella o a algo de adentro (#ancla).
export function AjustesSeccion({ id = "ajustes", titulo = "Ajustes de esta sección", resumen, children, abierto = false }: {
  id?: string; titulo?: string; resumen?: string; children: React.ReactNode; abierto?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const abrir = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h || !ref.current) return;
      if (h === id || ref.current.querySelector(`[id="${CSS.escape(h)}"]`)) {
        ref.current.open = true;
        document.getElementById(h)?.scrollIntoView({ block: "start" });
      }
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, [id]);
  return (
    <details ref={ref} id={id} open={abierto} className="group scroll-mt-24 rounded-[22px] border border-linea bg-telon/60">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-5 py-4 md:px-6">
        <span className="flex items-center gap-2 font-bold"><Icono nombre="engrane" />{titulo}</span>
        <span className="text-xs text-texto-3">{resumen}<span className="ml-2 inline-block transition-transform group-open:rotate-180"><Icono nombre="chevron-abajo" /></span></span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea p-4 md:p-5">{children}</div>
    </details>
  );
}
