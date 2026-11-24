import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { FASE_LABEL, anteriorFase, botonSiguiente, fasesDe, type Fase } from "@/lib/votacion-rules";
import { moverFase } from "../votacion-actions";
import { Icono } from "@/components/Icono";

const DONDE: Partial<Record<Fase, { href: string; texto: string }>> = {
  audicion: { href: "/evaluacion", texto: "Marca tus opciones en Evaluación" },
  seleccion_callback: { href: "/resultados", texto: "Elige quién pasa y cuándo es el callback" },
  callback: { href: "/evaluacion", texto: "Marca tus opciones del callback" },
  votacion: { href: "/votacion", texto: "Vota por cada personaje" },
  ajuste: { href: "/cast", texto: "Ve los resultados y ajusta el cast" },
};

// Barra de etapas de una convocatoria con personajes (0089). Quien gestiona avanza o regresa;
// los jueces ven en qué etapa va y a dónde ir.
// 0167: en «Elegir callback» no hay «Siguiente» suelto: se llama al callback desde esa pantalla (con fecha). En el
// ajuste, «Regresar» (borra el cast) solo lo ve quien arma el cast (Dirección general).
export function Etapas({ aid, fase, conCallback, gestiona, evalua, armaCast = true }: { aid: string; fase: Fase; conCallback: boolean; gestiona: boolean; evalua: boolean; armaCast?: boolean }) {
  const fases = fasesDe(conCallback);
  const i = fases.indexOf(fase);
  const sig = fase === "seleccion_callback" ? null : botonSiguiente(fase, conCallback);
  const ant = fase === "ajuste" && !armaCast ? null : anteriorFase(fase, conCallback);
  const donde = DONDE[fase];
  const verDonde = donde && (gestiona || (evalua && ["/evaluacion", "/votacion"].includes(donde.href)));
  return (
    <section aria-label="Etapas de la audición" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-telon p-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        {fases.map((f, k) => (
          <li key={f} aria-current={f === fase ? "step" : undefined}
            className={`rounded-full px-3 py-1.5 ${f === fase ? "bg-texto text-sala" : k < i ? "bg-white/10 text-texto-2" : "border border-white/15 text-texto-3"}`}>
            {k < i && <><Icono nombre="check" /> </>}{FASE_LABEL[f]}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {verDonde && <Link href={`/panel/audiciones/${aid}${donde.href}`} className="text-sm font-bold text-lila">{donde.texto} <Icono nombre="flecha-der" /></Link>}
        {gestiona && sig && (
          <ActionForm inline action={moverFase} hidden={{ aid, dir: "siguiente" }}
            confirm={fase === "votacion" ? "¿Cerrar la votación? Se ven los resultados, se arma la propuesta del cast y ya no se puede votar." : `¿Pasar a la siguiente etapa?`}
            submit={sig} submitClass="rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala disabled:opacity-60" />
        )}
        {gestiona && ant && (
          <ActionForm inline action={moverFase} hidden={{ aid, dir: "anterior" }}
            confirm={fase === "ajuste" ? "¿Regresar a la votación? Se borra la propuesta y los cambios del cast." : "¿Regresar a la etapa anterior?"}
            submit="Regresar" submitClass="rounded-full border border-white/25 px-3 py-2 text-xs font-bold disabled:opacity-60" />
        )}
        {fase === "enviado" && <span className="text-sm text-exito">Cast enviado: las respuestas llegan a Elenco y equipos.</span>}
      </div>
    </section>
  );
}
