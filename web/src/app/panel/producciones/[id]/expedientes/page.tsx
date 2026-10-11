import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { SEMAFORO, adeudo, docsPendientes, edad, estadoCuotas, pesos, semaforo, type DocType, type Fee, type FeeTerms, type MemberDoc, type MemberFile } from "@/lib/member-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addBasicDocs, addDocType, removeDocType, saveFee } from "./actions";

export const metadata: Metadata = { title: "Expedientes" };

type Roster = { user_id: string; nombre: string; email: string; papeles: string[] };
const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Expedientes del elenco: semáforo de cada integrante, documentos que se piden y mensualidad.
export default async function Expedientes({ params }: PageProps<"/panel/producciones/[id]/expedientes">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes`);
  const verExp = can(access, id, "expedientes.ver");
  const verCuotas = can(access, id, "mensualidades.gestionar");
  if (!verExp && !verCuotas) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [roster, files, tipos, docs, fee, pagos, terms] = await Promise.all([
    supabase.rpc("cast_roster", { pid: id }),
    verExp ? supabase.from("member_files").select("*").eq("production_id", id) : Promise.resolve({ data: [] }),
    supabase.from("member_doc_types").select("id, nombre, solo_menores, obligatorio").eq("production_id", id).order("orden"),
    verExp ? supabase.from("member_docs").select("user_id, doc_type_id, archivo_path, subido_at, entregado_at").eq("production_id", id) : Promise.resolve({ data: [] }),
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite").eq("production_id", id).maybeSingle(),
    verCuotas ? supabase.from("member_payments").select("user_id, periodo, monto").eq("production_id", id) : Promise.resolve({ data: [] }),
    verCuotas ? supabase.from("member_fee_terms").select("user_id, beca, cuota_especial").eq("production_id", id) : Promise.resolve({ data: [] }),
  ]);
  const gente = (roster.data ?? []) as Roster[];
  const tiposDoc = (tipos.data ?? []) as DocType[];
  const cuota = fee.data as Fee | null;
  const fileDe = (uid: string) => ((files.data ?? []) as (MemberFile & { user_id: string })[]).find((f) => f.user_id === uid) ?? null;
  const docsDe = (uid: string) => ((docs.data ?? []) as (MemberDoc & { user_id: string })[]).filter((d) => d.user_id === uid);
  const termsDe = (uid: string): FeeTerms => ((terms.data ?? []) as (FeeTerms & { user_id: string })[]).find((t) => t.user_id === uid) ?? { beca: false, cuota_especial: null };
  const pagosDe = (uid: string) => ((pagos.data ?? []) as { user_id: string; periodo: string; monto: number }[]).filter((p) => p.user_id === uid);
  const h = { pid: id };

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
            <tr>
              <th className="px-4 py-3">Integrante</th>
              {verExp && <th className="px-4 py-3">Expediente</th>}
              {verExp && <th className="px-4 py-3">Documentos</th>}
              {verCuotas && cuota && <th className="px-4 py-3">Mensualidad</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {gente.map((g) => {
              const f = fileDe(g.user_id);
              const e = edad(f?.fecha_nacimiento ?? null);
              const pend = docsPendientes(tiposDoc, docsDe(g.user_id), e !== null && e < 18);
              const sem = semaforo(f, pend.length);
              const debe = cuota ? adeudo(estadoCuotas(cuota, termsDe(g.user_id), pagosDe(g.user_id))) : 0;
              return (
                <tr key={g.user_id}>
                  <td className="px-4 py-3">
                    <Link href={`/panel/producciones/${id}/expedientes/${g.user_id}`} className="font-bold hover:underline">{g.nombre}</Link>
                    <p className="text-xs text-texto-3">{g.papeles.join(", ") || "—"}{e !== null && e < 18 ? " · menor" : ""}</p>
                  </td>
                  {verExp && <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEMAFORO[sem].cls}`}>{SEMAFORO[sem].label}</span></td>}
                  {verExp && <td className="px-4 py-3 text-xs">{pend.length ? `Faltan ${pend.length}` : "Completos"}</td>}
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
                <span><b>{t.nombre}</b>{t.solo_menores ? " · solo menores" : ""}{t.obligatorio ? "" : " · opcional"}</span>
                <ActionForm inline action={removeDocType} hidden={{ ...h, id: t.id }} confirm={`¿Quitar “${t.nombre}” de la lista? Se quita también el registro de quién ya lo entregó.`} submit="Quitar" submitClass={ghost} />
              </li>
            ))}
          </ul>
          {tiposDoc.length === 0 && <ActionForm inline action={addBasicDocs} hidden={h} submit="Agregar la lista básica (reglamento, permiso de menores, identificación)" submitClass={ghost} />}
          <ActionForm action={addDocType} hidden={h} submit="Agregar documento">
            <input className={`${input} max-w-md`} name="nombre" required placeholder="Ej. Carta responsiva" />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="solo_menores" /> Solo para menores de edad</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="opcional" /> Opcional</label>
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
