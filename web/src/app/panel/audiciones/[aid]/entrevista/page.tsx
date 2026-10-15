import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Entrevista" };

type Fila = { id: string; numero: number | null; nombre: string; es_menor: boolean; llego: boolean; entro: boolean; termino: boolean; hecha: boolean };

// Entrevista del host (0112): la lista del día; quien ya llegó y no tiene entrevista va primero.
export default async function Entrevistas({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/entrevista">) {
  const { aid } = await params;
  const sp = await searchParams;
  await requireAudition(aid, ["audiciones.entrevista", "audiciones.gestionar"], "/entrevista");
  const { data, error } = await (await createClient()).rpc("audition_entrevistas_lista", { aid });
  const todos = (data ?? []) as Fila[];
  const ver = sp.ver === "todos" ? "todos" : "pendientes";
  const pendientes = todos.filter((f) => !f.hecha);
  const lista = (ver === "todos" ? todos : pendientes).slice().sort((a, b) => Number(b.llego && !b.hecha) - Number(a.llego && !a.hecha));
  const pill = (activo: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${activo ? "border-texto" : "border-white/20"}`;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">Entrevista</h2>
        <p className="text-sm text-texto-2">Recibe a cada aspirante, hazle las preguntas y anótalas. Queda en su solicitud y en su ficha de talento. Quien ya llegó y aún no tiene entrevista sale primero.</p>
        <p className="text-sm"><b>{todos.length - pendientes.length}</b> de <b>{todos.length}</b> entrevistados.</p>
      </Card>
      <nav aria-label="Filtro" className="flex gap-2">
        <Link href="?" className={pill(ver === "pendientes")}>Pendientes ({pendientes.length})</Link>
        <Link href="?ver=todos" className={pill(ver === "todos")}>Todos ({todos.length})</Link>
      </nav>
      {error && <Card>{error.message}</Card>}
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {lista.map((f) => (
            <li key={f.id}>
              <Link href={`/panel/audiciones/${aid}/entrevista/${f.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-white/5">
                <b className="w-12 shrink-0 text-lg">{f.numero ?? "—"}</b>
                <span className="min-w-0 flex-1">
                  <b>{f.nombre}</b>
                  {f.es_menor && <span className="ml-2 text-xs text-aviso">menor</span>}
                  <span className="block text-xs text-texto-3">{f.termino ? "Ya salió" : f.entro ? "En sala" : f.llego ? "Ya llegó" : "Aún no llega"}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.hecha ? "bg-[#14532d] text-[#bbf7d0]" : "bg-[#3a3346] text-texto-2"}`}>{f.hecha ? "Entrevistado" : "Pendiente"}</span>
                <Icono nombre="flecha-der" />
              </Link>
            </li>
          ))}
        </ul>
        {lista.length === 0 && <p className="px-5 py-4 text-texto-2">{ver === "todos" ? "Aún no hay aspirantes." : "Todos tienen su entrevista."}</p>}
      </Card>
    </div>
  );
}
