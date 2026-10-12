"use client";

import { useEffect, useState } from "react";
import { partesRestantes } from "@/lib/cuenta-regresiva";

// Cuenta regresiva (días, horas, minutos). En el servidor y antes de montarse muestra
// guiones para que no haya saltos al hidratar; luego se actualiza cada 30 s.
export function CuentaRegresiva({ hasta, className = "" }: { hasta: string; className?: string }) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setAhora(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const r = ahora === null ? null : partesRestantes(new Date(hasta).getTime() - ahora);
  const celdas: [string, string][] = [
    [r ? String(r.dias) : "–", r?.dias === 1 ? "día" : "días"],
    [r ? String(r.horas).padStart(2, "0") : "–", "horas"],
    [r ? String(r.minutos).padStart(2, "0") : "–", "min"],
  ];
  return (
    <div role="timer" aria-label={r ? `Faltan ${r.dias} días, ${r.horas} horas y ${r.minutos} minutos` : "Cuenta regresiva"} className={`grid grid-cols-3 gap-2 text-center ${className}`}>
      {celdas.map(([n, l]) => (
        <div key={l}>
          <b className="num block text-[40px] font-black leading-none tracking-[-0.04em]">{n}</b>
          <span className="text-[12px] text-texto-3">{l}</span>
        </div>
      ))}
    </div>
  );
}
