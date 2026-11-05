import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { FASE_LABEL, anteriorFase, botonSiguiente, fasesDe, type Fase } from "@/lib/votacion-rules";
import { setAuditionEstado } from "../actions";
import { moverFase } from "../votacion-actions";

export type PasoGuia = { id: string; label: string };

/** Las etapas completas de una convocatoria, de la inscripción al cast (o a "Finalizada" si no vota). */
export function pasosGuia(votacion: boolean, conCallback: boolean): PasoGuia[] {
  const base: PasoGuia[] = [{ id: "inscripcion", label: "Inscripción" }];
  if (votacion) return [...base, ...fasesDe(conCallback).map((f) => ({ id: f, label: f === "audicion" ? "Día de la audición" : FASE_LABEL[f] }))];
  return [...base, { id: "audicion", label: "Día de la audición" }, { id: "finalizada", label: "Finalizada" }];
}

/** En qué paso va: mientras la inscripción esté abierta (o en borrador), en Inscripción; luego, la fase. */
export function pasoActual(estado: string, fase: Fase, votacion: boolean): string {
  if (estado === "borrador" || estado === "abierta") return "inscripcion";
  if (!votacion) return estado === "finalizada" ? "finalizada" : "audicion";
  return fase;
}

// 0137: barra de fases de la audición completa (Inscripción → Día → Callback → Votación → Cast), con lo que falta en
// el paso actual y el botón para avanzar (quien gestiona). Reemplaza a saltar entre pestañas.
export function GuiaFases({ aid, estado, fase, votacion, conCallback, gestiona, falta }: {
  aid: string; estado: string; fase: Fase; votacion: boolean; conCallback: boolean; gestiona: boolean; falta?: string | null;
}) {
  const pasos = pasosGuia(votacion, conCallback);
  const actual = pasoActual(estado, fase, votacion);
  const i = pasos.findIndex((p) => p.id === actual);
  const enInscripcion = actual === "inscripcion";
  const sig = votacion && !enInscripcion ? botonSiguiente(fase, conCallback) : null;
  const ant = votacion && !enInscripcion ? anteriorFase(fase, conCallback) : null;
  const btn = "rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala disabled:opacity-60";
  const ghost = "rounded-full border border-white/25 px-3 py-2 text-xs font-bold disabled:opacity-60";
  return (
    <section aria-label="Etapas de la audición" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-telon p-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        {pasos.map((p, k) => (
          <li key={p.id} aria-current={p.id === actual ? "step" : undefined}
            className={`rounded-full px-3 py-1.5 ${p.id === actual ? "bg-texto text-sala" : k < i ? "bg-white/10 text-texto-2" : "border border-white/15 text-texto-3"}`}>
            {k < i && <><Icono nombre="check" /> </>}{p.label}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {falta && <p className="text-sm text-texto-2">{falta}</p>}
        {gestiona && enInscripcion && estado === "borrador" && (
          <ActionForm inline action={setAuditionEstado} hidden={{ aid, estado: "abierta" }} confirm="¿Abrir la convocatoria? Aparecerá en la web y la gente podrá inscribirse." submit="Abrir inscripción" submitClass={btn} />
        )}
        {gestiona && enInscripcion && estado === "abierta" && (
          <ActionForm inline action={setAuditionEstado} hidden={{ aid, estado: "cerrada" }} confirm="¿Cerrar la inscripción? Ya nadie podrá inscribirse y pasamos al día de la audición." submit="Siguiente: cerrar inscripción" submitClass={btn} />
        )}
        {gestiona && !enInscripcion && !votacion && estado === "cerrada" && (
          <ActionForm inline action={setAuditionEstado} hidden={{ aid, estado: "finalizada" }} confirm="¿Marcar la audición como finalizada?" submit="Siguiente: finalizar" submitClass={btn} />
        )}
        {gestiona && sig && (
          <ActionForm inline action={moverFase} hidden={{ aid, dir: "siguiente" }}
            confirm={fase === "votacion" ? "¿Cerrar la votación? Se calcula la propuesta del cast y ya no se puede votar." : "¿Pasar a la siguiente etapa?"}
            submit={sig} submitClass={btn} />
        )}
        {gestiona && ant && (
          <ActionForm inline action={moverFase} hidden={{ aid, dir: "anterior" }}
            confirm={fase === "ajuste" ? "¿Regresar a la votación? Se borra la propuesta y los cambios del cast." : "¿Regresar a la etapa anterior?"}
            submit="Regresar" submitClass={ghost} />
        )}
        {gestiona && !enInscripcion && estado === "cerrada" && votacion && fase === "audicion" && (
          <ActionForm inline action={setAuditionEstado} hidden={{ aid, estado: "abierta" }} confirm="¿Volver a abrir la inscripción?" submit="Reabrir inscripción" submitClass={ghost} />
        )}
        {actual === "enviado" && <span className="text-sm text-exito">Cast enviado: las respuestas llegan a Elenco y equipos.</span>}
      </div>
    </section>
  );
}
