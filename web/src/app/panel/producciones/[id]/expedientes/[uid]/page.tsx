import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DocUpload } from "@/components/DocUpload";
import { ExpedienteForm } from "@/components/ExpedienteForm";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import {
  MEDIDA, MES_LABEL, NIVEL_INCIDENCIA, SEMAFORO, TIPO_INCIDENCIA, adeudo, cuentaAdvertencias, docAplica, docsPendientes, edad,
  estadoCuotas, mesNombre, pendientesTexto, pesos, semaforo,
} from "@/lib/member-rules";
import { getMemberData, signDocs } from "@/lib/members";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { porcentaje } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { addIncident, addMeasure, addPayment, markReviewed, removePayment, setDelivered, setScholarship, voidIncident } from "../actions";

export const metadata: Metadata = { title: "Expediente" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";
const METODOS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", otro: "Otro" };

// Expediente de un integrante en esta obra: datos (únicos de la persona; aquí se revisan),
// documentos (entregado), incidencias y advertencias, y mensualidades (pagos).
export default async function MemberPage({ params }: PageProps<"/panel/producciones/[id]/expedientes/[uid]">) {
  const { id, uid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes/${uid}`);
  const verExp = can(access, id, "expedientes.ver");
  const verCuotas = can(access, id, "mensualidades.gestionar");
  const verDisc = verExp || can(access, id, "ensayos.gestionar") || can(access, id, "elenco.gestionar");
  if (!verExp && !verCuotas) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data: roster } = await supabase.rpc("cast_roster", { pid: id });
  const persona = ((roster ?? []) as { user_id: string; nombre: string; email: string; papeles: string[]; tipos: string[] }[]).find((r) => r.user_id === uid);
  if (!persona) notFound();
  const [d, sumRes] = await Promise.all([
    getMemberData(id, uid),
    verExp || can(access, id, "ensayos.gestionar") ? supabase.rpc("attendance_summary", { pid: id }) : Promise.resolve({ data: [] }),
  ]);
  const asis = ((sumRes.data ?? []) as { user_id: string; presentes: number; retardos: number; faltas: number; justificadas: number }[]).find((x) => x.user_id === uid);
  const e = edad(d.person?.fecha_nacimiento ?? null);
  const esMenor = e !== null && e < 18;
  const ctx = { uid, esMenor, tipos: persona.tipos };
  const pend = docsPendientes(d.tipos, d.docs, ctx);
  const sem = semaforo(d.person, pend.length, d.member);
  const falta = pendientesTexto(d.person, pend, d.member);
  const nAdv = cuentaAdvertencias(d.incidencias);
  const urls = verExp ? await signDocs(d.docs.map((x) => x.archivo_path)) : new Map<string, string>();
  const ms = d.fee ? estadoCuotas(d.fee, d.terms, d.pagos) : [];
  const h = { pid: id, uid };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/panel/producciones/${id}/expedientes`} className="text-sm font-bold text-violeta-claro">← Expedientes</Link>
        <p className="mt-2 text-xl font-bold">{persona.nombre} <span className="text-sm font-normal text-texto-3">· {persona.email}{e !== null ? ` · ${e} años` : ""}</span></p>
        <p className="text-sm text-texto-2">{persona.papeles.join(", ")} · <Link href={`/panel/talento/${uid}`} className="font-bold text-violeta-claro">Ficha de talento (todo su historial) →</Link></p>
      </div>

      {verExp && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEMAFORO[sem].cls}`}>{SEMAFORO[sem].label}</span>
              {falta.length > 0 && <p className="mt-2 text-sm text-texto-2">Falta: {falta.join(", ")}.</p>}
            </div>
            {d.member && (d.member.revisado_at
              ? <ActionForm inline action={markReviewed} hidden={{ ...h, revisar: "no" }} submit="Quitar “revisado”" submitClass={ghost} />
              : <ActionForm inline action={markReviewed} hidden={{ ...h, revisar: "si" }} submit="Marcar como revisado" submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />)}
          </Card>

          <Card>
            <h2 className="titular mb-3 text-xl">Datos</h2>
            <p className="mb-4 text-sm text-texto-2">Son los datos únicos de la persona (se usan en todas sus obras). Los llena el integrante desde Mi cuenta; aquí puedes corregirlos. Si el integrante cambia algo después, vuelve a “Por revisar”.</p>
            <ExpedienteForm pid={id} uid={uid} f={d.person} esMenor={esMenor} />
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Documentos</h2>
            {d.tipos.length === 0 && <p className="text-sm text-texto-3">Aún no hay lista de documentos (se arma en Expedientes).</p>}
            <ul className="flex flex-col gap-2">
              {d.tipos.filter((t) => docAplica(t, ctx)).map((t) => {
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

      {asis && (
        <Card className="flex flex-wrap items-center gap-4 text-sm">
          <h2 className="titular text-xl">Asistencia a ensayos</h2>
          <span className="text-lg font-black">{porcentaje(asis) ?? "—"}{porcentaje(asis) !== null ? "%" : ""}</span>
          <span>Presente {asis.presentes} · Retardos {asis.retardos} · Faltas {asis.faltas} · Justificadas {asis.justificadas}</span>
        </Card>
      )}

      {verDisc && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Incidencias <span className={`text-base font-normal ${nAdv >= d.limite ? "text-[#fecdd3]" : "text-texto-3"}`}>· {nAdv} de {d.limite} advertencias</span></h2>
          {nAdv >= d.limite && <p className="rounded-lg bg-[#5a1a22]/60 px-3 py-2 text-sm">Llegó al límite. Registra abajo la medida que se tomó.</p>}
          <ul className="flex flex-col gap-2">
            {d.incidencias.map((i) => (
              <li key={i.id} className={`rounded-lg bg-sala px-3 py-2 text-sm ${i.anulada_at ? "opacity-60" : ""}`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${NIVEL_INCIDENCIA[i.nivel]?.cls}`}>{NIVEL_INCIDENCIA[i.nivel]?.label}</span>
                  <b>{TIPO_INCIDENCIA[i.tipo]}</b>
                  <span className="text-xs text-texto-3">{new Date(`${i.fecha}T12:00:00Z`).toLocaleDateString("es-MX")}{i.origen === "auto" ? " · automática" : ""}</span>
                </p>
                <p className="mt-1">{i.descripcion}</p>
                {i.anulada_at
                  ? <p className="mt-1 text-xs text-texto-3">Anulada: {i.anulada_motivo}</p>
                  : (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-violeta-claro">Anular</summary>
                      <div className="mt-2"><ActionForm inline action={voidIncident} hidden={{ ...h, id: i.id }} submit="Anular" submitClass={ghost}>
                        <input className={`${input} py-1.5 text-xs`} name="motivo" required placeholder="¿Por qué se anula?" />
                      </ActionForm></div>
                    </details>
                  )}
              </li>
            ))}
            {d.incidencias.length === 0 && <li className="text-sm text-texto-3">Sin incidencias.</li>}
          </ul>
          <details>
            <summary className="cursor-pointer text-sm font-bold">+ Registrar incidencia</summary>
            <div className="mt-3"><ActionForm action={addIncident} hidden={h} submit="Registrar">
              <div className="grid gap-2 sm:grid-cols-3">
                <select className={input} name="tipo" defaultValue="conducta" aria-label="Tipo">{Object.entries(TIPO_INCIDENCIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select className={input} name="nivel" defaultValue="advertencia" aria-label="Nivel">
                  <option value="nota">Nota interna (no la ve el integrante, no cuenta)</option>
                  <option value="advertencia">Advertencia (cuenta 1)</option>
                  <option value="grave">Grave (cuenta 1)</option>
                </select>
                <input className={input} type="date" name="fecha" aria-label="Fecha" />
                <textarea className={`${input} min-h-16 sm:col-span-3`} name="descripcion" required placeholder="Qué pasó" />
              </div>
            </ActionForm></div>
          </details>
          <h3 className="mt-2 font-bold">Medidas tomadas</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {d.medidas.map((m) => <li key={m.id}><b>{MEDIDA[m.medida]}</b> · {new Date(`${m.fecha}T12:00:00Z`).toLocaleDateString("es-MX")}{m.descripcion ? ` · ${m.descripcion}` : ""}</li>)}
            {d.medidas.length === 0 && <li className="text-texto-3">Ninguna.</li>}
          </ul>
          <ActionForm inline action={addMeasure} hidden={h} submit="Registrar medida" submitClass={ghost}>
            <select className={`${input} py-1.5 text-sm`} name="medida" defaultValue="platica" aria-label="Medida">{Object.entries(MEDIDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className={`${input} py-1.5 text-sm`} name="descripcion" placeholder="Detalle" />
          </ActionForm>
        </Card>
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
