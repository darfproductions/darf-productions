import type { Metadata } from "next";
import Link from "next/link";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { DIAS, citados, fechaEnsayo, porcentaje, type Rehearsal } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { textoLimite } from "@/lib/request-rules";
import { avisoFaltaHoras } from "@/lib/requests";
import { cancelSeries, createRehearsal, setAvisoHoras, setRehearsalEstado } from "./actions";

export const metadata: Metadata = { title: "Ensayos" };

type Roster = { user_id: string; nombre: string; papeles: string[] };
type Sum = { user_id: string; presentes: number; retardos: number; faltas: number; justificadas: number };

// Calendario de ensayos, a quién se cita y resumen de asistencia por integrante.
export default async function Ensayos({ params }: PageProps<"/panel/producciones/[id]/ensayos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/ensayos`);
  if (!can(access, id, "ensayos.gestionar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ data: reh }, { data: roster }, { data: sum }, horas, { count: porRevisar }] = await Promise.all([
    supabase.from("rehearsals").select("*").eq("production_id", id).order("inicia"),
    supabase.rpc("cast_roster", { pid: id }),
    supabase.rpc("attendance_summary", { pid: id }),
    avisoFaltaHoras(id),
    supabase.from("member_requests").select("id", { count: "exact", head: true }).eq("production_id", id).eq("tipo", "falta").eq("estado", "pendiente"),
  ]);
  const ensayos = (reh ?? []) as Rehearsal[];
  const gente = (roster ?? []) as Roster[];
  const ahora = new Date().toISOString();
  const proximos = ensayos.filter((r) => r.inicia >= ahora.slice(0, 10));
  const pasados = ensayos.filter((r) => r.inicia < ahora.slice(0, 10)).reverse();
  const sumDe = (u: string) => ((sum ?? []) as Sum[]).find((s) => s.user_id === u);
  const h = { pid: id };

  const Item = ({ r }: { r: Rehearsal }) => (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2.5 text-sm ${r.estado === "cancelado" ? "opacity-60" : ""}`}>
      <span>
        <Link href={`/panel/producciones/${id}/ensayos/${r.id}`} className="font-bold hover:underline">{r.titulo}</Link>
        {r.estado === "cancelado" && <span className="ml-2 text-xs font-bold text-[#fecdd3]">Cancelado</span>}
        <span className="block capitalize text-texto-2">{fechaEnsayo(r.inicia, r.termina)}{r.lugar ? ` · ${r.lugar}` : ""}</span>
        <span className="block text-xs text-texto-3">Citados: {citados(r)}{r.serie_id ? " · se repite" : ""}</span>
      </span>
      <span className="flex items-center gap-2">
        <Link href={`/panel/producciones/${id}/ensayos/${r.id}`} className="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala">Asistencia</Link>
        <ActionForm inline action={setRehearsalEstado} hidden={{ ...h, id: r.id, estado: r.estado === "cancelado" ? "programado" : "cancelado" }}
          confirm={r.estado === "cancelado" ? "¿Reactivar este ensayo?" : "¿Cancelar este ensayo? Los citados lo verán cancelado."}
          submit={r.estado === "cancelado" ? "Reactivar" : "Cancelar"} submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
        {r.serie_id && r.estado !== "cancelado" && r.inicia >= ahora && (
          <ActionForm inline action={cancelSeries} hidden={{ ...h, serie: r.serie_id, desde: r.inicia }}
            confirm="¿Cancelar este ensayo y todos los siguientes de la serie?" submit="Cancelar serie" submitClass="rounded-full border border-[#ff8fa3]/50 px-3 py-1.5 text-xs font-bold text-[#ff8fa3]" />
        )}
      </span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Próximos ensayos</h2>
        <ul className="flex flex-col gap-2">{proximos.map((r) => <Item key={r.id} r={r} />)}</ul>
        {proximos.length === 0 && <p className="text-sm text-texto-3">No hay ensayos próximos.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-bold">+ Agregar ensayo</summary>
          <div className="mt-3">
            <ActionForm action={createRehearsal} hidden={h} submit="Agregar ensayo">
              <div className="grid gap-2 sm:grid-cols-4">
                <input className={`${input} sm:col-span-2`} name="titulo" placeholder="Ej. Coreografía acto 1" />
                <input className={input} name="lugar" placeholder="Lugar" />
                <input className={input} type="date" name="fecha" required aria-label="Fecha" />
                <label className="flex flex-col gap-1 text-xs font-semibold">Empieza<input className={input} type="time" name="hora" required /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">Termina (opcional)<input className={input} type="time" name="fin" /></label>
                <textarea className={`${input} min-h-16 sm:col-span-2`} name="notas" placeholder="Notas: qué traer, escenas que se verán…" />
              </div>
              <fieldset className="flex flex-col gap-2 rounded-xl border border-white/10 p-3 text-sm">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="repetir" /> Repetir (se crean solos)</label>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map((d, i) => <label key={d} className="flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-1 text-xs has-[:checked]:border-white"><input type="checkbox" name="dias" value={i} /> {d}</label>)}
                </div>
                <label className="flex flex-wrap items-center gap-2 text-xs font-semibold">Desde la fecha de arriba hasta el <input className={`${input} py-1.5`} type="date" name="hasta" /></label>
                <p className="text-xs text-texto-3">Ejemplo: todos los sábados de 9:00 a 14:00 del 1 de noviembre al 28 de febrero. Máximo 120 ensayos por serie.</p>
              </fieldset>
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-semibold">¿A quién se cita?</legend>
                <label className="flex items-center gap-2"><input type="radio" name="convocatoria" value="todos" defaultChecked /> Todo el elenco</label>
                <label className="flex flex-wrap items-center gap-2"><input type="radio" name="convocatoria" value="grupos" /> Grupos:
                  {Object.entries(TIPO_CREDITO).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" name="grupos" value={k} /> {v}</label>)}
                </label>
                <label className="flex items-center gap-2"><input type="radio" name="convocatoria" value="personas" /> Solo estas personas:</label>
                <div className="ml-6 flex flex-wrap gap-2">
                  {gente.map((g) => (
                    <label key={g.user_id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs has-[:checked]:border-white">
                      <input type="checkbox" name="personas" value={g.user_id} /> {g.nombre}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </div>
        </details>
      </Card>

      {!!porRevisar && (
        <Link href={`/panel/producciones/${id}/solicitudes`} className="flex items-center justify-between gap-3 rounded-[18px] border border-aviso/40 bg-telon px-5 py-3 text-sm hover:bg-telon-2">
          <b className="text-aviso">{porRevisar} {porRevisar === 1 ? "solicitud" : "solicitudes"} de falta por revisar</b>
          <span className="text-violeta-claro">→</span>
        </Link>
      )}

      {gente.length > 0 && (
        <details className="overflow-x-auto rounded-[22px] border border-linea bg-telon">
          <summary className="cursor-pointer px-5 py-4 font-bold">Asistencia por integrante</summary>
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
              <tr>{["Integrante", "Asistencia", "Presente", "Retardos", "Faltas", "Justificadas"].map((t) => <th key={t} className="px-4 py-2">{t}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {gente.map((g) => {
                const s = sumDe(g.user_id) ?? { presentes: 0, retardos: 0, faltas: 0, justificadas: 0 };
                const pct = porcentaje(s);
                return (
                  <tr key={g.user_id}>
                    <td className="px-4 py-2.5"><b>{g.nombre}</b><span className="block text-xs text-texto-3">{g.papeles.join(", ")}</span></td>
                    <td className="px-4 py-2.5 font-bold">{pct === null ? "—" : `${pct}%`}</td>
                    <td className="px-4 py-2.5">{s.presentes}</td><td className="px-4 py-2.5">{s.retardos}</td>
                    <td className="px-4 py-2.5">{s.faltas}</td><td className="px-4 py-2.5">{s.justificadas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      {pasados.length > 0 && (
        <details className="rounded-[22px] border border-linea bg-telon">
          <summary className="cursor-pointer px-5 py-4 font-bold">Ensayos pasados ({pasados.length})</summary>
          <ul className="flex flex-col gap-2 px-5 pb-5">{pasados.map((r) => <Item key={r.id} r={r} />)}</ul>
        </details>
      )}

      <AjustesSeccion resumen="Faltas con aviso">
        <h3 className="font-bold">Faltas con aviso</h3>
        <p className="text-sm text-texto-2">El elenco pide sus faltas desde su portal. Si las apruebas, el ensayo queda como <b>justificada</b> sola. Hoy se pueden pedir hasta <b>{textoLimite(horas)}</b>.</p>
        <ActionForm inline action={setAvisoHoras} hidden={h} submit="Guardar" submitClass="rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala">
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Se piden hasta
            <select name="horas" defaultValue={String(horas)} className={`${input} py-2`}>
              {[0, 6, 12, 24, 48, 72, 168].map((x) => <option key={x} value={x}>{textoLimite(x)}</option>)}
            </select>
          </label>
        </ActionForm>
      </AjustesSeccion>
    </div>
  );
}
