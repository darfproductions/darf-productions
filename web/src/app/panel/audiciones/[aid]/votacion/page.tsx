import type { Metadata } from "next";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import type { Criterio } from "@/lib/audition-rules";
import { agruparPorPersona, type Evaluaciones } from "@/lib/evaluaciones-rules";
import { Icono } from "@/components/Icono";
import { MiCast, type Aspirante, type EvalsPorPersona, type RolVoto } from "./MiCast";

export const metadata: Metadata = { title: "Votación" };

type Votacion = { fase: string; ronda: number; roles: RolVoto[]; aspirantes: Aspirante[] | null; votaron: string[] | null; jueces: number | null };

// Votación (0089, 0153): cada juez arma su cast, un voto por personaje (cualquiera que audicionó, o abstención),
// con las opciones de los jueces como referencia. Los conteos se ven al cerrar.
export default async function Votacion({ params }: PageProps<"/panel/audiciones/[aid]/votacion">) {
  const { aid } = await params;
  const { a, may } = await requireAudition(aid, ["audiciones.evaluar", "audiciones.gestionar"], "/votacion");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_voting", { aid });
  if (error) return <Card>{error.message}</Card>;
  const v = data as Votacion;
  const abierta = v.fase === "votacion";
  const puedeVotar = abierta && may("audiciones.evaluar");
  const fotos = await signPhotos(v.roles.flatMap((r) => r.candidatos.map((c) => c.foto_path)));
  const pendientes = v.roles.filter((r) => !r.mi_voto).length;
  // 0166: desde la votación, todos los jueces ven lo que pusieron los demás (la dirección, siempre).
  const gestiona = may("audiciones.gestionar");
  const verEvals = gestiona || ["votacion", "ajuste", "enviado"].includes(v.fase);
  const cerrada = ["ajuste", "enviado"].includes(v.fase);
  let evals: EvalsPorPersona | null = null;
  if (verEvals) {
    const { data: ev } = await supabase.rpc("audition_evaluaciones", { aid });
    if (ev) evals = Object.fromEntries(agruparPorPersona((ev as Evaluaciones).evaluaciones));
  }
  const liga = "inline-flex items-center gap-1 rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {abierta ? "Votación abierta." : ["ajuste", "enviado"].includes(v.fase) ? "Votación cerrada: ya se ven los votos." : "La votación todavía no empieza."}
          {puedeVotar && ` ${pendientes ? `Te faltan ${pendientes} ${pendientes === 1 ? "personaje" : "personajes"}.` : "Ya votaste en todos."}`}
          {" "}Ronda: {v.ronda === 2 ? "callback" : "audición"}.
        </span>
        {v.votaron && <span className="text-texto-3">Votaron {v.votaron.length}{v.jueces ? ` de ${v.jueces}` : ""} jueces{v.votaron.length ? `: ${v.votaron.join(", ")}` : ""}</span>}
      </Card>
      {(evals || (gestiona && cerrada)) && (
        <div className="flex flex-wrap items-center gap-2">
          {evals && <a href={`/panel/audiciones/${aid}/exportar/evaluaciones`} className={liga}>Descargar evaluaciones (Excel) <Icono nombre="flecha-abajo" /></a>}
          {gestiona && cerrada && <a href={`/panel/audiciones/${aid}/votacion/pdf`} className={liga}>Votación en PDF</a>}
          {gestiona && cerrada && <a href={`/panel/audiciones/${aid}/expediente`} className={liga}>Expediente completo</a>}
        </div>
      )}
      {puedeVotar && (
        <p className="text-sm text-texto-2">Arma tu cast: en cada personaje elige a quien quieras de todos los que audicionaron. Las opciones que marcaron los jueces salen arriba como referencia. Con «Ver evaluaciones» ves lo que puso cada juez de esa persona. Al final dale «Subir mi cast». Tu voto es secreto hasta que se cierre la votación.</p>
      )}
      <MiCast aid={aid} roles={v.roles} aspirantes={v.aspirantes ?? []} fotos={Object.fromEntries(fotos)} puedeVotar={puedeVotar}
        evals={evals} criterios={(a.criterios ?? []) as Criterio[]} />
    </div>
  );
}
