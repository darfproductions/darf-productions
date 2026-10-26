"use client";

import { useState } from "react";
import { input } from "@/components/panel/ui";

// Nota para el público de un beneficio (2026-10-26): un detallito que sale en la página, la compra, el boleto, el
// WhatsApp, Difusión y la Puerta. Con frases rápidas para los casos comunes.
const RAPIDAS = ["Uno por compra, no por boleto", "Uno por boleto", "Sujeto a disponibilidad", "Solo presentando tu boleto"];

export function NotaBeneficio({ defaultValue }: { defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
      <label className="flex flex-col gap-1.5">Nota para el público (opcional)
        <input className={input} name="detalle" maxLength={400} value={v} onChange={(e) => setV(e.target.value)} placeholder="Uno por compra, no por boleto" />
      </label>
      <span className="flex flex-wrap items-center gap-1.5 font-normal">
        <span className="text-xs text-texto-3">Rápidas:</span>
        {RAPIDAS.map((t) => (
          <button key={t} type="button" onClick={() => setV(t)} className="rounded-full border border-white/20 px-2.5 py-1 text-xs hover:border-white/50">{t}</button>
        ))}
      </span>
      <span className="text-xs font-normal text-texto-3">Sale junto al beneficio en la página, al comprar, en el boleto, el WhatsApp, Difusión y la Puerta.</span>
    </div>
  );
}
