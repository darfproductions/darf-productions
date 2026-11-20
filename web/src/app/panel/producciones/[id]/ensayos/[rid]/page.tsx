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
import { setEquipoEnsayo, setSinAsistencia, updateRehearsal } from "../actions";
import { input } from "@/components/panel/ui";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { isoToLocalMx } from "@/lib/dates";
import { TITULOS_ENSAYO } from "@/lib/rehearsal-rules";

export const metadata: Metadata = { title: "Asistencia" };

// Tomar asistencia de un ensayo (desde el celular): elenco y equipo de producción citados, con QR o a mano.
// Varias personas pueden pasar lista a la vez (0099).
export default async function Asistencia({ params }: PageProps<"/panel/producciones/[id]/ensayos/[rid]">) {
  const { id, rid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/ensayos/${rid}`);
  if (!can(access, id, "ensayos.gestionar")) redirect(`/panel/producciones/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const supabase = await createClient();
  const [{ data: r }, { data: rows }, { data: cast }, { data: team }, { data: conf }] = await Promise.all([
    supabase.from("rehearsals").select("*").eq("id", rid).eq("production_id", id).maybeSingle(),
    supabase.rpc("rehearsal_roster", { rid }),
    supabase.rpc("cast_roster", { pid: id }),
    supabase.rpc("equipo_ensayos", { pid: id }),
    supabase.from("rehearsal_confirmations").select("user_id").eq("rehearsal_id", rid),
  ]);
  if (!r) notFound();
  const confirmaron = new Set(((conf ?? []) as { user_id: string }[]).map((c) => c.user_id));
  const e = r as Rehearsal;
  const elenco: Persona[] = ((cast ?? []) as { user_id: string; nombre: string }[]).map((x) => ({ user_id: x.user_id, nombre: x.nombre }));
  const equipo: Persona[] = ((team ?? []) as { user_id: string; nombre: string; roles: string[] }[]).map((x) => ({ user_id: x.user_id, nombre: x.nombre, detalle: x.roles.join(", ") }));
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={30} />
      <div>
        <Link href={`/panel/producciones/${id}/ensayos`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Ensayos</Link>
        <p className="mt-2 text-xl font-bold">{e.titulo}{e.estado === "cancelado" && <span className="ml-2 text-sm text-[#fecdd3]">Cancelado</span>}</p>
        <p className="text-sm text-texto-2">{fechaEnsayo(e.inicia, e.termina)}{e.lugar ? ` · ${e.lugar}` : ""} · {citados(e)}</p>
        {confirmaron.size > 0 && <p className="text-sm text-exito"><Icono nombre="check" /> {confirmaron.size === 1 ? "1 persona confirmó" : `${confirmaron.size} personas confirmaron`} que van: {((rows ?? []) as FilaLista[]).filter((x) => confirmaron.has(x.user_id)).map((x) => x.nombre).join(", ")}</p>}
        {e.notas && <p className="mt-1 whitespace-pre-line text-sm text-texto-2">{e.notas}</p>}
      </div>
      {/* Editar el ensayo (por si algo cambia). */}
      <details className="rounded-[22px] border border-linea bg-telon">
        <summary className="cursor-pointer px-5 py-4 font-bold">Editar ensayo</summary>
        <div className="px-5 pb-5">
          <ActionForm action={updateRehearsal} hidden={{ pid: id, rid, serie: e.serie_id ?? "" }} submit="Guardar cambios">
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Título<input className={input} name="titulo" defaultValue={e.titulo} list="titulos-ensayo" /></label>
              <datalist id="titulos-ensayo">{TITULOS_ENSAYO.map((t) => <option key={t} value={t} />)}</datalist>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Lugar<input className={input} name="lugar" defaultValue={e.lugar ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Fecha<input className={input} type="date" name="fecha" required defaultValue={isoToLocalMx(e.inicia).slice(0, 10)} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Empieza<input className={input} type="time" name="hora" required defaultValue={isoToLocalMx(e.inicia).slice(11, 16)} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Termina (opcional)<input className={input} type="time" name="fin" defaultValue={e.termina ? isoToLocalMx(e.termina).slice(11, 16) : ""} /></label>
              <textarea className={`${input} min-h-16 sm:col-span-4`} name="notas" defaultValue={e.notas ?? ""} placeholder="Notas: qué traer, escenas que se verán…" />
            </div>
            <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <legend className="px-1 text-xs font-bold uppercase tracking-widest text-texto-3">A quién del elenco se cita</legend>
              <label className="flex items-center gap-2"><input type="radio" name="convocatoria" value="todos" defaultChecked={e.convocatoria === "todos"} /> Todo el elenco</label>
              <label className="flex flex-wrap items-center gap-2"><input type="radio" name="convocatoria" value="grupos" defaultChecked={e.convocatoria === "grupos"} /> Grupos:
                {Object.entries(TIPO_CREDITO).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" name="grupos" value={k} defaultChecked={e.grupos.includes(k)} /> {v}</label>)}
              </label>
              <label className="flex items-center gap-2"><input type="radio" name="convocatoria" value="personas" defaultChecked={e.convocatoria === "personas"} /> Solo estas personas:</label>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pl-6">
                {elenco.map((g) => <label key={g.user_id} className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs has-[:checked]:border-white"><input type="checkbox" name="personas" value={g.user_id} defaultChecked={e.personas.includes(g.user_id)} /> {g.nombre}</label>)}
              </div>
              <label className="flex items-center gap-2"><input type="radio" name="convocatoria" value="ninguno" defaultChecked={e.convocatoria === "ninguno"} /> Nadie del elenco (solo el equipo)</label>
              <p className="text-xs text-texto-3">El equipo de producción y los encargados se cambian abajo, en «Equipo citado y encargados».</p>
            </fieldset>
            {e.serie_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="toda_serie" /> También el título, lugar, notas y citados en los siguientes de la serie (cada uno conserva su fecha y hora)</label>}
          </ActionForm>
        </div>
      </details>
      {/* 0157: sin asistencia: no hay lista; se puede volver a tomar (o quitar, si aún no hay asistencia). */}
      {e.sin_asistencia ? (
        <div className="flex flex-col gap-3 rounded-[22px] border border-linea bg-telon p-5">
          <p className="font-bold">En este ensayo no se toma asistencia.</p>
          <p className="text-sm text-texto-2">Los citados lo ven en Mi cuenta y en su calendario, pero nadie pasa lista ni cuenta faltas o retardos.</p>
          <ActionForm action={setSinAsistencia} hidden={{ pid: id, rid, valor: "0", serie: e.serie_id ?? "", desde: e.inicia }} submit="Tomar asistencia en este ensayo"
            submitClass="self-start rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala disabled:opacity-60">
            {e.serie_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="toda_serie" /> También en los siguientes de la serie</label>}
          </ActionForm>
        </div>
      ) : (
        <>
          <ListaAsistencia pid={id} rid={rid} ensayo={e} filas={(rows ?? []) as FilaLista[]} puede lider />
          {!e.abierto_at && !((rows ?? []) as FilaLista[]).some((x) => x.estado) && (
            <details className="rounded-[22px] border border-linea bg-telon">
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold">¿En este ensayo no se toma asistencia?</summary>
              <div className="px-5 pb-5">
                <ActionForm action={setSinAsistencia} hidden={{ pid: id, rid, valor: "1", serie: e.serie_id ?? "", desde: e.inicia }} submit="No tomar asistencia"
                  submitClass="self-start rounded-full border border-white/25 px-4 py-2 text-sm font-bold disabled:opacity-60">
                  <p className="text-sm text-texto-2">Sigue en Mi cuenta y en los calendarios de los citados, pero nadie pasa lista ni cuenta faltas o retardos.</p>
                  {e.serie_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="toda_serie" /> También en los siguientes de la serie</label>}
                </ActionForm>
              </div>
            </details>
          )}
        </>
      )}
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
