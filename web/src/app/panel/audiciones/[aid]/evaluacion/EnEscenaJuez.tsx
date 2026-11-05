"use client";
/* eslint-disable @next/next/no-img-element -- foto privada con enlace temporal */

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import type { Criterio } from "@/lib/audition-rules";
import { PersonajesPopup } from "@/components/audiciones/PersonajesPopup";
import type { PerfilAspirante } from "@/lib/produccion-nueva-rules";
import { juezActual, type JuezActual, type PersonaJuez } from "../../actions";
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
  const [sel, setSel] = useState<string | null>(null);
  const actual = useRef(inicial);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const prev = actual.current;
      const tengo = new Map([...(prev?.grupo ?? []), ...(prev ? [prev] : [])].filter((p) => p.app && p.foto).map((p) => [p.app as string, p.foto as string]));
      const n = await juezActual(aid, ronda, [...tengo.keys()]).catch(() => undefined);
      if (n === undefined) return;
      // Mismas personas: se conserva su foto (solo se firma al cambiar de persona).
      const conFoto = (p: PersonaJuez) => ({ ...p, foto: p.foto ?? tengo.get(p.app ?? "") ?? null });
      const sig = n ? { ...conFoto(n), grupo: n.grupo?.map(conFoto) ?? null } : n;
      if (JSON.stringify(sig) !== JSON.stringify(prev)) { actual.current = sig; setD(sig); }
    }, 4000);
    return () => clearInterval(t);
  }, [aid, ronda]);

  if (!d?.app) {
    return (
      <Card className="flex items-center gap-3 border border-dashed border-white/15">
        <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lila opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-lila" /></span>
        <p className="text-texto-2">Esperando al siguiente audicionante. Cuando den “Siguiente”, aparece aquí solo.</p>
      </Card>
    );
  }

  // 0133: si pasan en grupo, una pestaña por integrante; cada quien se califica por separado.
  const grupo = d.grupo && d.grupo.length > 1 ? d.grupo : null;
  const p: PersonaJuez = (grupo && grupo.find((x) => x.app === sel)) || (grupo ? grupo[0] : d);
  const appId = (p.app ?? d.app) as string;
  const inicialPicks = ["", "", ""];
  for (const k of p.picks) inicialPicks[k.opcion - 1] = k.ensamble ? "ensamble" : k.role_id ?? "";

  return (
    <Card className="flex flex-col gap-5 ring-2 ring-lila/60">
      {grupo && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">Pasan juntos · califica a cada quien</p>
          <div role="tablist" aria-label="Integrantes del grupo" className="flex flex-wrap gap-2">
            {grupo.map((g) => (
              <button key={g.app} type="button" role="tab" aria-selected={g.app === p.app} onClick={() => setSel(g.app)}
                className={`rounded-full border px-4 py-2 text-sm font-bold ${g.app === p.app ? "border-texto bg-texto text-sala" : "border-white/25"}`}>
                {g.numero ? `Nº ${g.numero} · ` : ""}{g.nombre.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-40 w-32 shrink-0 overflow-hidden rounded-xl bg-telon-2">
          {p.foto && <img src={p.foto} alt={`Foto de ${p.nombre}`} className="h-full w-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">En escena ahora</p>
          <p className="text-3xl font-black leading-tight">{p.numero ? `Nº ${p.numero} · ` : ""}{p.nombre}</p>
          {p.edad != null && <p className="text-texto-2">{p.edad} años</p>}
          {p.fichas?.length
            ? <PersonajesPopup fichas={p.fichas} perfil={perfilLleno(p.perfil)} edad={p.edad} />
            : p.personajes?.length ? <p className="text-sm"><span className="text-texto-3">Quiere: </span><b>{p.personajes.join(", ")}</b></p> : null}
          {p.enlaces.map((v, i) => <a key={i} href={v.url} target="_blank" rel="noreferrer" className="text-sm text-violeta-claro underline">{v.titulo} <Icono nombre="externo" /></a>)}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Respuestas del formulario" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Su formulario</h3>
          {p.respuestas.length === 0 ? <p className="text-sm text-texto-3">No contestó preguntas extra.</p> : (
            <dl className="flex flex-col gap-2 text-sm">
              {p.respuestas.map((r, i) => <div key={i} className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">{r.pregunta}</dt><dd className="whitespace-pre-line">{r.respuesta}</dd></div>)}
            </dl>
          )}
        </section>
        <section aria-label="Entrevista" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Entrevista del host</h3>
          {p.entrevista.length === 0 && !p.extra ? <p className="text-sm text-texto-3">El host aún no guarda la entrevista. Aparece aquí en cuanto la guarde.</p> : (
            <dl className="flex flex-col gap-2 text-sm">
              {p.entrevista.map((r, i) => <div key={i} className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">{r.pregunta}</dt><dd className="whitespace-pre-line">{r.respuesta}</dd></div>)}
              {p.extra && <div className="rounded-lg bg-sala px-3 py-2"><dt className="text-xs text-texto-3">Adicional</dt><dd className="whitespace-pre-line">{p.extra}</dd></div>}
            </dl>
          )}
          <h3 className="mt-2 text-sm font-bold uppercase tracking-widest text-texto-3">Historial en DARF</h3>
          {p.historial.length === 0 ? <p className="text-sm text-texto-3">Primera vez con DARF (o aún sin cuenta ligada).</p> : (
            <ul className="flex flex-col gap-1 text-sm">
              {p.historial.map((h, i) => <li key={i}><b>{h.obra}</b>{h.temporada ? ` (${h.temporada})` : ""} · {h.papel || TIPO[h.tipo] || h.tipo}</li>)}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Tu evaluación" className="flex flex-col gap-3 border-t border-white/10 pt-4" key={appId}>
        <h3 className="text-sm font-bold uppercase tracking-widest text-texto-3">Tu evaluación</h3>
        {conVotacion && <PickForm aid={aid} app={appId} ronda={ronda} roles={roles} inicial={inicialPicks} abierto={abiertas} />}
        <ScoreForm aid={aid} app={appId} ronda={ronda} criterios={criterios} puntos={p.puntos ?? {}} notas={p.notas} />
      </section>
    </Card>
  );
}

/** El perfil cuenta solo si la persona llenó algo. */
function perfilLleno(p: PerfilAspirante | null | undefined): PerfilAspirante | null {
  if (!p) return null;
  return p.tesitura || p.canto || p.baile || p.genero || (p.habilidades?.length ?? 0) > 0 ? p : null;
}
