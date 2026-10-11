import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import {
  SEMAFORO, adeudo, docsPendientes, edad, estadoCuotas, pesos, semaforo,
  type DocType, type Fee, type FeeTerms, type MemberDoc, type MemberFile, type PersonFile,
} from "@/lib/member-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addBasicDocs, addDocType, removeDocType, saveDiscipline, saveFee } from "./actions";

export const metadata: Metadata = { title: "Expedientes" };

type Roster = { user_id: string; nombre: string; email: string; papeles: string[]; tipos: string[] };
type Disc = { user_id: string; advertencias: number; limite: number; requiere_decision: boolean };
const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";
const NONE = ["00000000-0000-0000-0000-000000000000"];

function aQuien(t: DocType, gente: Roster[]): string {
  if (t.aplica === "menores" || (t.aplica === "todos" && t.solo_menores)) return "solo menores";
  if (t.aplica === "grupo") return `grupo: ${TIPO_CREDITO[t.grupo ?? ""] ?? t.grupo}`;
  if (t.aplica === "personas") return `solo: ${t.personas.map((u) => gente.find((g) => g.user_id === u)?.nombre ?? "—").join(", ")}`;
  return "todos";
}

// Expedientes del elenco: semáforo, advertencias, documentos que se piden y mensualidad.
export default async function Expedientes({ params }: PageProps<"/panel/producciones/[id]/expedientes">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes`);
  const verExp = can(access, id, "expedientes.ver");
  const verCuotas = can(access, id, "mensualidades.gestionar");
  const verDisc = verExp || can(access, id, "ensayos.gestionar") || can(access, id, "elenco.gestionar");
  if (!verExp && !verCuotas) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  // Advertencias automáticas por mensualidad (no se repiten).
  if (verDisc || verCuotas) await supabase.rpc("discipline_scan_fees", { pid: id });
  const { data: rosterData } = await supabase.rpc("cast_roster", { pid: id });
  const gente = (rosterData ?? []) as Roster[];
  const uids = gente.length ? gente.map((g) => g.user_id) : NONE;
  const [persons, members, tipos, docs, fee, pagos, terms, disc, cfg] = await Promise.all([
    verExp ? supabase.from("person_files").select("*").in("user_id", uids) : Promise.resolve({ data: [] }),
    verExp ? supabase.from("member_files").select("user_id, revisado_at, confirmado_at").eq("production_id", id) : Promise.resolve({ data: [] }),
    supabase.from("member_doc_types").select("id, nombre, solo_menores, obligatorio, aplica, grupo, personas, descripcion").eq("production_id", id).order("orden"),
    verExp ? supabase.from("member_docs").select("user_id, doc_type_id, archivo_path, subido_at, entregado_at").eq("production_id", id) : Promise.resolve({ data: [] }),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite").eq("production_id", id).maybeSingle(),
    verCuotas ? supabase.from("member_payments").select("user_id, periodo, monto").eq("production_id", id) : Promise.resolve({ data: [] }),
    verCuotas ? supabase.from("member_fee_terms").select("user_id, beca, cuota_especial").eq("production_id", id) : Promise.resolve({ data: [] }),
    verDisc || verCuotas ? supabase.rpc("discipline_summary", { pid: id }) : Promise.resolve({ data: [] }),
    supabase.from("production_discipline").select("*").eq("production_id", id).maybeSingle(),
  ]);
  const tiposDoc = (tipos.data ?? []) as DocType[];
  const cuota = fee.data as Fee | null;
  const personDe = (u: string) => ((persons.data ?? []) as (PersonFile & { user_id: string })[]).find((f) => f.user_id === u) ?? null;
  const memberDe = (u: string) => ((members.data ?? []) as (MemberFile & { user_id: string })[]).find((f) => f.user_id === u) ?? null;
  const docsDe = (u: string) => ((docs.data ?? []) as (MemberDoc & { user_id: string })[]).filter((d) => d.user_id === u);
  const termsDe = (u: string): FeeTerms => ((terms.data ?? []) as (FeeTerms & { user_id: string })[]).find((t) => t.user_id === u) ?? { beca: false, cuota_especial: null };
  const pagosDe = (u: string) => ((pagos.data ?? []) as { user_id: string; periodo: string; monto: number }[]).filter((p) => p.user_id === u);
  const discDe = (u: string) => ((disc.data ?? []) as Disc[]).find((d) => d.user_id === u);
  const reglas = cfg.data as { limite_advertencias: number; auto_mensualidad_meses: number | null; auto_retardos: number | null; auto_faltas: number | null } | null;
  const porDecidir = gente.filter((g) => discDe(g.user_id)?.requiere_decision);
  const h = { pid: id };

  return (
    <div className="flex flex-col gap-4">
      {porDecidir.length > 0 && (
        <Card className="border border-[#ff8fa3]/40">
          <h2 className="font-bold text-[#ff8fa3]">Requiere decisión</h2>
          <p className="text-sm text-texto-2">Llegaron al límite de advertencias. Abre su expediente y registra la medida (plática, aviso a papás, suspensión o baja).</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {porDecidir.map((g) => <li key={g.user_id}><Link href={`/panel/producciones/${id}/expedientes/${g.user_id}`} className="rounded-full bg-[#5a1a22] px-3 py-1 font-bold text-[#fecdd3]">{g.nombre}</Link></li>)}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
            <tr>
              <th className="px-4 py-3">Integrante</th>
              {verExp && <th className="px-4 py-3">Expediente</th>}
              {verExp && <th className="px-4 py-3">Documentos</th>}
              {(verDisc || verCuotas) && <th className="px-4 py-3">Advertencias</th>}
              {verCuotas && cuota && <th className="px-4 py-3">Mensualidad</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {gente.map((g) => {
              const p = personDe(g.user_id);
              const e = edad(p?.fecha_nacimiento ?? null);
              const pend = docsPendientes(tiposDoc, docsDe(g.user_id), { uid: g.user_id, esMenor: e !== null && e < 18, tipos: g.tipos });
              const sem = semaforo(p, pend.length, memberDe(g.user_id));
              const debe = cuota ? adeudo(estadoCuotas(cuota, termsDe(g.user_id), pagosDe(g.user_id))) : 0;
              const d = discDe(g.user_id);
              return (
                <tr key={g.user_id}>
                  <td className="px-4 py-3">
                    <Link href={`/panel/producciones/${id}/expedientes/${g.user_id}`} className="font-bold hover:underline">{g.nombre}</Link>
                    <p className="text-xs text-texto-3">{g.papeles.join(", ") || "—"}{e !== null && e < 18 ? " · menor" : ""}</p>
                  </td>
                  {verExp && <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEMAFORO[sem].cls}`}>{SEMAFORO[sem].label}</span></td>}
                  {verExp && <td className="px-4 py-3 text-xs">{pend.length ? `Faltan ${pend.length}` : "Completos"}</td>}
                  {(verDisc || verCuotas) && <td className="px-4 py-3 text-xs">{d ? <span className={d.advertencias >= d.limite ? "font-bold text-[#fecdd3]" : ""}>{d.advertencias} de {d.limite}</span> : "—"}</td>}
                  {verCuotas && cuota && <td className="px-4 py-3 text-xs">{termsDe(g.user_id).beca ? "Beca" : debe ? <b className="text-[#fecdd3]">Debe {pesos(debe)}</b> : "Al corriente"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {gente.length === 0 && <p className="px-5 py-4 text-texto-2">Aún no hay integrantes. Entran al aceptar una oferta (Elenco y equipos).</p>}
      </Card>

      {verExp && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Documentos que se piden</h2>
          <ul className="flex flex-col gap-2">
            {tiposDoc.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                <span><b>{t.nombre}</b> <span className="text-texto-3">· {aQuien(t, gente)}{t.obligatorio ? "" : " · opcional"}</span>
                  {t.descripcion && <span className="block text-xs text-texto-3">{t.descripcion}</span>}</span>
                <ActionForm inline action={removeDocType} hidden={{ ...h, id: t.id }} confirm={`¿Quitar “${t.nombre}” de la lista? Se quita también el registro de quién ya lo entregó.`} submit="Quitar" submitClass={ghost} />
              </li>
            ))}
          </ul>
          {tiposDoc.length === 0 && <ActionForm inline action={addBasicDocs} hidden={h} submit="Agregar la lista básica (reglamento, permiso de menores, identificación)" submitClass={ghost} />}
          <details>
            <summary className="cursor-pointer text-sm font-bold">+ Documento personalizado (por ejemplo, responsiva de aéreo)</summary>
            <div className="mt-3">
              <ActionForm action={addDocType} hidden={h} submit="Agregar documento">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={input} name="nombre" required placeholder="Ej. Responsiva de aéreo (aro y telas)" />
                  <input className={input} name="descripcion" placeholder="Instrucciones (opcional): fírmala tu tutor y súbela" />
                </div>
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="mb-1 font-semibold">¿Quién lo tiene que entregar?</legend>
                  <label className="flex items-center gap-2"><input type="radio" name="aplica" value="todos" defaultChecked /> Todo el elenco</label>
                  <label className="flex items-center gap-2"><input type="radio" name="aplica" value="menores" /> Solo menores de edad</label>
                  <label className="flex flex-wrap items-center gap-2"><input type="radio" name="aplica" value="grupo" /> Un grupo:
                    <select className={`${input} py-1.5 text-sm`} name="grupo" defaultValue="">
                      <option value="">Elige…</option>
                      {Object.entries(TIPO_CREDITO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2"><input type="radio" name="aplica" value="personas" /> Solo estas personas:</label>
                  <div className="ml-6 flex flex-wrap gap-2">
                    {gente.map((g) => (
                      <label key={g.user_id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs has-[:checked]:border-white">
                        <input type="checkbox" name="personas" value={g.user_id} /> {g.nombre}
                      </label>
                    ))}
                    {gente.length === 0 && <span className="text-xs text-texto-3">Aún no hay integrantes.</span>}
                  </div>
                  <label className="flex items-center gap-2"><input type="checkbox" name="opcional" /> Opcional</label>
                </fieldset>
              </ActionForm>
            </div>
          </details>
        </Card>
      )}

      {verDisc && (
        <Card>
          <h2 className="titular mb-1 text-xl">Advertencias</h2>
          <p className="mb-3 text-sm text-texto-2">Al llegar al límite, la persona aparece en “Requiere decisión”. Las automáticas se crean solas (retardos y faltas, cuando haya asistencia de ensayos).</p>
          <ActionForm action={saveDiscipline} hidden={h} submit="Guardar reglas">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-semibold">Límite de advertencias<input className={`${input} w-28`} type="number" min={1} max={20} name="limite" defaultValue={reglas?.limite_advertencias ?? 3} /></label>
              <div className="flex flex-col gap-2">
                {([
                  ["meses", "Mensualidad: 1 advertencia por cada", "meses vencidos", reglas ? reglas.auto_mensualidad_meses : 2],
                  ["retardos", "Retardos: 1 advertencia por cada", "retardos", reglas ? reglas.auto_retardos : 3],
                  ["faltas", "Faltas sin justificar: 1 advertencia por cada", "faltas", reglas ? reglas.auto_faltas : 2],
                ] as const).map(([k, a, b, v]) => (
                  <label key={k} className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" name={`${k}_on`} defaultChecked={v !== null} /> {a}
                    <input className={`${input} w-16 py-1`} type="number" min={1} max={20} name={k} defaultValue={v ?? ""} /> {b}
                  </label>
                ))}
              </div>
            </div>
          </ActionForm>
        </Card>
      )}

      {verCuotas && (
        <Card>
          <h2 className="titular mb-1 text-xl">Mensualidad</h2>
          <p className="mb-3 text-sm text-texto-2">Monto por mes y de qué mes a qué mes se cobra. La beca o un monto especial se ponen en el expediente de cada persona.</p>
          <ActionForm action={saveFee} hidden={h} submit="Guardar mensualidad">
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold">Monto por mes (MXN)<input className={input} type="number" min={0} step="1" name="monto" required defaultValue={cuota?.monto ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Primer mes<input className={input} type="month" name="desde" required defaultValue={cuota?.desde.slice(0, 7) ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Último mes<input className={input} type="month" name="hasta" required defaultValue={cuota?.hasta.slice(0, 7) ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Pagar antes del día<input className={input} type="number" min={1} max={28} name="dia_limite" defaultValue={cuota?.dia_limite ?? 10} /></label>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
