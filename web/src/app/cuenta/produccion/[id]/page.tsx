import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BirthdayList } from "@/components/BirthdayList";
import { getEvaluations, getRubric, periodExtras } from "@/lib/rubric";
import { asistenciaPct, filasBoleta, promedio } from "@/lib/rubric-rules";
import { DocUpload } from "@/components/DocUpload";
import { cumplesDelMes, MESES, type Cumple } from "@/lib/account-rules";
import { ExpedienteForm } from "@/components/ExpedienteForm";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { ConfirmVigente } from "@/components/ConfirmVigente";
import {
  MES_LABEL, NIVEL_INCIDENCIA, SEMAFORO, TIPO_INCIDENCIA, adeudo, cuentaAdvertencias, docAplica, docsPendientes, edad, estadoCuotas,
  INSCRIPCION_LABEL, estadoInscripcion, mesNombre, pendientesTexto, pesos, semaforo,
} from "@/lib/member-rules";
import { getMemberData, signDocs } from "@/lib/members";
import { METODOS, conceptoPago } from "@/lib/pago-rules";
import { ASISTENCIA, fechaEnsayo, type Rehearsal } from "@/lib/rehearsal-rules";
import { TIPO_MATERIAL, porCarpeta, signMaterials, type Material } from "@/lib/materials";
import { RequestCard } from "@/components/requests/RequestCard";
import { avisoFaltaHoras, listRequests } from "@/lib/requests";
import { puedeAvisarFalta, textoLimite, type RequestTipo } from "@/lib/request-rules";
import { cancelRequest, markRead } from "./actions";
import { RequestForm, type EnsayoOpcion } from "./RequestForm";
import { createClient } from "@/lib/supabase/server";
import { isoMx, partesMx } from "@/lib/dates";
import { mayus } from "@/lib/dates";
import { MiniAction } from "@/components/panel/MiniAction";
import { AgregarCalendario } from "@/components/AgregarCalendario";

export const metadata: Metadata = { title: "Mi producción" };

type MyProd = { production_id: string; nombre: string; estado: string; papeles: string[]; tipos: string[] };

