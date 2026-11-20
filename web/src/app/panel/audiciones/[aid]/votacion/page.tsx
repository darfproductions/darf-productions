import type { Metadata } from "next";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { MiCast, type Aspirante, type RolVoto } from "./MiCast";

export const metadata: Metadata = { title: "Votación" };

type Votacion = { fase: string; ronda: number; roles: RolVoto[]; aspirantes: Aspirante[] | null; votaron: string[] | null; jueces: number | null };

// Votación (0089, 0153): cada juez arma su cast, un voto por personaje (cualquiera que audicionó, o abstención),
// con las opciones de los jueces como referencia. Los conteos se ven al cerrar.
export default async function Votacion({ params }: PageProps<"/panel/audiciones/[aid]/votacion">) {
  const { aid } = await params;
  const { may } = await requireAudition(aid, ["audiciones.evaluar", "audiciones.gestionar"], "/votacion");
  const { data, error } = await (await createClient()).rpc("audition_voting", { aid });
  if (error) return <Card>{error.message}</Card>;
  const v = data as Votacion;
  const abierta = v.fase === "votacion";
  const puedeVotar = abierta && may("audiciones.evaluar");
  const fotos = await signPhotos(v.roles.flatMap((r) => r.candidatos.map((c) => c.foto_path)));
  const pendientes = v.roles.filter((r) => !r.mi_voto).length;

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
      {puedeVotar && (
        <p className="text-sm text-texto-2">Arma tu cast: en cada personaje elige a quien quieras de todos los que audicionaron. Las opciones que marcaron los jueces salen arriba como referencia. Al final dale «Subir mi cast». Tu voto es secreto hasta que se cierre la votación.</p>
      )}
      <MiCast aid={aid} roles={v.roles} aspirantes={v.aspirantes ?? []} fotos={Object.fromEntries(fotos)} puedeVotar={puedeVotar} />
    </div>
  );
}
