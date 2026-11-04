"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/panel/ui";
import { agruparTurno, separarTurno } from "../../actions";

type Persona = { id: string; numero: number | null; nombre: string; llego: boolean; grupo: string | null };

// 0133: juntar en un turno a quienes pasan en grupo (hermanos, dúo…). Cada quien conserva su número y se califica por
// separado; con un solo "Siguiente" entra (y sale) todo el grupo.
export function GruposTurno({ aid, personas }: { aid: string; personas: Persona[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const cambiar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const juntar = () => start(async () => {
    const r = await agruparTurno(aid, [...marcados]);
    setMsg({ ok: r.ok, texto: r.message });
    if (r.ok) { setMarcados(new Set()); router.refresh(); }
  });
  if (personas.length < 2) return null;
  return (
    <Card>
      <details>
        <summary className="cursor-pointer font-bold">Pasan en grupo (mismo turno)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-texto-2">Palomea a quienes pasan juntos. Cada quien conserva su número y los jueces califican a cada uno por separado; con un solo <b>SIGUIENTE</b> entra todo el grupo.</p>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl bg-sala p-2">
            {personas.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                  <input type="checkbox" checked={marcados.has(p.id)} onChange={() => cambiar(p.id)} className="h-4 w-4" />
                  <span className="w-10 font-bold">{p.numero ?? "—"}</span>
                  <span className="flex-1">{p.nombre}{!p.llego && <span className="ml-2 text-xs text-texto-3">no ha llegado</span>}{p.grupo && <span className="ml-2 text-xs text-lila">ya en un grupo</span>}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending || marcados.size < 2} onClick={juntar}
            className="self-start rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala disabled:opacity-50">
            {pending ? "Un momento…" : `Pasan juntos (${marcados.size})`}
          </button>
          {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-exito" : "text-aviso"}`}>{msg.texto}</p>}
        </div>
      </details>
    </Card>
  );
}

/** Botón chico en la lista: sacar a alguien de su grupo. */
export function Separar({ aid, app, nombre }: { aid: string; app: string; nombre: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/60 disabled:opacity-60"
      onClick={() => start(async () => {
        if (!confirm(`¿Sacar a ${nombre} de su grupo? Pasará en su propio turno.`)) return;
        const r = await separarTurno(aid, app);
        if (!r.ok) { alert(r.message ?? "No se pudo."); return; }
        router.refresh();
      })}>{pending ? "…" : "Separar"}</button>
  );
}
