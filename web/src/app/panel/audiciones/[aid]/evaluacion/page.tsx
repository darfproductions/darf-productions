/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import type { Criterio } from "@/lib/audition-rules";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { ScoreForm } from "./ScoreForm";
import { PickForm } from "./PickForm";
import { getSession } from "@/lib/auth";
import { rondaDeFase } from "@/lib/votacion-rules";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Evaluación" };

type Row = { id: string; numero: number | null; nombre: string; edad: number; foto_path: string | null; roles: string[] | null; estado: string;
  puntos: Record<string, number>; notas: string | null; enlaces: { titulo: string; url: string }[] };

// Evaluación del juez, sin datos de contacto. Presencial: quienes ya llegaron, en orden de número.
// En línea o mixta: todos los inscritos, con sus videos. Criterios propios de la convocatoria.
export default async function Judging({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/evaluacion">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a } = await requireAudition(aid, ["audiciones.evaluar"], "/evaluacion");
  const supabase = await createClient();
  // 0089: con personajes, la ronda la marca la etapa (callback = 2) y se eligen opciones de personaje.
  const { data: rolesData } = await supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden");
  const roles = (rolesData ?? []) as { id: string; nombre: string }[];
  const conVotacion = roles.length > 0 && !a.permanente;
  const ronda = conVotacion ? rondaDeFase(a.fase) : Math.max(1, Number(sp.ronda ?? 1) || 1);
  const abiertas = (ronda === 1 && ["audicion", "seleccion_callback"].includes(a.fase)) || (ronda === 2 && a.fase === "callback");
  const { data, error } = await supabase.rpc("audition_judge_queue", { aid, p_ronda: ronda });
  const rows = (data ?? []) as Row[];
  const criterios = (a.criterios ?? []) as Criterio[];
  const fotos = await signPhotos(rows.map((r) => r.foto_path));
  const session = await getSession();
  const misPicks = new Map<string, string[]>();
  if (conVotacion && session) {
    const { data: pk } = await supabase.from("audition_picks").select("application_id, opcion, role_id, ensamble")
      .eq("judge_id", session.userId).eq("ronda", ronda).in("application_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);
    for (const k of (pk ?? []) as { application_id: string; opcion: number; role_id: string | null; ensamble: boolean }[]) {
      const arr = misPicks.get(k.application_id) ?? ["", "", ""];
      arr[k.opcion - 1] = k.ensamble ? "ensamble" : k.role_id ?? "";
      misPicks.set(k.application_id, arr);
    }
  }
  const hechas = conVotacion ? rows.filter((r) => (misPicks.get(r.id) ?? []).some(Boolean)).length : rows.filter((r) => Object.keys(r.puntos ?? {}).length > 0).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!conVotacion && [1, 2, 3].map((r) => (
          <Link key={r} href={`?ronda=${r}`} className={`rounded-full border px-3 py-1.5 font-semibold ${r === ronda ? "border-texto" : "border-white/20"}`}>{r === 1 ? "Audición" : `Callback ${r - 1}`}</Link>
        ))}
        {conVotacion && <span className="font-semibold">{ronda === 2 ? "Callback" : "Audición"}</span>}
        <span className="text-texto-3">· {conVotacion ? "marcaste opciones de" : "calificaste"} {hechas} de {rows.length}</span>
      </div>
      {error && <Card>{error.message}</Card>}
      {rows.length === 0 && <Card>{a.modalidad === "presencial" ? "Todavía no hay personas registradas en esta ronda." : "Todavía no hay inscritos en esta ronda."}</Card>}
      <ul className="grid gap-4 xl:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-4 sm:flex-row">
              <div className="flex shrink-0 gap-3 sm:w-32 sm:flex-col">
                <div className="h-32 w-24 overflow-hidden rounded-lg bg-telon-2 sm:w-32">
                  {r.foto_path && fotos.get(r.foto_path) && <img src={fotos.get(r.foto_path)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div>
                  {r.numero && <p className="text-3xl font-black">Nº {r.numero}</p>}
                  <p className="font-bold">{r.nombre}</p>
                  <p className="text-sm text-texto-3">{r.edad} años</p>
                  {r.roles && <p className="text-xs text-texto-2">{r.roles.join(", ")}</p>}
                  {(r.enlaces ?? []).map((v, i) => <a key={i} href={v.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-violeta-claro underline">{v.titulo} <Icono nombre="externo" /></a>)}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3">
                {conVotacion && <PickForm aid={aid} app={r.id} ronda={ronda} roles={roles} inicial={misPicks.get(r.id) ?? []} abierto={abiertas} />}
                {conVotacion ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold text-lila">Calificar y notas (opcional)</summary>
                    <div className="mt-2"><ScoreForm aid={aid} app={r.id} ronda={ronda} criterios={criterios} puntos={r.puntos ?? {}} notas={r.notas} /></div>
                  </details>
                ) : <ScoreForm aid={aid} app={r.id} ronda={ronda} criterios={criterios} puntos={r.puntos ?? {}} notas={r.notas} />}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