// Portal del integrante (etapa 3E): su expediente, documentos y mensualidades.
// Ensayos, materiales y avisos se suman en los siguientes bloques.
export default async function MyProduction({ params, searchParams }: PageProps<"/cuenta/produccion/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/cuenta/produccion/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_productions");
  const prod = ((data ?? []) as MyProd[]).find((p) => p.production_id === id);
  if (!prod) notFound();
  const [d, reh, asis, solicitudes, horasAviso] = await Promise.all([
    getMemberData(id, session.userId),
    supabase.from("rehearsals").select("*").eq("production_id", id).order("inicia"),
    supabase.from("rehearsal_attendance").select("rehearsal_id, estado, minutos_tarde").eq("user_id", session.userId),
    listRequests(id, { uid: session.userId, limit: 100 }),
    avisoFaltaHoras(id),
  ]);
  const [rub, misEvals] = await Promise.all([getRubric(id), getEvaluations(id, { uid: session.userId })]);
  const evaluaciones = await Promise.all(
    rub.periodos.filter((p) => p.publicado_at && misEvals.some((e) => e.period_id === p.id)).map(async (p) => {
      const ev = misEvals.find((e) => e.period_id === p.id)!;
      const filas = filasBoleta(rub.criterios, rub.niveles, ev.rubric_scores, ev.rubric_shared_scores);
      return { p, ev, filas, extras: await periodExtras(p.id, session.userId) };
    }),
  );
  const [mats, anns, reads, cumplesRes] = await Promise.all([
    supabase.from("materials").select("*").eq("production_id", id).order("carpeta", { nullsFirst: true }).order("titulo"),
    supabase.from("announcements").select("id, titulo, cuerpo, importante, created_at").eq("production_id", id).order("created_at", { ascending: false }),
    supabase.from("announcement_reads").select("announcement_id").eq("user_id", session.userId),
    supabase.rpc("birthdays", { pid: id }),
  ]);
  const mesHoy = partesMx().m;
  const cumples = cumplesDelMes((cumplesRes.data ?? []) as Cumple[], mesHoy);
  const materiales = (mats.data ?? []) as Material[];
  const matUrls = await signMaterials(materiales.map((m) => m.archivo_path));
  const leidos = new Set(((reads.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
  const comunicados = ((anns.data ?? []) as { id: string; titulo: string; cuerpo: string; importante: boolean; created_at: string }[])
    .sort((a, b) => Number(leidos.has(a.id)) - Number(leidos.has(b.id)) || Number(b.importante) - Number(a.importante));
  const ensayos = (reh.data ?? []) as Rehearsal[];
  const hoy = isoMx();
  const proximos = ensayos.filter((r) => isoMx(new Date(r.inicia)) >= hoy);
  const pasados = ensayos.filter((r) => isoMx(new Date(r.inicia)) < hoy).reverse();
  const asisDe = (rid: string) => ((asis.data ?? []) as { rehearsal_id: string; estado: string; minutos_tarde: number | null }[]).find((a) => a.rehearsal_id === rid);
  // Solicitud de falta vigente (pendiente o aprobada; si no, la última rechazada) de cada ensayo.
  const faltaDe = (rid: string) => {
    const de = solicitudes.filter((q) => q.tipo === "falta" && q.ensayos.some((x) => x.id === rid));
    return de.find((q) => q.estado === "pendiente" || q.estado === "aprobada") ?? de.find((q) => q.estado === "rechazada") ?? null;
  };
  const ahora = new Date();
  const opcionesFalta: EnsayoOpcion[] = proximos.filter((r) => r.estado !== "cancelado" && new Date(r.inicia) > ahora).map((r) => {
    const q = faltaDe(r.id);
    return { id: r.id, titulo: r.titulo, inicia: r.inicia, termina: r.termina, permitido: puedeAvisarFalta(r.inicia, horasAviso, ahora), pedida: !!q && q.estado !== "rechazada" };
  });
  const e = edad(d.person?.fecha_nacimiento ?? null);
  const esMenor = e !== null && e < 18;
  const ctx = { uid: session.userId, esMenor, tipos: prod.tipos };
  const misDocs = d.tipos.filter((t) => docAplica(t, ctx));
  const pend = docsPendientes(d.tipos, d.docs, ctx);
  const sem = semaforo(d.person, pend.length, d.member);
  const vigentes = d.incidencias.filter((i) => !i.anulada_at);
  const urls = await signDocs(d.docs.map((x) => x.archivo_path));
  const ms = d.fee ? estadoCuotas(d.fee, d.terms, d.pagos, new Date(), d.alta) : [];
  const insc = d.fee ? estadoInscripcion(d.fee, d.terms, d.pagos) : null;
  const falta = pendientesTexto(d.person, pend, d.member);
  const siguiente = proximos.find((r) => r.estado !== "cancelado") ?? null;
  const sinLeer = comunicados.filter((a) => !leidos.has(a.id)).length;
  const solUrls = await signDocs(solicitudes.map((q) => q.archivo_path));
  const tipoInicial = (["falta", "documento", "pago", "otro"] as const).find((t) => t === sp.nueva) ?? (typeof sp.falta === "string" ? "falta" : null);
  const cuota = d.fee && d.fee.cobrar !== false && !d.terms.beca ? Number(d.terms.cuota_especial ?? d.fee.monto) : null;
  const activa = !d.alta?.baja_at;
  const debeHoy = adeudo(ms) + Math.max(0, (insc?.debe ?? 0) - (insc?.pagado ?? 0));

  return (
    <main className="pb-10 [&_section[aria-labelledby]]:scroll-mt-16">
      <PageHeading eyebrow="Mis producciones" title={prod.nombre}>{prod.papeles.join(" · ")}</PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-violeta-claro">← Mi cuenta</Link>

        {d.alta?.baja_at && (
          <section role="status" className="rounded-2xl border border-[#ff8fa3]/40 bg-[#ff8fa3]/10 p-5 text-sm">
            <p className="font-bold">Baja de esta producción desde el {new Date(`${d.alta.baja_at}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}.</p>
            {d.alta.baja_motivo && <p className="mt-1 text-texto-2">Motivo: {d.alta.baja_motivo}</p>}
            <p className="mt-1 text-texto-2">Tu historial (asistencia, pagos y documentos) se conserva aquí.</p>
          </section>
        )}

        {/* Resumen: lo más importante primero (pensado para el celular). */}
        <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <a href="#ensayos" className="rounded-2xl bg-telon p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">Próximo ensayo</p>
            {siguiente ? <><p className="mt-1 font-bold">{fechaEnsayo(siguiente.inicia)}</p><p className="text-xs text-texto-2">{siguiente.titulo}{siguiente.lugar ? ` · ${siguiente.lugar}` : ""}</p></>
              : <p className="mt-1 text-sm text-texto-2">Sin ensayos próximos</p>}
          </a>
          <a href="#avisos" className="rounded-2xl bg-telon p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">Avisos</p>
            <p className={`mt-1 text-2xl font-black ${sinLeer ? "text-[#ff8fa3]" : ""}`}>{sinLeer}</p>
            <p className="text-xs text-texto-2">sin leer</p>
          </a>
          <a href="#exp" className="rounded-2xl bg-telon p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">Expediente</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${SEMAFORO[sem].cls}`}>{sem === "verde" ? "Completo" : SEMAFORO[sem].label}</span>
            {falta.length > 0 && <p className="mt-1 text-xs text-texto-2">{falta.length === 1 ? "Falta 1 cosa" : `Faltan ${falta.length} cosas`}</p>}
          </a>
          <a href="#cuotas" className="rounded-2xl bg-telon p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">Pagos</p>
            {!d.fee || d.fee.cobrar === false ? <p className="mt-1 text-sm text-texto-2">Sin pagos</p>
              : debeHoy > 0 ? <><p className="mt-1 text-xl font-black text-[#ff8fa3]">{pesos(debeHoy)}</p><p className="text-xs text-texto-2">pendiente a hoy</p></>
              : <p className="mt-1 font-bold text-exito">Al corriente</p>}
          </a>
        </section>
        {falta.length > 0 && <p className="-mt-3 text-sm text-texto-2">Te falta: {falta.join(", ")}.</p>}
        {sem === "amarillo" && <p className="-mt-3 text-sm text-texto-2">Tu expediente está completo; la producción lo revisará.</p>}

        <nav aria-label="Secciones" className="sticky top-0 z-10 -mx-5 flex gap-1 overflow-x-auto bg-sala/95 px-5 py-2 text-sm backdrop-blur md:mx-0 md:rounded-full md:px-3">
          {[["avisos", "Avisos", comunicados.length > 0], ["ensayos", "Ensayos", true], ["solicitudes", "Solicitudes", activa || solicitudes.length > 0], ["materiales", "Materiales", materiales.length > 0],
            ["exp", "Expediente", true], ["docs", "Documentos", misDocs.length > 0], ["cuotas", "Pagos", !!d.fee && d.fee.cobrar !== false]]
            .filter(([, , v]) => v).map(([k, l]) => <a key={k as string} href={`#${k}`} className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-texto-2 hover:bg-telon hover:text-texto">{l}</a>)}
        </nav>

        {d.person && !d.member?.confirmado_at && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[#a48bff]/40 bg-telon p-5">
            <p className="font-bold">Ya tenemos tu expediente de otra producción.</p>
            <p className="text-sm text-texto-2">Revisa abajo que tus datos (emergencia, salud y medidas) sigan al día. Si cambió algo, corrígelo y guarda; si todo sigue igual, confírmalo:</p>
            <ConfirmVigente pid={id} uid={session.userId} />
          </section>
        )}

        {vigentes.length > 0 && (
          <section className="flex flex-col gap-2 rounded-2xl border border-aviso/40 bg-telon p-5">
            <h2 className="font-bold">Advertencias: {cuentaAdvertencias(vigentes)} de {d.limite}</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {vigentes.map((i) => (
                <li key={i.id}><span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${NIVEL_INCIDENCIA[i.nivel]?.cls}`}>{NIVEL_INCIDENCIA[i.nivel]?.label}</span>
                  {TIPO_INCIDENCIA[i.tipo]} · {new Date(`${i.fecha}T12:00:00Z`).toLocaleDateString("es-MX")} · {i.descripcion}</li>
              ))}
            </ul>
            <p className="text-xs text-texto-3">Si tienes dudas sobre alguna, habla con la producción.</p>
          </section>
        )}

        {comunicados.length > 0 && (
          <section aria-labelledby="avisos" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="avisos" className="titular text-2xl">Avisos {comunicados.some((a) => !leidos.has(a.id)) && <span className="ml-2 rounded-full bg-[#be123c] px-2.5 py-0.5 text-sm text-white">{comunicados.filter((a) => !leidos.has(a.id)).length} sin leer</span>}</h2>
            <ul className="flex flex-col gap-2">
              {comunicados.map((a) => (
                <li key={a.id} className={`rounded-lg px-4 py-3 text-sm ${leidos.has(a.id) ? "bg-sala opacity-75" : a.importante ? "border border-aviso/50 bg-sala" : "border border-white/20 bg-sala"}`}>
                  <p className="font-bold">{a.importante && <span className="mr-1 text-aviso">● Importante ·</span>} {a.titulo}</p>
                  <p className="text-xs text-texto-3">{new Date(a.created_at).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" })}</p>
                  <p className="mt-1 whitespace-pre-line">{a.cuerpo}</p>
                  {leidos.has(a.id) ? <p className="mt-1 text-xs text-exito">✓ Leído</p> : (
                    <form action={markRead} className="mt-2"><input type="hidden" name="aid" value={a.id} /><input type="hidden" name="pid" value={id} />
                      <button className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">Enterado</button></form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="ensayos" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
          <h2 id="ensayos" className="titular text-2xl">Mis ensayos</h2>
          {proximos.length === 0 && <p className="text-sm text-texto-2">No tienes ensayos próximos.</p>}
          <ul className="flex flex-col gap-2">
            {proximos.map((r) => (
              <li key={r.id} className={`flex flex-col gap-1 rounded-lg bg-sala px-4 py-3 text-sm ${r.estado === "cancelado" ? "opacity-60" : ""}`}>
                <p><b>{r.titulo}</b>{r.estado === "cancelado" && <span className="ml-2 font-bold text-[#fecdd3]">Cancelado</span>}</p>
                <p className="text-texto-2">{fechaEnsayo(r.inicia, r.termina)}{r.lugar ? ` · ${r.lugar}` : ""}</p>
                {r.notas && <p className="whitespace-pre-line text-texto-2">{r.notas}</p>}
                {r.estado !== "cancelado" && <AgregarCalendario ics={`/calendario/ensayo/${r.id}`} evento={{ uid: `ensayo-${r.id}`, titulo: `Ensayo: ${r.titulo}`, inicia: r.inicia, termina: r.termina, lugar: r.lugar }} />}
                {r.estado !== "cancelado" && activa && (() => {
                  const q = faltaDe(r.id);
                  if (q && q.estado !== "rechazada") {
                    return <p className="text-xs font-bold text-aviso">{q.estado === "aprobada" ? "✓ Falta justificada" : "Falta solicitada · esperando respuesta"}</p>;
                  }
                  const op = opcionesFalta.find((o) => o.id === r.id);
                  return op?.permitido
                    ? <Link href={`?falta=${r.id}#solicitudes`} scroll={false} className="self-start text-sm font-bold text-violeta-claro">{q ? "Tu solicitud fue rechazada · volver a pedir" : "No podré ir · solicitar falta"} →</Link>
                    : <p className="text-xs text-texto-3">{q ? "Tu solicitud fue rechazada." : `Las faltas se avisan ${textoLimite(horasAviso)}; para este ensayo ya pasó el límite.`}</p>;
                })()}
              </li>
            ))}
          </ul>
          {pasados.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-bold">Ensayos pasados ({pasados.length})</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {pasados.map((r) => {
                  const a = asisDe(r.id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-1.5">
                      <span>{r.titulo} · <span className="text-texto-3">{fechaEnsayo(r.inicia)}</span></span>
                      {a ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ASISTENCIA[a.estado]?.cls}`}>{ASISTENCIA[a.estado]?.label}{a.minutos_tarde ? ` · ${a.minutos_tarde} min` : ""}</span>
                        : <span className="text-xs text-texto-3">{r.estado === "cancelado" ? "Cancelado" : "Sin registro"}</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>

        {(activa || solicitudes.length > 0) && (
          <section aria-labelledby="solicitudes" className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
            <div>
              <h2 id="solicitudes" className="titular text-2xl">Solicitudes</h2>
              <p className="mt-1 text-sm text-texto-2">Avisa una falta, manda documentos o comprobantes de pago, o cualquier otra solicitud. La producción la aprueba o la rechaza y aquí queda el registro.</p>
            </div>
            {activa && (
              <RequestForm key={String(sp.falta ?? sp.nueva ?? "")} pid={id} uid={session.userId} ensayos={opcionesFalta} horas={horasAviso}
                docTipos={misDocs.map((t) => ({ id: t.id, nombre: t.nombre }))} cuota={cuota}
                inicial={{ tipo: tipoInicial as RequestTipo | null, falta: typeof sp.falta === "string" ? sp.falta : null }} />
            )}
            <h3 className="mt-2 text-lg font-bold">Mis solicitudes</h3>
            {solicitudes.length === 0 ? <p className="text-sm text-texto-2">Aún no has mandado solicitudes.</p> : (
              <ul className="flex flex-col gap-2">
                {solicitudes.map((q) => (
                  <li key={q.id}>
                    <RequestCard r={q} url={q.archivo_path ? solUrls.get(q.archivo_path) : undefined}>
                      {q.estado === "pendiente" && (
                        <MiniAction action={cancelRequest} hidden={{ id: q.id, pid: id }} confirm="¿Cancelar esta solicitud?" className="flex flex-wrap items-center gap-2 self-start"
                          buttonClass="rounded-full border border-white/25 px-4 py-2 text-xs font-bold hover:border-white/50" label="Cancelar solicitud" />
                      )}
                    </RequestCard>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {evaluaciones.length > 0 && (
          <section aria-labelledby="evaluaciones" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="evaluaciones" className="titular text-2xl">Mis evaluaciones</h2>
            {evaluaciones.map(({ p, ev, filas, extras }) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xl bg-sala p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{p.nombre}{promedio(filas) != null && <span className="font-normal text-texto-2"> · promedio {promedio(filas)}</span>}</p>
                  <a href={`/cuenta/produccion/${id}/boleta/${p.id}`} className="rounded-full border border-white/30 px-4 py-1.5 text-xs font-bold">Descargar boleta (PDF)</a>
                </div>
                <ul className="flex flex-col divide-y divide-white/10 text-sm">
                  {filas.map((f) => (
                    <li key={f.criterio} className="flex justify-between gap-2 py-1.5">
                      <span>{f.criterio}{f.maestros ? <span className="text-xs text-texto-3"> · promedio de {f.maestros} maestros</span> : null}</span>
                      <span className="text-texto-2">{[f.nivel, f.numero != null ? String(f.numero) : null].filter(Boolean).join(" · ") || "—"}</span>
                    </li>
                  ))}
                </ul>
                {extras && (
                  <p className="text-sm text-texto-2">
                    Asistencia: {extras.presentes} de {extras.citados} ensayos · {extras.retardos} retardos · {extras.faltas} faltas
                    {asistenciaPct(extras) != null && ` · ${asistenciaPct(extras)} %`}
                    {extras.incidencias.length > 0 && <span className="block text-aviso">{extras.incidencias.length} llamada(s) de atención en el periodo</span>}
                  </p>
                )}
                {ev.comentario && <p className="whitespace-pre-line text-sm text-texto-2">“{ev.comentario}”</p>}
                {extras?.notas.map((n, i) => <p key={i} className="whitespace-pre-line text-sm text-texto-2"><b>{n.maestro}{n.materias.length ? ` (${n.materias.join(", ")})` : ""}:</b> {n.comentario}</p>)}
              </div>
            ))}
          </section>
        )}

        {cumples.length > 0 && (
          <section aria-labelledby="cumples" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="cumples" className="titular text-2xl">Cumpleaños de {MESES[mesHoy - 1]}</h2>
            <BirthdayList items={cumples} />
          </section>
        )}

        {materiales.length > 0 && (
          <section aria-labelledby="materiales" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="materiales" className="titular text-2xl">Materiales</h2>
            {porCarpeta(materiales).map(([carpeta, items]) => (
              <div key={carpeta}>
                {carpeta && <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{carpeta}</p>}
                <ul className="flex flex-col gap-1.5">
                  {items.map((m) => {
                    const href = m.archivo_path ? matUrls.get(m.archivo_path) : m.url ?? undefined;
                    return (
                      <li key={m.id} className="rounded-lg bg-sala px-3 py-2 text-sm">
                        {href ? <a href={href} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">{m.titulo} ↗</a> : <b>{m.titulo}</b>}
                        <span className="text-texto-3"> · {TIPO_MATERIAL[m.tipo]}</span>
                        {m.descripcion && <span className="block text-xs text-texto-2">{m.descripcion}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="text-xs text-texto-3">Son privados: no los compartas fuera de la producción.</p>
          </section>
        )}

        <section aria-labelledby="exp" className="rounded-2xl bg-telon p-6">
          <h2 id="exp" className="titular mb-1 text-2xl">Mi expediente</h2>
          <p className="mb-5 text-sm text-texto-2">Solo lo ven la producción y tú. Lo llenas una vez y se usa en todas tus producciones. Sirve para cuidarte en ensayos y funciones, y para tu vestuario.</p>
          <ExpedienteForm pid={id} uid={session.userId} f={d.person} esMenor={esMenor} propio />
        </section>

        {misDocs.length > 0 && (
          <section aria-labelledby="docs" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <h2 id="docs" className="titular text-2xl">Documentos</h2>
            <p className="text-sm text-texto-2">Puedes subir una foto o PDF. La producción marca cada uno como entregado cuando lo recibe (también puedes entregarlo en papel).</p>
            <ul className="flex flex-col gap-2">
              {misDocs.map((t) => {
                const doc = d.docs.find((x) => x.doc_type_id === t.id);
                const url = doc?.archivo_path ? urls.get(doc.archivo_path) : undefined;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2.5 text-sm">
                    <span><b>{t.nombre}</b>{t.obligatorio ? "" : " · opcional"}{t.descripcion && <span className="block text-xs text-texto-2">{t.descripcion}</span>}
                      <span className="block text-xs text-texto-3">{doc?.entregado_at ? "✓ Recibido por la producción" : doc?.archivo_path ? "Subido, falta que la producción lo revise" : "Pendiente"}
                        {url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">ver</a></>}</span>
                    </span>
                    {!doc?.entregado_at && <DocUpload pid={id} uid={session.userId} docTypeId={t.id} hay={!!doc?.archivo_path} />}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {d.fee && d.fee.cobrar !== false && (
          <section aria-labelledby="cuotas" className="flex flex-col gap-3 rounded-2xl bg-telon p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="cuotas" className="titular text-2xl">Mis pagos</h2>
              <a href={`/cuenta/produccion/${id}/estado-de-cuenta`} className="text-sm font-bold text-violeta-claro">Estado de cuenta (PDF) ↓</a>
            </div>
            {insc && insc.estado !== "no_aplica" && (
              <p className="flex flex-wrap items-center gap-2 text-sm">Inscripción{insc.debe ? `: ${pesos(insc.debe)}` : ""}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INSCRIPCION_LABEL[insc.estado].cls}`}>{INSCRIPCION_LABEL[insc.estado].label}</span></p>
            )}
            {d.terms.beca ? <p className="text-sm">Tienes beca: no pagas mensualidad.</p> : (
              <p className="text-sm">Mensualidad: <b>{pesos(Number(d.terms.cuota_especial ?? d.fee.monto))}</b> · pagar antes del día {d.fee.dia_limite} de cada mes</p>
            )}
            <p className="text-sm">Adeudo a hoy: <b>{pesos(adeudo(ms) + Math.max(0, (insc?.debe ?? 0) - (insc?.pagado ?? 0)))}</b></p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ms.map((m) => (
                <li key={m.periodo} className="flex items-center justify-between rounded-lg bg-sala px-3 py-2 text-sm">
                  <span>{mayus(mesNombre(m.periodo))}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MES_LABEL[m.estado].cls}`}>{MES_LABEL[m.estado].label}</span>
                </li>
              ))}
            </ul>
            {d.pagos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">Recibos</h3>
                <ul className="flex flex-col divide-y divide-white/10 rounded-xl bg-sala text-sm" aria-label="Mis recibos">
                  {[...d.pagos].reverse().map((p) => (
                    <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${p.anulado_at ? "opacity-70" : ""}`}>
                      <span>
                        <span className="font-mono text-xs text-texto-3">{p.folio}</span>{""}
                        {p.anulado_at && <span className="rounded-full bg-[#5a1a22] px-2 py-0.5 text-[10px] font-bold text-[#fecdd3]">ANULADO</span>}
                        <span className="block"><b className={p.anulado_at ? "line-through" : ""}>{conceptoPago(p)}</b> · {pesos(p.monto)} · {METODOS[p.metodo] ?? p.metodo}</span>
                        <span className="block text-xs text-texto-3">{new Date(p.registrado_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" })}{p.motivo_anulacion ? ` · Motivo: ${p.motivo_anulacion}` : ""}</span>
                      </span>
                      <a href={`/cuenta/produccion/${id}/recibo/${p.id}`} className="rounded-full border border-white/30 px-4 py-1.5 text-xs font-bold">Ver recibo (PDF)</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-texto-3">Los pagos los registra la producción. Si ya pagaste, manda tu comprobante en <a href="?nueva=pago#solicitudes" className="font-bold text-violeta-claro underline">Solicitudes</a>; si ves algo que no coincide, mándales un “Tema de pagos”.</p>
          </section>
        )}
      </div>
    </main>
  );
}
