"use client";

import { useState } from "react";
import { buttonGhost, input } from "@/components/panel/ui";
import { saveSongs } from "./actions";
import { EditForm } from "./EditForm";

// Canciones: actos opcionales; una canción por renglón. La numeración es continua.
export function SongsEditor({ pid, initial }: { pid: string; initial: { nombre: string; canciones: string[] }[] }) {
  const [actos, setActos] = useState(initial.map((a, i) => ({ key: i, nombre: a.nombre, texto: a.canciones.join("\n") })));
  const [next, setNext] = useState(initial.length);
  // Dónde empieza la numeración de cada acto (continua entre actos).
  const cuenta = actos.map((a) => a.texto.split("\n").filter((s) => s.trim()).length);
  const inicio = cuenta.map((_, i) => cuenta.slice(0, i).reduce((x, y) => x + y, 0) + 1);
  return (
    <EditForm action={saveSongs} pid={pid} submit="Guardar canciones">
      <p className="text-sm text-texto-2">Escribe una canción por renglón. Si la obra no se divide en actos, deja un solo grupo sin nombre.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {actos.map((a, i) => {
          const n = cuenta[i];
          const desde = inicio[i];
          return (
            <div key={a.key} className="flex flex-col gap-2 rounded-lg bg-sala p-3">
              <div className="flex items-center gap-2">
                <input className={`${input} flex-1`} name="acto_nombre" placeholder={actos.length > 1 ? "Acto I" : "Sin actos (opcional: Acto I)"} value={a.nombre} onChange={(e) => setActos(actos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                {actos.length > 1 && (
                  <button type="button" className={buttonGhost} onClick={() => setActos(actos.filter((_, j) => j !== i))}>Quitar</button>
                )}
              </div>
              <textarea className={`${input} min-h-48 font-normal leading-7`} name="acto_canciones" value={a.texto} onChange={(e) => setActos(actos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
              <p className="text-xs text-texto-3">{n ? `Canciones ${desde}–${desde + n - 1}` : "Sin canciones"}</p>
            </div>
          );
        })}
      </div>
      <button type="button" className={`${buttonGhost} self-start`} onClick={() => { setActos([...actos, { key: next, nombre: `Acto ${["I", "II", "III", "IV"][actos.length] ?? actos.length + 1}`, texto: "" }]); setNext(next + 1); }}>
        + Agregar acto
      </button>
    </EditForm>
  );
}
