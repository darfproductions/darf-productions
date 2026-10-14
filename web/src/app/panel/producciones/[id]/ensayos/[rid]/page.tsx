import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EquipoEncargados, type Persona } from "@/components/ensayos/EquipoEncargados";
import { ListaAsistencia, type FilaLista } from "@/components/ensayos/ListaAsistencia";
import { Icono } from "@/components/Icono";
import { ActionForm } from "@/components/panel/ActionForm";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { citados, fechaEnsayo, type Rehearsal } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { setEquipoEnsayo } from "../actions";

export const metadata: Metadata = { title: "Asistencia" };

// Tomar asistencia de un ensayo (desde el celular): elenco y equipo de producción citados, con QR o a mano.
// Varias personas pueden pasar lista a la vez (0099).
export default async function Asistencia({ params }: PageProps<"/panel/producciones/[id]/ensayos/[rid]">) {
  const { id, rid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/ensayos/${rid}`);
  if (!can(access, id, "ensayos.gestionar")) redirect(`/panel/producciones/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const supabase = await createClient();
  const [{ data: r }, { data: rows }, { data: cast }, { data: team }] = await Promise.all([
    supabase.from("rehearsals").select("*").eq("id", rid).eq("production_id", id).maybeSingle(),
    supabase.rpc("rehearsal_roster", { rid }),
    supabase.rpc("cast_roster", { pid: id }),
    supabase.rpc("equipo_ensayos", { pid: id }),
  ]);
  if (!r) notFound();
  const e = r as Rehearsal;
  const elenco: Persona[] = ((cast ?? []) as { user_id: string; nombre: string }[]).map((x) => ({ user_id: x.user_id, nombre: x.nombre }));
  const equipo: Persona[] = ((team ?? []) as { user_id: string; nombre: string; roles: string[] }[]).map((x) => ({ user_id: x.user_id, nombre: x.nombre, detalle: x.roles.join(", ") }));
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={10} />
      <div>
        <Link href={`/panel/producciones/${id}/ensayos`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Ensayos</Link>
        <p className="mt-2 text-xl font-bold">{e.titulo}{e.estado === "cancelado" && <span className="ml-2 text-sm text-[#fecdd3]">Cancelado</span>}</p>
        <p className="text-sm text-texto-2">{fechaEnsayo(e.inicia, e.termina)}{e.lugar ? ` · ${e.lugar}` : ""} · {citados(e)}</p>
        {e.notas && <p className="mt-1 whitespace-pre-line text-sm text-texto-2">{e.notas}</p>}
      </div>
      <ListaAsistencia pid={id} rid={rid} ensayo={e} filas={(rows ?? []) as FilaLista[]} puede lider />
      <details className="rounded-[22px] border border-linea bg-telon">
        <summary className="cursor-pointer px-5 py-4 font-bold">Equipo citado y encargados</summary>
        <div className="px-5 pb-5">
          <ActionForm action={setEquipoEnsayo} hidden={{ pid: id, rid }} submit="Guardar">
            <EquipoEncargados equipo={equipo} elenco={elenco} valores={{ equipo: e.equipo, equipo_todos: e.equipo_todos, encargados: e.encargados }} />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
