import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card, input } from "@/components/panel/ui";
import { DAY_LABEL, dayStatus, daySummary, hora, minutos } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { autoOrder, walkIn } from "../../actions";
import { Desk } from "./Desk";
import { OrderButtons, StepButtons } from "./StepButtons";

export const metadata: Metadata = { title: "Día de la audición" };

type Row = {
  id: string; numero: number | null; nombre: string; slot_id: string | null; slot_inicia: string | null; sala: string | null; estado: string;
  walk_in: boolean; es_menor: boolean; checked_in_at: string | null; entered_at: string | null; finished_at: string | null;
};

// Día de la audición: lista en orden (sin datos de contacto), QR, Llegó → Entró → Terminó
// con hora de cada paso, quién sigue y alta rápida. Se actualiza sola.
export default async function DayPage({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/registro">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a, may } = await requireAudition(aid, ["audiciones.registro", "audiciones.gestionar"], "/registro");
  const gestiona = may("audiciones.gestionar");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_day_list", { aid });
  const todos = (data ?? []) as Row[];
  const slot = typeof sp.horario === "string" ? sp.horario : "";
  const rows = slot ? todos.filter((r) => (r.slot_id ?? "sin") === slot) : todos;
  const resumen = daySummary(rows);
  const horarios = [...new Map(todos.map((r) => [r.slot_id ?? "sin", r.slot_inicia])).entries()];
  // Reordenar solo antes de llegar, sobre la lista completa con número.
  const ordenables = todos.filter((r) => r.numero !== null && !r.checked_in_at);
  const vecino = (id: string, d: -1 | 1) => {
    const i = ordenables.findIndex((r) => r.id === id);
    return ordenables[i + d]?.id ?? null;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <AutoRefresh seconds={20} />
      <div className="flex flex-col gap-4 lg:col-span-5">
        <Card><Desk aid={aid} /></Card>
        {gestiona && a.numeracion === "previa" && (
          <Card className="flex flex-col gap-2">
            <h2 className="font-bold">Orden de la lista</h2>
            <p className="text-sm text-texto-2">Cada quien recibe su número al inscribirse. Puedes ordenarlos por horario (y fecha de inscripción) y luego mover a alguien con ↑ ↓. Quien ya llegó conserva su número.</p>
            <ActionForm inline action={autoOrder} hidden={{ aid }} confirm="¿Ordenar por horario a quienes aún no llegan? Sus números pueden cambiar." submit="Ordenar por horario" submitClass="rounded-full border border-white/25 px-4 py-2 text-sm font-bold" />
          </Card>
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
        {resumen.sigue && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border border-aviso/40 p-4 md:p-4">
            <p><span className="text-xs font-bold uppercase tracking-[0.2em] text-aviso">Sigue</span><br />
              <b className="text-xl">{resumen.sigue.numero ? `Nº ${resumen.sigue.numero} · ` : ""}{resumen.sigue.nombre}</b></p>
            <StepButtons aid={aid} app={resumen.sigue.id} nombre={resumen.sigue.nombre} status="llego" />
          </Card>
        )}
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
          <ul className="divide-y divide-white/10">
            {rows.map((r) => {
              const st = dayStatus(r);
              const dur = minutos(r.entered_at, r.finished_at);
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${st === "en_sala" ? "bg-[#1e3a8a]/25" : ""}`}>
                  <b className="w-12 shrink-0 text-lg">{r.numero ?? "—"}</b>
                  <span className="min-w-0 flex-1">
                    {gestiona ? <Link href={`/panel/audiciones/${aid}/aspirante/${r.id}`} className="font-bold hover:underline">{r.nombre}</Link> : <b>{r.nombre}</b>}
                    {r.es_menor && <span className="ml-2 text-xs text-aviso">menor</span>}
                    {r.walk_in && <span className="ml-2 text-xs text-texto-3">sin cita</span>}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${DAY_LABEL[st].cls}`}>{DAY_LABEL[st].label}</span>
                    <span className="block text-xs text-texto-3">
                      {r.slot_inicia ? <span>{formatSlot(r.slot_inicia)}</span> : "Sin horario"}
                      {r.checked_in_at && ` · llegó ${hora(r.checked_in_at)}`}
                      {r.entered_at && ` · entró ${hora(r.entered_at)}`}
                      {r.finished_at && ` · salió ${hora(r.finished_at)}${dur !== null ? ` (${dur} min)` : ""}`}
                    </span>
                  </span>
                  {gestiona && a.numeracion === "previa" && !r.checked_in_at && r.numero !== null && (
                    <OrderButtons aid={aid} app={r.id} prev={vecino(r.id, -1)} next={vecino(r.id, 1)} />
                  )}
                  {st !== "no_cumple" && <StepButtons aid={aid} app={r.id} nombre={r.nombre} status={st} />}
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && <p className="px-5 py-4 text-texto-2">Aún no hay personas en la lista.</p>}
        </Card>
        <p className="text-xs text-texto-3">La lista se actualiza sola cada 20 segundos. Las horas de llegada, entrada y salida quedan en la ficha de cada aspirante (sirven para ubicarlo en el video del día).</p>
      </div>
    </div>
  );
}
