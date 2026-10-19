"use client";
/* eslint-disable @next/next/no-img-element -- foto privada con enlace temporal */

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import type { Criterio } from "@/lib/audition-rules";
import { juezActual, type JuezActual } from "../../actions";
import { ScoreForm } from "./ScoreForm";
import { PickForm } from "./PickForm";

const TIPO: Record<string, string> = { reparto: "Reparto", ensamble: "Ensamble", creativo: "Equipo creativo", produccion: "Producción", crew: "Crew", tecnico: "Técnico", staff: "Staff" };

// 0115: quien está en escena ahora. Se pregunta cada 4 s; si cambia la persona, cambia toda la tarjeta.
// Lo que el juez está escribiendo no se pierde: el formulario solo se vuelve a armar al cambiar de persona.
export function EnEscenaJuez({ aid, ronda, criterios, roles, conVotacion, abiertas, inicial }: {
  aid: string; ronda: number; criterios: Criterio[]; roles: { id: string; nombre: string }[];
  conVotacion: boolean; abiertas: boolean; inicial: JuezActual | null;
}) {
  const [d, setD] = useState<JuezActual | null>(inicial);
  const actual = useRef(inicial);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const n = await juezActual(aid, ronda).catch(() => undefined);
      if (n === undefined) return;
      const prev = actual.current;
      // Misma persona: se conserva la foto (el enlace temporal cambia en cada consulta).
      const sig = n && prev && n.app === prev.app ? { ...n, foto: prev.foto ?? n.foto } : n;
      if (JSON.stringify(sig) !== JSON.stringify(prev)) { actual.current = sig; setD(sig); }
    }, 4000);
    return () => clearInterval(t);
  }, [aid, ronda]);

  if (!d?.app) {
    return (
      <Card className="flex items-center gap-3 border border-dashed border-white/15">
        <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lila opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-lila" /></span>
        <p className="text-texto-2">Esperando al siguiente audicionante. Cuando el host lo pase, aparece aquí solo.</p>
      </Card>
    );
  }

  const inicialPicks = ["", "", ""];
  for (const k of d.picks) inicialPicks[k.opcion - 1] = k.ensamble ? "ensamble" : k.role_id ?? "";

  return (
    <Card className="flex flex-col gap-5 ring-2 ring-lila/60">
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-40 w-32 shrink-0 overflow-hidden rounded-xl bg-telon-2">
          {d.foto && <img src={d.foto} alt={`Foto de ${d.nombre}`} className="h-full w-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">En escena ahora</p>
          <p className="text-3xl font-black leading-tight">{d.numero ? `Nº ${d.numero} · ` : ""}{d.nombre}</p>
          {d.edad != null && <p className="text-texto-2">{d.edad} años</p>}
          {d.personajes?.length ? <p className="text-sm"><span className="text-texto-3">Quiere: </span><b>{d.personajes.join(", ")}</b></p> : null}
          {d.enlaces.map((v, i) => <a key={i} href={v.url} target="_blank" rel="noreferrer" className="text-sm text-violeta-claro underline">{v.titulo} <Icono nombre="externo" /></a>)}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Respuestas del formulario" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Su formulario</h3>
          {d.respuestas.length === 0 ? <p className="text-sm text-texto-3">No contestó preguntas extra.</p> : (
            <dl className="flex flex-col gap-2 text-sm">
              {d.respuestas.map((r, i) => <div key={i} className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">{r.pregunta}</dt><dd className="whitespace-pre-line">{r.respuesta}</dd></div>)}
            </dl>
          )}
        </section>
        <section aria-label="Entrevista" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Entrevista del host</h3>
          {d.entrevista.length === 0 && !d.extra ? <p className="text-sm text-texto-3">El host aún no guarda la entrevista. Aparece aquí en cuanto la guarde.</p> : (
            <dl className="flex flex-col gap-2 text-sm">
              {d.entrevista.map((r, i) => <div key={i} className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">{r.pregunta}</dt><dd className="whitespace-pre-line">{r.respuesta}</dd></div>)}
              {d.extra && <div className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">Adicional</dt><dd className="whitespace-pre-line">{d.extra}</dd></div>}
            </dl>
          )}
          <h3 className="mt-2 text-sm font-bold uppercase tracking-widest text-texto-3">Historial en DARF</h3>
          {d.historial.length === 0 ? <p className="text-sm text-texto-3">Primera vez con DARF (o aún sin cuenta ligada).</p> : (
            <ul className="flex flex-col gap-1 text-sm">
              {d.historial.map((h, i) => <li key={i}><b>{h.obra}</b>{h.temporada ? ` (${h.temporada})` : ""} · {h.papel || TIPO[h.tipo] || h.tipo}</li>)}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Tu evaluación" className="flex flex-col gap-3 border-t border-white/10 pt-4" key={d.app}>
        <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Tu evaluación</h3>
        {conVotacion && <PickForm aid={aid} app={d.app} ronda={ronda} roles={roles} inicial={inicialPicks} abierto={abiertas} />}
        <ScoreForm aid={aid} app={d.app} ronda={ronda} criterios={criterios} puntos={d.puntos ?? {}} notas={d.notas} />
      </section>
    </Card>
  );
}
