import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { EnEscenaHost, PonerEnEscena } from "./EnEscenaHost";
import { Terminar } from "./Terminar";
import { enLaFila, type FilaVivo, type PersonaCierre } from "@/lib/audicion-vivo-rules";

export const metadata: Metadata = { title: "Entrevista" };

type Fila = { id: string; numero: number | null; nombre: string; es_menor: boolean; llego: boolean; entro: boolean; termino: boolean; hecha: boolean };

// Entrevista del host (0112): la lista del día; quien ya llegó y no tiene entrevista va primero.
export default async function Entrevistas({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/entrevista">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a } = await requireAudition(aid, ["audiciones.entrevista", "audiciones.gestionar"], "/entrevista");
  const supabase = await createClient();
  // 0131: con personajes, el host también termina las audiciones (votación o callbacks).
  const terminar = !a.permanente && ["audicion", "seleccion_callback", "callback"].includes(a.fase);
  const [{ data, error }, { data: escena }, { data: cierre }, { data: dia }] = await Promise.all([
    supabase.rpc("audition_entrevistas_lista", { aid }),
    supabase.rpc("audition_juez_actual", { aid }),
    terminar ? supabase.rpc("audition_cierre_datos", { aid }) : Promise.resolve({ data: null }),
    terminar ? supabase.rpc("audition_day_list", { aid }) : Promise.resolve({ data: null }),
  ]);
  const datosCierre = cierre as { personajes: { id: string; nombre: string }[]; personas: PersonaCierre[] } | null;
  const faltan = enLaFila((dia ?? []) as FilaVivo[], a.fase).filter((r) => r.checked_in_at && !r.finished_at && !["cancelado", "no_cumple"].includes(r.estado)).length;
  const actual = (escena as { app: string | null; numero: number | null; nombre: string } | null)?.app ? (escena as { app: string; numero: number | null; nombre: string }) : null;
  const todos = (data ?? []) as Fila[];
  const ver = sp.ver === "todos" ? "todos" : "pendientes";
  const pendientes = todos.filter((f) => !f.hecha);
  const lista = (ver === "todos" ? todos : pendientes).slice().sort((a, b) => Number(b.llego && !b.hecha) - Number(a.llego && !a.hecha));
  const pill = (activo: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${activo ? "border-texto" : "border-white/20"}`;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={15} />
      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">Entrevista</h2>
        <p className="text-sm text-texto-2">Recibe a cada aspirante, hazle las preguntas y anótalas. Queda en su solicitud y en su ficha de talento. Quien ya llegó y aún no tiene entrevista sale primero.</p>
        <p className="text-sm"><b>{todos.length - pendientes.length}</b> de <b>{todos.length}</b> entrevistados.</p>
      </Card>
      <EnEscenaHost aid={aid} actual={actual} />
      {!a.permanente && ["votacion", "ajuste", "enviado"].includes(a.fase) && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-lila/40">
          <p className="font-bold">{a.fase === "votacion" ? "Terminaron las audiciones: los jueces están votando." : "La votación ya cerró."}</p>
          <Link href={`/panel/audiciones/${aid}/votacion`} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">Ver la votación <Icono nombre="flecha-der" /></Link>
        </Card>
      )}
      {datosCierre && datosCierre.personajes.length > 0 && (
        <Terminar aid={aid} fase={a.fase} faltan={faltan} personajes={datosCierre.personajes} personas={datosCierre.personas} />
      )}
      <nav aria-label="Filtro" className="flex gap-2">
        <Link href="?" className={pill(ver === "pendientes")}>Pendientes ({pendientes.length})</Link>
        <Link href="?ver=todos" className={pill(ver === "todos")}>Todos ({todos.length})</Link>
      </nav>
      {error && <Card>{error.message}</Card>}
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {lista.map((f) => (
            <li key={f.id} className={`flex items-center gap-2 pr-3 ${actual?.app === f.id ? "bg-lila/10" : ""}`}>
              <Link href={`/panel/audiciones/${aid}/entrevista/${f.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-white/5">
                <b className="w-12 shrink-0 text-lg">{f.numero ?? "—"}</b>
                <span className="min-w-0 flex-1">
                  <b>{f.nombre}</b>
                  {f.es_menor && <span className="ml-2 text-xs text-aviso">menor</span>}
                  <span className="block text-xs text-texto-3">{f.termino ? "Ya salió" : f.entro ? "En sala" : f.llego ? "Ya llegó" : "Aún no llega"}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.hecha ? "bg-[#14532d] text-[#bbf7d0]" : "bg-[#3a3346] text-texto-2"}`}>{f.hecha ? "Entrevistado" : "Pendiente"}</span>
                <Icono nombre="flecha-der" />
              </Link>
              {actual?.app === f.id
                ? <span className="rounded-full bg-lila px-3 py-1 text-xs font-bold text-sala">En escena</span>
                : f.llego && !f.termino && <PonerEnEscena aid={aid} app={f.id} />}
            </li>
          ))}
        </ul>
        {lista.length === 0 && <p className="px-5 py-4 text-texto-2">{ver === "todos" ? "Aún no hay aspirantes." : "Todos tienen su entrevista."}</p>}
      </Card>
    </div>
  );
}
