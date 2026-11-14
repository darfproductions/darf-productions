"use client";

import { useRef, useState } from "react";
import { envolver } from "@/lib/texto-formato";

const boton = "min-w-9 rounded-md border border-white/20 px-2.5 py-1 text-sm hover:border-white/60";

// Caja de texto con botones de negritas, subrayado y cursivas: seleccionas una palabra y tocas el botón. Se guarda con
// marcas sencillas (**así**, __así__, *así*) y la página pública las muestra con formato.
export function TextareaFormato({ name, defaultValue, className, placeholder, maxLength }: { name: string; defaultValue?: string; className?: string; placeholder?: string; maxLength?: number }) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  function aplicar(marca: "**" | "__" | "*") {
    const t = ref.current;
    if (!t) return;
    const r = envolver(valor, t.selectionStart, t.selectionEnd, marca);
    setValor(r.texto);
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(r.desde, r.hasta); });
  }
  return (
    <span className="flex flex-col gap-1.5">
      <span role="toolbar" aria-label="Formato del texto" className="flex flex-wrap items-center gap-1.5 font-normal">
        <button type="button" onClick={() => aplicar("**")} className={`${boton} font-bold`} aria-label="Negritas" title="Negritas">B</button>
        <button type="button" onClick={() => aplicar("__")} className={`${boton} underline underline-offset-2`} aria-label="Subrayado" title="Subrayado">S</button>
        <button type="button" onClick={() => aplicar("*")} className={`${boton} italic`} aria-label="Cursivas" title="Cursivas">I</button>
        <span className="text-xs text-texto-3">Selecciona una palabra y toca un botón.</span>
      </span>
      <textarea ref={ref} name={name} value={valor} onChange={(e) => setValor(e.target.value)} className={className} placeholder={placeholder} maxLength={maxLength} />
    </span>
  );
}
