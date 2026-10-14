"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState } from "react";
import { Icono } from "@/components/Icono";

// Pasos de la compra (guía de UI): 1 Función · 2 Lugares · 3 Tus datos · 4 Pago y boletos.
// El pago sigue siendo por transferencia y WhatsApp (sin cargo por servicio). Cada selector
// de la página avisa en qué paso va; la barra muestra el más avanzado.

const PASOS = ["Función", "Lugares", "Tus datos", "Pago y boletos"];

type Ctx = { set: (id: string, paso: number) => void; quitar: (id: string) => void };
const PasosCtx = createContext<Ctx | null>(null);
const ActualCtx = createContext(2);

export function PasosProvider({ children }: { children: React.ReactNode }) {
  const [pasos, setPasos] = useState<Record<string, number>>({});
  // Estable entre renders: si cambiara, los selectores se quitarían y volverían a poner sin fin.
  const ctx = useMemo<Ctx>(
    () => ({
      set: (id, paso) => setPasos((p) => (p[id] === paso ? p : { ...p, [id]: paso })),
      quitar: (id) =>
        setPasos((p) => {
          const resto = { ...p };
          delete resto[id];
          return resto;
        }),
    }),
    [],
  );
  const actual = Math.max(2, ...Object.values(pasos));
  return (
    <PasosCtx.Provider value={ctx}>
      <ActualCtx.Provider value={actual}>{children}</ActualCtx.Provider>
    </PasosCtx.Provider>
  );
}

/** Un selector avisa su paso (2, 3 o 4). */
export function usePaso(paso: number) {
  const ctx = useContext(PasosCtx);
  const id = useId();
  useEffect(() => {
    ctx?.set(id, paso);
  }, [ctx, id, paso]);
  useEffect(() => () => ctx?.quitar(id), [ctx, id]);
}

export function PasosBarra() {
  const actual = useContext(ActualCtx);
  return (
    <ol aria-label="Pasos de la compra" className="grid grid-cols-4 gap-2">
      {PASOS.map((nombre, i) => {
        const n = i + 1;
        const hecho = n < actual;
        const aqui = n === actual;
        return (
          <li key={nombre} aria-current={aqui ? "step" : undefined} className="flex flex-col gap-2">
            <span className={`h-1 rounded-full ${hecho || aqui ? "bg-[linear-gradient(90deg,var(--indigo),var(--ciruela),var(--carmin))]" : "bg-white/12"}`} />
            <span className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] ${aqui ? "text-texto" : hecho ? "text-texto-2" : "text-texto-3"}`}>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${aqui ? "bg-texto text-sala" : hecho ? "bg-white/15" : "border border-white/20"}`}>{hecho ? <Icono nombre="check" /> : n}</span>
              <span className={aqui ? "truncate" : "hidden truncate sm:inline"}>{nombre}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
