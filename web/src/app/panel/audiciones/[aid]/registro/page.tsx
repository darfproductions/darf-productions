import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card, input } from "@/components/panel/ui";
import { DAY_LABEL, dayStatus, daySummary, hora, minutos } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { avisarTurnos, numerarAhora, walkIn } from "../../actions";
import { Desk } from "./Desk";
import { AlFinal, FilaEnVivo } from "./Fila";
import { MoverTurno, StepButtons } from "./StepButtons";
import { companeros } from "@/lib/audicion-vivo-rules";
import { cargarFila } from "./fila-datos";
import { GruposTurno, Separar } from "./Grupos";
import { HorarioSelect } from "./Horario";
import { HorarioGrupo } from "../solicitudes/HorarioGrupo";
import { textoHorario, turnoWhatsAppUrl } from "@/lib/turno-rules";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Día de la audición" };

type Row = {
  id: string; numero: number | null; nombre: string; slot_id: string | null; slot_inicia: string | null; sala: string | null; estado: string;
  walk_in: boolean; es_menor: boolean; checked_in_at: string | null; entered_at: string | null; finished_at: string | null;
  grupo?: string | null;
};

// Día de la audición: lista en orden (sin datos de contacto), QR, Llegó → Entró → Terminó
// con hora de cada paso, quién sigue y alta rápida. Se actualiza sola.
export default async function DayPage({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/registro">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a, may } = await requireAudition(aid, ["audiciones.registro", "audiciones.gestionar"], "/registro");
  const gestiona = may("audiciones.gestionar");
  const { todos, error, enEscena, actual, sigue, esperan, cb, preguntaCon, preguntaGrupo, conQuien, grupoResp, paraGrupos, horarios: slotsLista, gruposHorario } = await cargarFila(aid, a);
  // 0140: teléfonos para mandar el turno por WhatsApp (solo quien gestiona; la base decide qué puede leer).
  const { data: tels } = gestiona
    ? await (await createClient()).from("audition_applications").select("id, telefono, es_menor, tutor_telefono").eq("audition_id", aid)
    : { data: null };
  const telDe = new Map(((tels ?? []) as { id: string; telefono: string | null; es_menor: boolean; tutor_telefono: string | null }[]).map((t) => [t.id, t.es_menor && t.tutor_telefono ? t.tutor_telefono : t.telefono]));
  const slotDe = new Map(slotsLista.map((h) => [h.id, h]));
  const whatsapp = (r: { id: string; nombre: string; numero: number | null; slot_id: string | null }) => {
    if (!r.numero) return null;
    const h = r.slot_id ? slotDe.get(r.slot_id) : null;
    return turnoWhatsAppUrl(telDe.get(r.id), { nombre: r.nombre, titulo: a.titulo, numero: r.numero, horario: textoHorario(h?.inicia, h?.termina), sala: h?.sala, sede: a.sede });
  };
  const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
  const enVivo = a.modalidad !== "en_linea";
  const slot = typeof sp.horario === "string" ? sp.horario : "";
  const filtrados = slot ? todos.filter((r) => (r.slot_id ?? "sin") === slot) : todos;
  // 0134: las solicitudes aún sin aprobar (en revisión) van aparte; si llegan, se registran igual (con aviso).
  const sinAprobar = filtrados.filter((r) => r.estado === "inscrito" && !r.walk_in && !r.checked_in_at);
  const rows = filtrados.filter((r) => !sinAprobar.includes(r));
  const resumen = daySummary(rows);
  const horarios = [...new Map(todos.map((r) => [r.slot_id ?? "sin", r.slot_inicia])).entries()];
  // 0140: se puede mover a mano a cualquiera que aún no pase (todo su turno, si va en grupo). "Sin horario" solo si hay horarios.
  const pendientes = todos.filter((r) => !r.entered_at && !["cancelado", "no_cumple"].includes(r.estado));
  const totalTurnos = new Set(pendientes.map((r) => r.grupo ?? r.id)).size;
  const conHorarios = slotsLista.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <AutoRefresh seconds={20} />
      <div className="flex flex-col gap-4 lg:col-span-5">
        <Card><Desk aid={aid} /></Card>
        {enVivo && <FilaEnVivo aid={aid} actual={actual} sigue={sigue} esperan={esperan} callback={a.fase === "callback"} conGrupo={preguntaGrupo} />}
        {enVivo && (
          <GruposTurno aid={aid} personas={paraGrupos} />
        )}
        {gestiona && (
          <Card className="flex flex-col gap-2">
            <h2 className="font-bold">Turnos</h2>
            {a.numeracion === "llegada" ? (
              <p className="text-sm text-texto-2">Los números se dan en la entrada, por orden de llegada. Si prefieres repartir turnos antes y mandárselos a cada quien, cambia <Link href={`/panel/audiciones/${aid}?seccion=inscripcion`} className="font-bold text-violeta-claro">Números del día</Link> en Configuración a &ldquo;Turnos antes del día&rdquo;.</p>
            ) : a.numeros_asignados_at ? (
              <>
                <p className="text-sm text-texto-2">Turnos repartidos el {fechaCorta(a.numeros_asignados_at)}. Quien se inscriba después pasa al último. Revisa el orden (flechas, &ldquo;Mover a&rdquo; o &ldquo;Cambiar el orden&rdquo;) y mándalos: a cada quien le llega su turno, horario y lugar a su cuenta. Para mandarlo por WhatsApp a una persona, usa el botón de su renglón.</p>
                <ActionForm inline action={avisarTurnos} hidden={{ aid }} confirm="¿Mandar a cada quien su turno (número, horario y lugar)? Les llega un aviso a su cuenta." submit="Mandar turnos a todos" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />
              </>
            ) : (
              <>
                <p className="text-sm text-texto-2">Los turnos se reparten solos al cerrar la inscripción{a.numeracion === "personaje" ? ", por personaje (primero el más importante)" : preguntaGrupo ? ", por grupo (en el orden de las opciones de Grupo)" : slotsLista.length ? ", por horario" : ", por orden de inscripción"}. Si ya quieres, repártelos ahora y luego mándalos.</p>
                <ActionForm inline action={numerarAhora} hidden={{ aid }} confirm="¿Repartir los turnos ya? Después puedes cambiar el orden y mandarlos." submit="Asignar turnos ahora" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />
              </>
            )}
          </Card>
        )}
        {gestiona && preguntaGrupo && <HorarioGrupo aid={aid} grupos={gruposHorario} horarios={slotsLista} conNumeros={false} soloHorario />}
        {gestiona && !preguntaGrupo && slotsLista.length === 0 && (
          <Card className="text-sm text-texto-2"><b>Horarios:</b> esta convocatoria no tiene. Agrégalos en <Link href={`/panel/audiciones/${aid}?seccion=inscripcion#horarios`} className="font-bold text-violeta-claro">Configuración, sección Horarios</Link> y luego asígnalos aquí, en cada renglón.</Card>
        )}
        <Card>
          <details>
            <summary className="cursor-pointer font-bold">+ Alta rápida (llegó sin registro)</summary>
            <div className="mt-3">
              <ActionForm action={walkIn} hidden={{ aid }} submit="Registrar y dar número">
                <div className="grid gap-2">
                  <input className={input} name="nombre" required placeholder="Nombre completo" />
                  <input className={input} name="telefono" type="tel" required placeholder="Teléfono" />
                  <label className="flex flex-col gap-1 text-xs font-semibold">Fecha de nacimiento<input className={input} name="fecha_nacimiento" type="date" required /></label>
                  {a.pedir_tutor && (
                    <>
                      <p className="text-xs text-texto-3">Si es menor de edad: datos de su madre, padre o tutor (deben estar presentes).</p>
                      <input className={input} name="tutor_nombre" placeholder="Nombre del tutor (si es menor)" />
                      <input className={input} name="tutor_telefono" type="tel" placeholder="Teléfono del tutor (si es menor)" />
                    </>
                  )}
                </div>
              </ActionForm>
            </div>
          </details>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7">
        <Card className="grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-4 md:p-4">
          {([["llego", "Esperando"], ["en_sala", "En sala"], ["termino", "Terminaron"], ["pendiente", "Faltan"]] as const).map(([k, label]) => (
            <div key={k}><p className="text-2xl font-black">{resumen[k]}</p><p className="text-xs text-texto-3">{label}</p></div>
          ))}
        </Card>
        {cb && <Card className="border border-lila/40 p-4 text-sm md:p-4"><b>Callback:</b> {cb}. Los llamados entran con su mismo QR y conservan su número.</Card>}
        {horarios.length > 1 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="?" className={`rounded-full border px-3 py-1.5 font-semibold ${!slot ? "border-texto" : "border-white/20"}`}>Todos ({todos.length})</Link>
            {horarios.map(([k, iso]) => (
              <Link key={k} href={`?horario=${k}`} className={`rounded-full border px-3 py-1.5 font-semibold ${slot === k ? "border-texto" : "border-white/20"}`}>
                {iso ? formatSlot(iso) : "Sin horario"} ({todos.filter((r) => (r.slot_id ?? "sin") === k).length})
              </Link>
            ))}
          </div>
        )}
        {error && <Card>{error.message}</Card>}
        <Card className="p-0 md:p-0">
          <p className="px-4 pt-3 text-xs text-texto-3">El número es el turno (lugar en la fila){a.numeracion === "llegada" ? ": se da en la entrada, por orden de llegada" : a.numeros_asignados_at ? "; quienes pasan juntos comparten uno" : ": se reparte al cerrar la inscripción o con \u201cAsignar turnos ahora\u201d"}. Cámbialo con las flechas, &ldquo;Mover a&rdquo; o &ldquo;Al final&rdquo;; con &ldquo;Cambiar el orden&rdquo; se reordena toda la fila.</p>
          <ul className="divide-y divide-white/10">
            {rows.map((r) => {
              const st = dayStatus(r);
              const dur = minutos(r.entered_at, r.finished_at);
              return (
                <li key={r.id} className={`grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 text-sm ${st === "en_sala" ? "bg-[#1e3a8a]/25" : ""}`}>
                  <b className="text-lg">{r.numero ?? <span className="text-xs font-semibold text-texto-3">sin turno</span>}</b>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {gestiona ? <Link href={`/panel/audiciones/${aid}/aspirante/${r.id}`} className="font-bold hover:underline">{r.nombre}</Link> : <b>{r.nombre}</b>}
                      {r.es_menor && <span className="text-xs text-aviso">menor</span>}
                      {r.walk_in && <span className="text-xs text-texto-3">sin cita</span>}
                      {preguntaGrupo && grupoResp.get(r.id) && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-texto-2">{grupoResp.get(r.id)}</span>}
                      {r.grupo && (
                        <span className="rounded-full bg-lila/20 px-2 py-0.5 text-[10px] font-bold text-lila">
                          Pasa con {companeros(todos, r).filter((x) => x.id !== r.id).map((x) => x.nombre.split(" ")[0]).join(", ")}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DAY_LABEL[st].cls}`}>{DAY_LABEL[st].label}</span>
                      {r.id === enEscena && <span className="rounded-full bg-lila px-2 py-0.5 text-[10px] font-bold text-sala">En escena</span>}
                    </span>
                    {(r.slot_inicia || conHorarios || r.checked_in_at) && (
                      <span className="block text-xs text-texto-3">
                        {r.slot_inicia ? <span>{formatSlot(r.slot_inicia, slotDe.get(r.slot_id ?? "")?.termina)}</span> : conHorarios ? "Sin horario" : null}
                        {r.checked_in_at && `${r.slot_inicia || conHorarios ? " · " : ""}llegó ${hora(r.checked_in_at)}`}
                        {r.entered_at && ` · entró ${hora(r.entered_at)}`}
                        {r.finished_at && ` · salió ${hora(r.finished_at)}${dur !== null ? ` (${dur} min)` : ""}`}
                      </span>
                    )}
                  </span>
                  <span className="col-start-2 flex flex-wrap items-center gap-1.5">
                    {!r.entered_at && !["cancelado", "no_cumple"].includes(r.estado) && (
                      <MoverTurno aid={aid} app={r.id} nombre={r.nombre} lugar={r.numero} total={totalTurnos} enGrupo={!!r.grupo} />
                    )}
                    {gestiona && slotsLista.length > 0 && !r.checked_in_at && !r.entered_at && !["cancelado", "no_cumple"].includes(r.estado) && (
                      <HorarioSelect aid={aid} app={r.id} nombre={r.nombre} actual={r.slot_id} horarios={slotsLista.map((h) => ({ id: h.id, texto: h.texto }))} />
                    )}
                    {gestiona && !r.checked_in_at && whatsapp(r) && (
                      <a href={whatsapp(r)!} target="_blank" rel="noreferrer" className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-[#062b16]" title="Mandar su turno por WhatsApp">WhatsApp</a>
                    )}
                    {enVivo && st === "llego" && r.id !== enEscena && <AlFinal aid={aid} app={r.id} nombre={r.nombre} />}
                    {r.grupo && !r.entered_at && <Separar aid={aid} app={r.id} nombre={r.nombre} />}
                    {st !== "no_cumple" && r.id !== enEscena && <StepButtons aid={aid} app={r.id} nombre={r.nombre} status={st} soloLlegada={enVivo} />}
                  </span>
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && <p className="px-5 py-4 text-texto-2">Aún no hay personas en la lista.</p>}
        </Card>
        {sinAprobar.length > 0 && (
          <Card className="p-0 md:p-0">
            <details>
              <summary className="cursor-pointer px-5 py-4 font-bold">Solicitudes sin aprobar ({sinAprobar.length})</summary>
              <p className="px-5 pb-2 text-xs text-texto-3">Todavía están en revisión (se aprueban en Solicitudes). Si alguien llega, se le puede registrar igual.</p>
              <ul className="divide-y divide-white/10">
                {sinAprobar.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <b className="w-12 shrink-0 text-lg">{r.numero ?? "—"}</b>
                    <span className="min-w-0 flex-1">{gestiona ? <Link href={`/panel/audiciones/${aid}/aspirante/${r.id}`} className="font-bold hover:underline">{r.nombre}</Link> : <b>{r.nombre}</b>}</span>
                    <StepButtons aid={aid} app={r.id} nombre={r.nombre} status="pendiente" soloLlegada={enVivo} />
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )}
        <p className="text-xs text-texto-3">La lista se actualiza sola cada 20 segundos. Las horas de llegada, entrada y salida quedan en la ficha de cada aspirante (sirven para ubicarlo en el video del día).</p>
      </div>
    </div>
  );
}
