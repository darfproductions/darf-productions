"use client";

import { useState, useTransition } from "react";
import { guardarOpciones } from "../../votacion-actions";

// Opciones de personaje de un juez para una persona (0089): Opción 1 (la que más le gusta),
// 2 (también lo ve) y 3 (alternativa). Personaje o Ensamble. Se guarda al cambiar.
export function PickForm({ aid, app, ronda, roles, inicial, abierto }: {
  aid: string; app: string; ronda: number; roles: { id: string; nombre: string }[]; inicial: string[]; abierto: boolean;
}) {
  const [ops, setOps] = useState<string[]>([inicial[0] ?? "", inicial[1] ?? "", inicial[2] ?? ""]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const cambiar = (i: number, v: string) => {
    const nuevas = ops.map((o, k) => (k === i ? v : o === v && v ? "" : o)); // sin repetir
    setOps(nuevas);
    start(async () => {
      const r = await guardarOpciones(aid, app, ronda, nuevas);
      setMsg(r.ok ? { ok: true, t: "Guardado" } : { ok: false, t: r.message ?? "No se guardó." });
    });
  };
  const etiquetas = ["Opción 1 · la que más te gusta", "Opción 2 · también lo ves", "Opción 3 · alternativa"];
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl bg-sala/60 p-3" disabled={!abierto}>
      <legend className="sr-only">Opciones de personaje</legend>
      {etiquetas.map((l, i) => (
        <label key={i} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
          {l}
          <select value={ops[i]} onChange={(e) => cambiar(i, e.target.value)} className="rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-sm text-texto">
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            <option value="ensamble">Ensamble</option>
          </select>
        </label>
      ))}
      <p className={`min-h-4 text-xs ${msg && !msg.ok ? "text-[#ff8fa3]" : "text-texto-3"}`} role="status">
        {pending ? "Guardando…" : msg?.t ?? (abierto ? "" : "Las opciones de esta ronda ya están cerradas.")}
      </p>
    </fieldset>
  );
}
