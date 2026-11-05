"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Icono } from "@/components/Icono";

// Vista previa de la página pública al lado del editor (0138), solo en pantallas grandes: la obra como se ve en un
// celular, con el borrador encima. "Actualizar" la recarga después de guardar.
export function VistaPrevia({ pid }: { pid: string }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [n, setN] = useState(0);
  const src = `/vista-previa/${pid}?version=borrador&v=${n}`;
  return (
    <aside aria-label="Vista previa" className="hidden xl:flex xl:sticky xl:top-20 xl:flex-col xl:gap-2 xl:self-start">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Vista previa</p>
        <span className="flex gap-3 text-xs font-bold">
          <button type="button" onClick={() => setN((x) => x + 1)} className="text-violeta-claro hover:underline"><Icono nombre="deshacer" /> Actualizar</button>
          <Link href={`/vista-previa/${pid}`} target="_blank" className="text-violeta-claro hover:underline">Abrir <Icono nombre="externo" /></Link>
        </span>
      </div>
      <div className="overflow-hidden rounded-[28px] border-[6px] border-telon-2 bg-sala shadow-2xl">
        <iframe ref={marco} key={n} src={src} title="Vista previa de la página pública" className="h-[640px] w-full bg-sala" />
      </div>
      <p className="px-1 text-[11px] text-texto-3">Así se ve en un celular, con tus cambios sin publicar.</p>
    </aside>
  );
}
