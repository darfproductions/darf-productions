"use client";
/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */

import { useActionState, useMemo, useState } from "react";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { subirCast, type VotState } from "../../votacion-actions";

export type Candidato = { id: string; nombre: string; numero: number | null; foto_path: string | null; op1: number; op2: number; op3: number; mi_opcion: number | null; votos: number | null };
export type RolVoto = { id: string; nombre: string; descripcion: string | null; mi_voto: string | null; candidatos: Candidato[] };
export type Aspirante = { id: string; nombre: string; numero: number | null };

const conNum = (a: { nombre: string; numero: number | null }) => `${a.numero ? `Nº ${a.numero} · ` : ""}${a.nombre}`;

// Votación (0153): cada juez arma su cast. Por personaje, la referencia (a quién marcaron los jueces como opción 1, 2
// o 3, y qué opción le pusiste tú) y un desplegable con todos los que audicionaron. "Subir mi cast" guarda todo junto.
export function MiCast({ aid, roles, aspirantes, fotos, puedeVotar }: {
  aid: string; roles: RolVoto[]; aspirantes: Aspirante[]; fotos: Record<string, string>; puedeVotar: boolean;
}) {
  const [state, run, pending] = useActionState<VotState, FormData>(subirCast, null);
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(roles.map((r) => [r.id, r.mi_voto ?? ""])));
  const nombre = useMemo(() => new Map(aspirantes.map((a) => [a.id, a.nombre])), [aspirantes]);
  // Alguien en dos personajes: se avisa (al cerrar se queda en el primero que gane, en el orden de la lista).
  const repetidos = useMemo(() => {
    const por = new Map<string, string[]>();
    for (const r of roles) { const v = sel[r.id]; if (v && v !== "abstencion") por.set(v, [...(por.get(v) ?? []), r.nombre]); }
    return [...por.entries()].filter(([, rs]) => rs.length > 1);
  }, [roles, sel]);
  const elegidos = roles.filter((r) => sel[r.id]).length;
  const cambios = roles.some((r) => (sel[r.id] ?? "") !== (r.mi_voto ?? ""));

  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="aid" value={aid} />
      {roles.map((r, i) => {
        const ref = [...r.candidatos].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0) || b.op1 - a.op1 || b.op2 - a.op2 || b.op3 - a.op3 || (a.numero ?? 999) - (b.numero ?? 999));
        const max = Math.max(1, ...ref.map((c) => c.op1 + c.op2 + c.op3));
        const marcados = new Set(ref.filter((c) => c.op1 + c.op2 + c.op3 > 0).map((c) => c.id));
        const v = sel[r.id] ?? "";
        return (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="titular text-xl"><span className="mr-2 font-mono text-sm text-texto-3">{i + 1}</span>{r.nombre}</h2>
              {r.mi_voto && <span className="text-xs font-bold text-exito">{r.mi_voto === "abstencion" ? "Te abstuviste" : <><Icono nombre="check" /> Subiste a {nombre.get(r.mi_voto)?.split(" ")[0] ?? "alguien"}</>}</span>}
            </div>
            {r.descripcion && <p className="text-sm text-texto-3">{r.descripcion}</p>}

            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-texto-3">Referencia · opciones que marcaron los jueces</p>
              {ref.length === 0 ? <p className="text-sm text-texto-3">Ningún juez marcó a alguien para este personaje. Igual puedes elegir a quien quieras abajo.</p> : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {ref.map((c) => {
                    const total = c.op1 + c.op2 + c.op3;
                    const elegido = v === c.id;
                    return (
                      <li key={c.id} className={`flex gap-3 rounded-xl border p-3 ${elegido ? "border-exito bg-exito/10" : "border-white/10 bg-sala/60"}`}>
                        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-telon-2">
                          {c.foto_path && fotos[c.foto_path] && <img src={fotos[c.foto_path]} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <b className="truncate text-sm">{conNum(c)}</b>
                          {c.mi_opcion && <span className="self-start rounded-full bg-lila/15 px-2 py-0.5 text-[11px] font-bold text-lila">Tú: opción {c.mi_opcion}</span>}
                          {total > 0 && (
                            <>
                              <span className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true"><span className="block h-full rounded-full bg-lila" style={{ width: `${(total / max) * 100}%` }} /></span>
                              <span className="text-[11px] text-texto-3">Opción 1: {c.op1} · 2: {c.op2} · 3: {c.op3}</span>
                            </>
                          )}
                          {c.votos !== null && <span className="text-sm font-bold">{c.votos} {c.votos === 1 ? "voto" : "votos"}</span>}
                          {puedeVotar && !elegido && (
                            <button type="button" onClick={() => setSel((s) => ({ ...s, [r.id]: c.id }))} className="self-start text-xs font-bold text-lila underline underline-offset-4">Elegir</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {puedeVotar && (
              <label className="flex flex-col gap-1 text-sm font-semibold">Tu elección para {r.nombre}
                <select name={`v_${r.id}`} value={v} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-sm">
                  <option value="">Sin elegir</option>
                  {marcados.size > 0 && (
                    <optgroup label="Marcados para este personaje">
                      {ref.filter((c) => marcados.has(c.id)).map((c) => <option key={c.id} value={c.id}>{conNum(c)}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Todos los que audicionaron">
                    {aspirantes.filter((a) => !marcados.has(a.id)).map((a) => <option key={a.id} value={a.id}>{conNum(a)}</option>)}
                  </optgroup>
                  <option value="abstencion">Me abstengo</option>
                </select>
              </label>
            )}
          </Card>
        );
      })}

      {puedeVotar && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-10 flex flex-col gap-2 rounded-2xl border border-white/15 bg-telon-2 p-4 shadow-xl">
          {repetidos.map(([id, rs]) => (
            <p key={id} className="text-sm font-semibold text-aviso">Pusiste a {nombre.get(id)} en {rs.join(" y ")}. Al cerrar la votación solo puede quedar en uno.</p>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending || elegidos === 0} className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60">
              {pending ? "Subiendo…" : "Subir mi cast"}
            </button>
            <span className="text-sm text-texto-2">Elegiste {elegidos} de {roles.length} personajes{cambios ? " · sin subir" : ""}.</span>
            {state && <span role="status" className={`text-sm font-semibold ${state.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{state.message}</span>}
          </div>
        </div>
      )}
    </form>
  );
}
