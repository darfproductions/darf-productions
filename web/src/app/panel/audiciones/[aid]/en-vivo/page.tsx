import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import type { Criterio } from "@/lib/audition-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { rondaDeFase } from "@/lib/votacion-rules";
import type { PersonaCierre } from "@/lib/audicion-vivo-rules";
import { juezActual } from "../../actions";
import { EnEscenaJuez } from "../evaluacion/EnEscenaJuez";
import { EnEscenaHost } from "../entrevista/EnEscenaHost";
import { Terminar } from "../entrevista/Terminar";
import { Desk } from "../registro/Desk";
import { AlFinal, FilaEnVivo } from "../registro/Fila";
import { GruposTurno } from "../registro/Grupos";
import { cargarFila } from "../registro/fila-datos";
import { GuiaFases, pasoActual } from "../GuiaFases";
import { PantallaCompleta } from "./PantallaCompleta";

export const metadata: Metadata = { title: "Modo audición" };

type Como = "juez" | "host" | "recepcion";
const COMO: Record<Como, string> = { juez: "Como juez", host: "Como host", recepcion: "Como recepción" };

// 0137: una sola pantalla para el día. Arriba, la barra de fases (Inscripción → Día → Callback → Votación → Cast) con
// lo que falta y "Siguiente"; abajo, lo que te toca según tu rol: recepción (entrada y fila), host (quién está en
// escena, entrevista, terminar la ronda) o juez (quien está en escena y su calificación). Quien tiene varios roles
// elige con las pastillas. Las pestañas de siempre siguen ahí para quien ya las conoce.
export default async function ModoAudicion({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/en-vivo">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a, may } = await requireAudition(aid, ["audiciones.evaluar", "audiciones.entrevista", "audiciones.registro", "audiciones.gestionar"], "/en-vivo");
  const gestiona = may("audiciones.gestionar");
  const roles: Como[] = [
    ...(may("audiciones.evaluar") ? ["juez" as const] : []),
    ...(may("audiciones.entrevista") || gestiona ? ["host" as const] : []),
    ...(may("audiciones.registro") || gestiona ? ["recepcion" as const] : []),
  ];
  const pedido = typeof sp.como === "string" ? (sp.como as Como) : null;
  const como: Como = pedido && roles.includes(pedido) ? pedido : roles[0];
  const supabase = await createClient();
  const { data: rolesData } = await supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden");
  const personajes = (rolesData ?? []) as { id: string; nombre: string }[];
  const conVotacion = personajes.length > 0 && !a.permanente;
  const ronda = conVotacion ? rondaDeFase(a.fase) : 1;
  const paso = pasoActual(a.estado, a.fase, conVotacion);
  const enDia = paso === "audicion" || paso === "callback";
  const enLinea = a.modalidad === "en_linea";

  // Lo que falta en el paso actual (solo con permiso para verlo).
  let falta: string | null = null;
  let fila: Awaited<ReturnType<typeof cargarFila>> | null = null;
  if (paso === "inscripcion" && gestiona) {
    const [{ count: total }, { count: revision }] = await Promise.all([
      supabase.from("audition_applications").select("id", { count: "exact", head: true }).eq("audition_id", aid).not("estado", "in", "(cancelado,no_cumple)"),
      supabase.from("audition_applications").select("id", { count: "exact", head: true }).eq("audition_id", aid).eq("estado", "inscrito").is("checked_in_at", null),
    ]);
    falta = `${total ?? 0} ${total === 1 ? "solicitud" : "solicitudes"}${revision ? ` · ${revision} en revisión` : ""}.`;
  }
  if (enDia && !enLinea && (gestiona || may("audiciones.registro") || may("audiciones.entrevista"))) {
    fila = await cargarFila(aid, a);
    const llegaron = fila.todos.filter((r) => r.checked_in_at).length;
    const terminaron = fila.todos.filter((r) => r.finished_at).length;
    falta = `${llegaron} llegaron · ${fila.esperan} esperan · ${terminaron} ya pasaron de ${fila.todos.length}.`;
  }

  // Votación o cast: para todos, el aviso y a dónde ir.
  const votando = conVotacion && a.fase === "votacion";
  const cerrada = conVotacion && ["ajuste", "enviado", "seleccion_callback"].includes(a.fase);

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={como === "juez" ? 30 : 20} />
      <GuiaFases aid={aid} estado={a.estado} fase={a.fase} votacion={conVotacion} conCallback={a.con_callback} gestiona={gestiona} falta={falta} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Ver como" className="flex flex-wrap gap-2">
          {roles.length > 1 && roles.map((r) => (
            <Link key={r} href={`?como=${r}`} aria-current={r === como ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${r === como ? "border-texto bg-texto text-sala" : "border-white/20"}`}>{COMO[r]}</Link>
          ))}
        </nav>
        {como === "juez" && <PantallaCompleta />}
      </div>

      {paso === "inscripcion" && (
        <Card className="flex flex-col gap-2">
          <p className="titular text-xl">{a.estado === "borrador" ? "La convocatoria está en borrador" : "La inscripción sigue abierta"}</p>
          <p className="text-sm text-texto-2">
            {a.estado === "borrador" ? "Revisa la configuración y ábrela cuando esté lista." : "Mientras tanto, revisa y aprueba las solicitudes; el día de la audición empieza al cerrar la inscripción."}
          </p>
          <div className="flex flex-wrap gap-2">
            {gestiona && <Link href={`/panel/audiciones/${aid}/solicitudes`} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">Revisar solicitudes <Icono nombre="flecha-der" /></Link>}
            {gestiona && <Link href={`/panel/audiciones/${aid}`} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Configuración</Link>}
          </div>
        </Card>
      )}

      {votando && (
        <Card className="flex flex-col items-start gap-3 border border-lila/50">
          <p className="titular text-2xl">Terminaron las audiciones: ¡a votar!</p>
          <p className="text-texto-2">Vota por cada personaje. Los votos son secretos hasta que se cierre la votación.</p>
          <Link href={`/panel/audiciones/${aid}/votacion`} className="rounded-full bg-texto px-5 py-3 font-bold text-sala">Ir a votar <Icono nombre="flecha-der" /></Link>
        </Card>
      )}
      {cerrada && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold">{a.fase === "seleccion_callback" ? "Elige quién pasa a callback." : a.fase === "ajuste" ? "La votación cerró: ajusta y manda el cast." : "El cast ya se envió."}</p>
          {gestiona && <Link href={`/panel/audiciones/${aid}/${a.fase === "seleccion_callback" ? "resultados" : "cast"}`} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">{a.fase === "seleccion_callback" ? "Elegir callback" : "Ir al cast"} <Icono nombre="flecha-der" /></Link>}
        </Card>
      )}

      {enDia && enLinea && (
        <Card className="text-sm text-texto-2">Esta audición es en línea: los jueces califican los videos en <Link href={`/panel/audiciones/${aid}/evaluacion`} className="font-bold text-lila">Evaluación</Link>.</Card>
      )}

      {enDia && !enLinea && como === "juez" && (
        <>
          <EnEscenaJuez aid={aid} ronda={ronda} criterios={(a.criterios ?? []) as Criterio[]} roles={personajes} conVotacion={conVotacion}
            abiertas={(ronda === 1 && ["audicion", "seleccion_callback"].includes(a.fase)) || (ronda === 2 && a.fase === "callback")} inicial={await juezActual(aid, ronda)} />
          <p className="text-xs text-texto-3">Lo que marcas se guarda solo. ¿Quieres calificar a alguien que ya pasó? Está en <Link href={`/panel/audiciones/${aid}/evaluacion`} className="font-bold text-lila">Evaluación</Link>.</p>
        </>
      )}

      {enDia && !enLinea && como === "host" && fila && <PanelHost aid={aid} fase={a.fase} permanente={a.permanente} actual={fila.actual} sigue={fila.sigue} esperan={fila.esperan} />}

      {enDia && !enLinea && como === "recepcion" && fila && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Card><Desk aid={aid} /></Card>
            <FilaEnVivo aid={aid} actual={fila.actual} sigue={fila.sigue} esperan={fila.esperan} callback={a.fase === "callback"} conGrupo={fila.preguntaGrupo} />
            {fila.paraGrupos.length >= 2 && <GruposTurno aid={aid} personas={fila.paraGrupos} />}
          </div>
          <div className="flex flex-col gap-3 lg:col-span-7">
            {fila.cb && <Card className="border border-lila/40 p-4 text-sm md:p-4"><b>Callback:</b> {fila.cb}. Los llamados entran con su mismo QR y conservan su número.</Card>}
            <Card className="p-0 md:p-0">
              <p className="px-4 pt-4 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Esperan</p>
              <ul className="divide-y divide-white/10">
                {fila.todos.filter((r) => r.checked_in_at && !r.finished_at && r.id !== fila!.enEscena && !["cancelado", "no_cumple"].includes(r.estado)).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <b className="w-10 text-lg">{r.numero ?? "—"}</b>
                    <span className="min-w-0 flex-1">{r.nombre}{r.entered_at && <span className="ml-2 text-xs text-lila">en sala</span>}</span>
                    {!r.entered_at && <AlFinal aid={aid} app={r.id} nombre={r.nombre} />}
                  </li>
                ))}
              </ul>
              {fila.todos.filter((r) => r.checked_in_at && !r.finished_at).length === 0 && <p className="px-4 py-4 text-sm text-texto-3">Nadie esperando todavía.</p>}
              <p className="px-4 pb-4 text-xs text-texto-3">La lista completa, con horarios y el orden, está en <Link href={`/panel/audiciones/${aid}/registro`} className="font-bold text-lila">Día de la audición</Link>.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/** El host: quién está en escena, quién sigue, su entrevista y, al final, terminar la ronda. */
async function PanelHost({ aid, fase, permanente, actual, sigue, esperan }: { aid: string; fase: string; permanente: boolean; actual: { id: string; numero: number | null; nombre: string } | null; sigue: { id: string; numero: number | null; nombre: string } | null; esperan: number }) {
  const supabase = await createClient();
  const terminar = !permanente && ["audicion", "seleccion_callback", "callback"].includes(fase);
  const [{ data: lista }, { data: cierre }] = await Promise.all([
    supabase.rpc("audition_entrevistas_lista", { aid }),
    terminar ? supabase.rpc("audition_cierre_datos", { aid }) : Promise.resolve({ data: null }),
  ]);
  const pendientes = ((lista ?? []) as { id: string; hecha: boolean; llego: boolean }[]).filter((f) => f.llego && !f.hecha);
  const datosCierre = cierre as { personajes: { id: string; nombre: string }[]; personas: PersonaCierre[] } | null;
  return (
    <div className="flex flex-col gap-4">
      <EnEscenaHost aid={aid} actual={actual ? { app: actual.id, numero: actual.numero, nombre: actual.nombre } : null} esta={sigue ? { app: sigue.id, nombre: sigue.nombre } : undefined} />
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm"><b>Sigue:</b> {sigue ? `${sigue.numero ? `Nº ${sigue.numero} · ` : ""}${sigue.nombre}` : "nadie en espera"} · <b>{esperan}</b> esperando · <b>{pendientes.length}</b> sin entrevista</p>
        <span className="flex gap-2">
          {actual && <Link href={`/panel/audiciones/${aid}/entrevista/${actual.id}`} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">Entrevista de {actual.nombre.split(" ")[0]} <Icono nombre="flecha-der" /></Link>}
          <Link href={`/panel/audiciones/${aid}/entrevista`} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Lista de entrevistas</Link>
        </span>
      </Card>
      {datosCierre && datosCierre.personajes.length > 0 && (
        <Terminar aid={aid} fase={fase} faltan={esperan + (actual ? 1 : 0)} personajes={datosCierre.personajes} personas={datosCierre.personas} />
      )}
    </div>
  );
}
