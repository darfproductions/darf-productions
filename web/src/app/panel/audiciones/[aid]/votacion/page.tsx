/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { votar } from "../../votacion-actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Votación" };

type Candidato = { id: string; nombre: string; numero: number | null; foto_path: string | null; op1: number; op2: number; op3: number; votos: number | null };
type Rol = { id: string; nombre: string; descripcion: string | null; mi_voto: string | null; candidatos: Candidato[] };
type Votacion = { fase: string; ronda: number; roles: Rol[]; votaron: string[] | null; jueces: number | null };

const boton = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Votación (0089): un apartado por personaje, en orden de importancia, con solo quienes algún juez
// marcó para él. Un voto por juez y por personaje (o abstención). Los conteos se ven al cerrar.
export default async function Votacion({ params }: PageProps<"/panel/audiciones/[aid]/votacion">) {
  const { aid } = await params;
  const { may } = await requireAudition(aid, ["audiciones.evaluar", "audiciones.gestionar"], "/votacion");
  const { data, error } = await (await createClient()).rpc("audition_voting", { aid });
  if (error) return <Card>{error.message}</Card>;
  const v = data as Votacion;
  const abierta = v.fase === "votacion";
  const puedeVotar = abierta && may("audiciones.evaluar");
  const fotos = await signPhotos(v.roles.flatMap((r) => r.candidatos.map((c) => c.foto_path)));
  const pendientes = v.roles.filter((r) => r.candidatos.length > 0 && !r.mi_voto).length;

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
      {v.roles.map((r, i) => (
        <Card key={r.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="titular text-xl"><span className="mr-2 font-mono text-sm text-texto-3">{i + 1}</span>{r.nombre}</h2>
            {r.mi_voto && <span className="text-xs font-bold text-exito">{r.mi_voto === "abstencion" ? "Te abstuviste" : <><Icono nombre="check" /> Ya votaste</>}</span>}
          </div>
          {r.descripcion && <p className="text-sm text-texto-3">{r.descripcion}</p>}
          {r.candidatos.length === 0 ? <p className="text-sm text-texto-3">Ningún juez marcó a alguien para este personaje.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {r.candidatos.map((c) => {
                const mio = r.mi_voto === c.id;
                return (
                  <li key={c.id} className={`flex gap-3 rounded-xl border p-3 ${mio ? "border-exito bg-exito/10" : "border-white/10 bg-sala/60"}`}>
                    <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-telon-2">
                      {c.foto_path && fotos.get(c.foto_path) && <img src={fotos.get(c.foto_path)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <b className="truncate">{c.numero ? `Nº ${c.numero} · ` : ""}{c.nombre}</b>
                      <span className="text-xs text-texto-3">Opción 1: {c.op1} · 2: {c.op2} · 3: {c.op3}</span>
                      {c.votos !== null && <span className="text-sm font-bold">{c.votos} {c.votos === 1 ? "voto" : "votos"}</span>}
                      {puedeVotar && !mio && <ActionForm inline action={votar} hidden={{ aid, rol: r.id, app: c.id }} submit={`Votar por ${c.nombre.split(" ")[0]}`} submitClass={boton} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {puedeVotar && r.candidatos.length > 0 && r.mi_voto !== "abstencion" && (
            <ActionForm inline action={votar} hidden={{ aid, rol: r.id, app: "" }} submit="Me abstengo" submitClass="self-start text-xs font-bold text-texto-3 underline underline-offset-4" />
          )}
        </Card>
      ))}
    </div>
  );
}
