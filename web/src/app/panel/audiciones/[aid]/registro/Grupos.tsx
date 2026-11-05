"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/panel/ui";
import { sugerirGrupos } from "@/lib/audicion-vivo-rules";
import { agruparTurno, separarTurno } from "../../actions";

type Persona = { id: string; numero: number | null; nombre: string; llego: boolean; grupo: string | null; con?: string | null };

// 0133 + 0136: juntar en un turno a quienes pasan en grupo (hermanos, dúo…). Cada quien conserva su número y se califica
// por separado; con un solo "Siguiente" entra (y sale) todo el grupo. Si la convocatoria pregunta "¿con quién pasas?",
// se ve la respuesta junto a cada nombre y el sistema sugiere los grupos: se confirman con un clic.
export function GruposTurno({ aid, personas, abierto = false, titulo = "Pasan en grupo (mismo turno)" }: { aid: string; personas: Persona[]; abierto?: boolean; titulo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const conPregunta = personas.some((p) => p.con !== undefined);
  const sugeridos = useMemo(() => sugerirGrupos(personas.filter((p) => !p.grupo).map((p) => ({ id: p.id, nombre: p.nombre, con: p.con ?? null })))
    .filter((g) => !descartados.has(g.ids.join("|"))), [personas, descartados]);
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const cambiar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const juntar = (ids: string[]) => start(async () => {
    const r = await agruparTurno(aid, ids);
    setMsg({ ok: r.ok, texto: r.message });
    if (r.ok) { setMarcados(new Set()); router.refresh(); }
  });
  if (personas.length < 2) return null;
  return (
    <Card>
      <details open={abierto}>
        <summary className="cursor-pointer font-bold">{titulo}{sugeridos.length > 0 && <span className="ml-2 rounded-full bg-lila/20 px-2 py-0.5 text-xs font-bold text-lila">{sugeridos.length} {sugeridos.length === 1 ? "sugerido" : "sugeridos"}</span>}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-texto-2">Cada quien conserva su número y los jueces califican a cada uno por separado; con un solo <b>SIGUIENTE</b> entra todo el grupo.</p>
          {sugeridos.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-lila/40 p-3">
              <p className="text-sm font-bold">Grupos sugeridos <span className="font-normal text-texto-3">por lo que respondieron a «¿con quién pasas?»</span></p>
              <ul className="flex flex-col gap-2">
                {sugeridos.map((g) => (
                  <li key={g.ids.join("|")} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                    <span>
                      <b>{g.ids.map((id) => nombre.get(id)).join(" + ")}</b>
                      <span className="block text-xs text-texto-3">{g.porque.join(" · ")}</span>
                    </span>
                    <span className="flex gap-1.5">
                      <button type="button" disabled={pending} onClick={() => juntar(g.ids)} className="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala disabled:opacity-50">Juntar</button>
                      <button type="button" onClick={() => setDescartados((s) => new Set(s).add(g.ids.join("|")))} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">No</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-texto-2">O palomea a quienes pasan juntos:</p>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl bg-sala p-2">
            {personas.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                  <input type="checkbox" checked={marcados.has(p.id)} onChange={() => cambiar(p.id)} className="h-4 w-4" />
                  <span className="w-10 shrink-0 font-bold">{p.numero ?? "—"}</span>
                  <span className="min-w-0 flex-1">
                    {p.nombre}{!p.llego && <span className="ml-2 text-xs text-texto-3">no ha llegado</span>}{p.grupo && <span className="ml-2 text-xs text-lila">ya en un grupo</span>}
                    {conPregunta && <span className="block truncate text-xs text-texto-3">{p.con ? `Pasa con: ${p.con}` : "No dijo con quién"}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending || marcados.size < 2} onClick={() => juntar([...marcados])}
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
