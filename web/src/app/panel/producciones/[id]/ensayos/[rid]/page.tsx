import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { Card } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { ASISTENCIA, citados, fechaEnsayo, type Rehearsal } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { CheckinGafete } from "./CheckinGafete";
import { Mark } from "./Mark";

export const metadata: Metadata = { title: "Asistencia" };

type Row = { user_id: string; nombre: string; papeles: string[]; estado: string | null; minutos_tarde: number | null; nota: string | null; aviso: string | null };

// Tomar asistencia de un ensayo (desde el celular). Avisos de ausencia de los integrantes.
export default async function Asistencia({ params }: PageProps<"/panel/producciones/[id]/ensayos/[rid]">) {
  const { id, rid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/ensayos/${rid}`);
  if (!can(access, id, "ensayos.gestionar")) redirect(`/panel/producciones/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const supabase = await createClient();
  const [{ data: r }, { data: rows }] = await Promise.all([
    supabase.from("rehearsals").select("*").eq("id", rid).eq("production_id", id).maybeSingle(),
    supabase.rpc("rehearsal_roster", { rid }),
  ]);
  if (!r) notFound();
  const e = r as Rehearsal;
  const lista = (rows ?? []) as Row[];
  const cuenta = (k: string) => lista.filter((x) => x.estado === k).length;
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <div>
        <Link href={`/panel/producciones/${id}/ensayos`} className="text-sm font-bold text-violeta-claro">← Ensayos</Link>
        <p className="mt-2 text-xl font-bold">{e.titulo}{e.estado === "cancelado" && <span className="ml-2 text-sm text-[#fecdd3]">Cancelado</span>}</p>
        <p className="text-sm text-texto-2">{fechaEnsayo(e.inicia, e.termina)}{e.lugar ? ` · ${e.lugar}` : ""} · {citados(e)}</p>
        {e.notas && <p className="mt-1 whitespace-pre-line text-sm text-texto-2">{e.notas}</p>}
      </div>
      {e.estado !== "cancelado" && <CheckinGafete pid={id} rid={rid} />}
      <Card className="grid grid-cols-2 gap-3 p-4 text-center sm:grid-cols-5 md:p-4">
        {Object.entries(ASISTENCIA).map(([k, v]) => <div key={k}><p className="text-2xl font-black">{cuenta(k)}</p><p className="text-xs text-texto-3">{v.label}</p></div>)}
        <div><p className="text-2xl font-black">{lista.filter((x) => !x.estado).length}</p><p className="text-xs text-texto-3">Sin marcar</p></div>
      </Card>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {lista.map((x) => (
            <li key={x.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <b>{x.nombre}</b> <span className="text-xs text-texto-3">{x.papeles.join(", ")}</span>
                {x.estado === "retardo" && x.minutos_tarde && <span className="ml-2 text-xs text-aviso">{x.minutos_tarde} min</span>}
                {x.nota === "Gafete" && <span className="ml-2 text-xs text-texto-3">🪪 gafete</span>}
                {x.aviso && <span className="block text-xs text-[#a48bff]">{x.aviso}</span>}
              </span>
              <Mark pid={id} rid={rid} uid={x.user_id} actual={x.estado} />
            </li>
          ))}
          {lista.length === 0 && <li className="px-4 py-3 text-texto-2">Nadie citado (o aún no hay integrantes).</li>}
        </ul>
      </Card>
      <p className="text-xs text-texto-3">Los retardos y faltas sin justificar generan advertencias automáticas según las reglas de la obra (Expedientes → Advertencias).</p>
    </div>
  );
}
