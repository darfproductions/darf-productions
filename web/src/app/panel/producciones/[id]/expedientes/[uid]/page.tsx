import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DocUpload } from "@/components/DocUpload";
import { ExpedienteForm } from "@/components/ExpedienteForm";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { MES_LABEL, SEMAFORO, adeudo, docsPendientes, edad, estadoCuotas, faltantes, mesNombre, pesos, semaforo } from "@/lib/member-rules";
import { getMemberData, signDocs } from "@/lib/members";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { addPayment, markReviewed, removePayment, setDelivered, setScholarship } from "../actions";

export const metadata: Metadata = { title: "Expediente" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";
const METODOS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", otro: "Otro" };

// Expediente de un integrante: datos (revisar), documentos (entregado), mensualidades (pagos).
export default async function MemberPage({ params }: PageProps<"/panel/producciones/[id]/expedientes/[uid]">) {
  const { id, uid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes/${uid}`);
  const verExp = can(access, id, "expedientes.ver");
  const verCuotas = can(access, id, "mensualidades.gestionar");
  if (!verExp && !verCuotas) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data: roster } = await supabase.rpc("cast_roster", { pid: id });
  const persona = ((roster ?? []) as { user_id: string; nombre: string; email: string; papeles: string[] }[]).find((r) => r.user_id === uid);
  if (!persona) notFound();
  const d = await getMemberData(id, uid);
  const e = edad(d.file?.fecha_nacimiento ?? null);
  const esMenor = e !== null && e < 18;
  const pend = docsPendientes(d.tipos, d.docs, esMenor);
  const sem = semaforo(d.file, pend.length);
  const urls = verExp ? await signDocs(d.docs.map((x) => x.archivo_path)) : new Map<string, string>();
  const ms = d.fee ? estadoCuotas(d.fee, d.terms, d.pagos) : [];
  const h = { pid: id, uid };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/panel/producciones/${id}/expedientes`} className="text-sm font-bold text-violeta-claro">← Expedientes</Link>
        <p className="mt-2 text-xl font-bold">{persona.nombre} <span className="text-sm font-normal text-texto-3">· {persona.email}{e !== null ? ` · ${e} años` : ""}</span></p>
        <p className="text-sm text-texto-2">{persona.papeles.join(", ")}</p>
      </div>

      {verExp && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEMAFORO[sem].cls}`}>{SEMAFORO[sem].label}</span>
              {[...faltantes(d.file), ...pend.map((t) => t.nombre)].length > 0 && (
                <p className="mt-2 text-sm text-texto-2">Falta: {[...faltantes(d.file), ...pend.map((t) => t.nombre)].join(", ")}.</p>
              )}
            </div>
            {d.file && (d.file.revisado_at
              ? <ActionForm inline action={markReviewed} hidden={{ ...h, revisar: "no" }} submit="Quitar “revisado”" submitClass={ghost} />
              : <ActionForm inline action={markReviewed} hidden={{ ...h, revisar: "si" }} submit="Marcar como revisado" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />)}
          </Card>

          <Card>
            <h2 className="titular mb-3 text-xl">Datos</h2>
            <p className="mb-4 text-sm text-texto-2">Lo llena el integrante desde Mi cuenta. Aquí puedes corregirlo. Si el integrante cambia algo después, vuelve a “Por revisar”.</p>
            <ExpedienteForm pid={id} uid={uid} f={d.file} esMenor={esMenor} />
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Documentos</h2>
            {d.tipos.length === 0 && <p className="text-sm text-texto-3">Aún no hay lista de documentos (se arma en Expedientes).</p>}
            <ul className="flex flex-col gap-2">
              {d.tipos.filter((t) => !t.solo_menores || esMenor).map((t) => {
                const doc = d.docs.find((x) => x.doc_type_id === t.id);
                const url = doc?.archivo_path ? urls.get(doc.archivo_path) : undefined;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                    <span>
                      <b>{t.nombre}</b>{t.obligatorio ? "" : " · opcional"}
                      <span className="block text-xs text-texto-3">
                        {doc?.entregado_at ? "✓ Entregado" : "Pendiente"}{url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">ver archivo</a></>}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <DocUpload pid={id} uid={uid} docTypeId={t.id} hay={!!doc?.archivo_path} />
                      <ActionForm inline action={setDelivered} hidden={{ ...h, doc: t.id, entregado: doc?.entregado_at ? "no" : "si" }} submit={doc?.entregado_at ? "Marcar pendiente" : "Marcar entregado"} submitClass={ghost} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {verCuotas && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Mensualidades</h2>
          <ActionForm inline action={setScholarship} hidden={h} submit="Guardar" submitClass={ghost}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="beca" defaultChecked={d.terms.beca} /> Beca (no paga)</label>
            <input className={`${input} w-40 py-1.5 text-sm`} type="number" min={0} name="cuota_especial" placeholder="Monto especial" defaultValue={d.terms.cuota_especial ?? ""} aria-label="Monto especial por mes" />
          </ActionForm>
          {!d.fee && <p className="text-sm text-texto-3">Primero define la mensualidad de la obra (en Expedientes).</p>}
          {d.fee && (
            <>
              <p className="text-sm">Adeudo a hoy: <b>{pesos(adeudo(ms))}</b></p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ms.map((m) => (
                  <li key={m.periodo} className="flex items-center justify-between rounded-lg bg-sala px-3 py-2 text-sm">
                    <span className="capitalize">{mesNombre(m.periodo)}<span className="block text-xs text-texto-3">{pesos(m.pagado)} de {pesos(m.debe)}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MES_LABEL[m.estado].cls}`}>{MES_LABEL[m.estado].label}</span>
                  </li>
                ))}
              </ul>
              <ActionForm action={addPayment} hidden={h} submit="Registrar pago">
                <div className="grid gap-2 sm:grid-cols-4">
                  <select className={input} name="periodo" required defaultValue={ms.find((m) => m.estado !== "pagado" && m.estado !== "beca")?.periodo ?? ms[0]?.periodo} aria-label="Mes">
                    {ms.map((m) => <option key={m.periodo} value={m.periodo}>{mesNombre(m.periodo)}</option>)}
                  </select>
                  <input className={input} type="number" min={1} step="1" name="monto" required defaultValue={ms[0]?.debe || ""} placeholder="Monto" aria-label="Monto" />
                  <select className={input} name="metodo" defaultValue="efectivo" aria-label="Método">{Object.entries(METODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input className={input} name="nota" placeholder="Nota (opcional)" />
                </div>
              </ActionForm>
              {d.pagos.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {d.pagos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-1.5">
                      <span><span className="capitalize">{mesNombre(p.periodo)}</span> · {pesos(p.monto)} · {METODOS[p.metodo]}{p.nota ? ` · ${p.nota}` : ""}
                        <span className="block text-xs text-texto-3">Registrado {new Date(p.registrado_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</span></span>
                      <ActionForm inline action={removePayment} hidden={{ ...h, id: p.id }} confirm="¿Quitar este pago? Queda en la Bitácora." submit="Quitar" submitClass={ghost} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
