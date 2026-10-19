"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { input } from "@/components/panel/ui";
import { addFotoFuncion } from "./actions";

// 0114: elegir la función y subir sus fotos (varias a la vez).
export function FotosFuncionSubir({ pid, funciones }: { pid: string; funciones: { id: string; label: string }[] }) {
  const [sel, setSel] = useState(funciones[0]?.id ?? "");
  if (!funciones.length) return <p className="text-sm text-texto-3">Aún no hay funciones que ya hayan pasado.</p>;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-semibold">Función
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={`${input} py-2`}>
          {funciones.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <ImageUpload key={sel} productionId={pid} kind="galeria" carpeta="galeria" bucket="gallery" base="funcion" multiple
        save={addFotoFuncion.bind(null, pid, sel)} label="Subir fotos de esta función" />
    </div>
  );
}
