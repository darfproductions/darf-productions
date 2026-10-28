import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import type { Criterio } from "@/lib/audition-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { rondaDeFase } from "@/lib/votacion-rules";
import { juezActual } from "../../actions";
import { EnEscenaJuez } from "../evaluacion/EnEscenaJuez";
import { PantallaCompleta } from "./PantallaCompleta";

export const metadata: Metadata = { title: "Modo audición" };

// 0131: pantalla del juez durante el día. Solo quien está en escena: cambia sola cuando recepción o el host dan
// "Siguiente". Cuando el host abre la votación, aquí mismo aparece el aviso para ir a votar.
export default async function ModoAudicion({ params }: PageProps<"/panel/audiciones/[aid]/en-vivo">) {
  const { aid } = await params;
  const { a } = await requireAudition(aid, ["audiciones.evaluar"], "/en-vivo");
  const supabase = await createClient();
  const { data: rolesData } = await supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden");
  const roles = (rolesData ?? []) as { id: string; nombre: string }[];
  const conVotacion = roles.length > 0 && !a.permanente;
  const ronda = conVotacion ? rondaDeFase(a.fase) : 1;
  const abiertas = (ronda === 1 && ["audicion", "seleccion_callback"].includes(a.fase)) || (ronda === 2 && a.fase === "callback");
  const aVotar = conVotacion && a.fase === "votacion";
  const enEscena = aVotar ? null : await juezActual(aid, ronda);

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-texto-3">
          Modo audición · {a.fase === "callback" ? "Callback" : "Audición"}
        </p>
        <PantallaCompleta />
      </div>
      {aVotar ? (
        <Card className="flex flex-col items-start gap-3 border border-lila/50">
          <p className="titular text-2xl">Terminaron las audiciones: ¡a votar!</p>
          <p className="text-texto-2">Vota por cada personaje. Tus votos son secretos hasta que se cierre la votación.</p>
          <Link href={`/panel/audiciones/${aid}/votacion`} className="rounded-full bg-texto px-5 py-3 font-bold text-sala">Ir a votar <Icono nombre="flecha-der" /></Link>
        </Card>
      ) : ["ajuste", "enviado"].includes(a.fase) && conVotacion ? (
        <Card>La votación ya cerró. ¡Gracias!</Card>
      ) : (
        <EnEscenaJuez aid={aid} ronda={ronda} criterios={(a.criterios ?? []) as Criterio[]} roles={roles} conVotacion={conVotacion} abiertas={abiertas} inicial={enEscena} />
      )}
      {!aVotar && (
        <p className="text-xs text-texto-3">Lo que marcas se guarda solo. ¿Quieres calificar a alguien que ya pasó? Está en <Link href={`/panel/audiciones/${aid}/evaluacion`} className="font-bold text-lila">Evaluación</Link>.</p>
      )}
    </div>
  );
}
