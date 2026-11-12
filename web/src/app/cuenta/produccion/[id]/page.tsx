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
  INSCRIPCION_LABEL, estadoInscripcion, mesNombre, pendientesTexto, pesos, semaforo, textoVencimiento,
} from "@/lib/member-rules";
import { getMemberData, signDocs } from "@/lib/members";
import { METODOS, conceptoPago } from "@/lib/pago-rules";
import { ASISTENCIA, fechaEnsayo, type Rehearsal } from "@/lib/rehearsal-rules";
import { TIPO_MATERIAL, porCarpeta, signMaterials, type Material } from "@/lib/materials";
import { RequestCard } from "@/components/requests/RequestCard";
import { avisoFaltaHoras, listRequests, toleranciaMin } from "@/lib/requests";
import { horaMx, puedeAvisarFalta, puedeAvisarLlegada, textoLimite, type RequestTipo } from "@/lib/request-rules";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { TIPO_LUGAR, bloquesPortal, etiquetaProximo, hitosPendientes, proximoEvento, textoHito, type Hito } from "@/lib/portal-rules";
import { cancelRequest, confirmarVoy, markRead } from "./actions";
import { RequestForm, type EnsayoOpcion, type EquipoOpcion } from "./RequestForm";
import { createClient } from "@/lib/supabase/server";
import { isoMx, partesMx } from "@/lib/dates";
import { mayus } from "@/lib/dates";
import { MiniAction } from "@/components/panel/MiniAction";
import { AgregarCalendario } from "@/components/AgregarCalendario";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Mi producción" };

type MyProd = { production_id: string; nombre: string; estado: string; papeles: string[]; tipos: string[] };
/** Lo que la base arma para "Mi obra" (obra_portal, 0141). */
type ObraPortal = {
  ficha: { nombre: string; frase: string | null; sinopsis: string | null; temporada: string | null; venue: string | null; duracion: string | null; tipo: string | null; estado: string };
  reparto: { nombre: string; papel: string | null; tipo: string; yo: boolean }[];
  equipo: EquipoOpcion[];
  hitos: Hito[];
  lugares: { tipo: string; nombre: string; direccion: string | null; mapa_url: string | null; notas: string | null }[];
  funciones: { id: string; starts_at: string; venue: string | null; puertas_at: string | null }[];
  preguntas: { id: string; pregunta: string; respuesta: string }[];
};

const tarjeta = "flex flex-col gap-3 rounded-2xl bg-telon p-6";
const titulo = "titular text-2xl";
const sub = "text-xs font-bold uppercase tracking-[0.18em] text-texto-3";
const fechaCorta = (iso: string) => mayus(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));

// Portal del integrante en 6 bloques (0141): Hoy · Mis documentos · Materiales · Avisos · Pedir o avisar · Mi obra.
// Pensado para el celular: lo que sigue hoy arriba, con "Voy / Voy tarde / No puedo ir".
export default async function MyProduction({ params, searchParams }: PageProps<"/cuenta/produccion/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/cuenta/produccion/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_productions");
  const prod = ((data ?? []) as MyProd[]).find((p) => p.production_id === id);
  if (!prod) notFound();
  const [d, reh, asis, solicitudes, horasAviso, obraRes, confRes] = await Promise.all([
    getMemberData(id, session.userId),
    supabase.from("rehearsals").select("*").eq("production_id", id).order("inicia"),
    supabase.from("rehearsal_attendance").select("rehearsal_id, estado, minutos_tarde").eq("user_id", session.userId),
    listRequests(id, { uid: session.userId, limit: 100 }),
    avisoFaltaHoras(id),
    supabase.rpc("obra_portal", { pid: id }),
    supabase.from("rehearsal_confirmations").select("rehearsal_id").eq("user_id", session.userId),
  ]);
  const tolerancia = await toleranciaMin(id);
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
  const obra = (obraRes.data ?? null) as ObraPortal | null;
  const confirmados = new Set(((confRes.data ?? []) as { rehearsal_id: string }[]).map((c) => c.rehearsal_id));
  const mesHoy = partesMx().m;
  const cumples = cumplesDelMes((cumplesRes.data ?? []) as Cumple[], mesHoy);
  const materiales = (mats.data ?? []) as Material[];
  const matUrls = await signMaterials(materiales.map((m) => m.archivo_path));
  const leidos = new Set(((reads.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
  const comunicados = ((anns.data ?? []) as { id: string; titulo: string; cuerpo: string; importante: boolean; created_at: string }[])
    .sort((a, b) => Number(leidos.has(a.id)) - Number(leidos.has(b.id)) || Number(b.importante) - Number(a.importante));
  const ensayos = (reh.data ?? []) as Rehearsal[];
  const hoy = isoMx();
  const ahora = new Date();
  const proximos = ensayos.filter((r) => isoMx(new Date(r.inicia)) >= hoy);
  const pasados = ensayos.filter((r) => isoMx(new Date(r.inicia)) < hoy).reverse();
  const asisDe = (rid: string) => ((asis.data ?? []) as { rehearsal_id: string; estado: string; minutos_tarde: number | null }[]).find((a) => a.rehearsal_id === rid);
  // Solicitud de falta o de llegada tarde vigente (pendiente o aprobada; si no, la última rechazada) de cada ensayo.
  const faltaDe = (rid: string) => {
    const de = solicitudes.filter((q) => (q.tipo === "falta" || q.tipo === "llegada") && q.ensayos.some((x) => x.id === rid));
    return de.find((q) => q.estado === "pendiente" || q.estado === "aprobada") ?? de.find((q) => q.estado === "rechazada") ?? null;
  };
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
  const sinLeer = comunicados.filter((a) => !leidos.has(a.id)).length;
  const solUrls = await signDocs(solicitudes.map((q) => q.archivo_path));
  const tipoInicial = (["falta", "llegada", "documento", "pago", "otro", "mensaje"] as const).find((t) => t === sp.nueva) ?? (typeof sp.falta === "string" ? "falta" : typeof sp.llegada === "string" ? "llegada" : null);
  const cuota = d.fee && d.fee.cobrar !== false && !d.terms.beca ? Number(d.terms.cuota_especial ?? d.fee.monto) : null;
  const activa = !d.alta?.baja_at;
  const conPagos = !!d.fee && d.fee.cobrar !== false;
  const debeHoy = adeudo(ms) + Math.max(0, (insc?.debe ?? 0) - (insc?.pagado ?? 0));
  const prox = proximoEvento(ensayos, ahora);
  const despues = proximos.filter((r) => r.id !== prox?.r.id && r.estado !== "cancelado").slice(0, 3);
  const bloques = bloquesPortal({ sinLeer, pendientes: falta.length });
  const hitos = hitosPendientes(obra?.hitos ?? []);
  const equipo = activa ? (obra?.equipo ?? []) : [];

  // Qué dice el ensayo del Hoy: si ya pedí falta o llegada tarde, o los botones Voy / Voy tarde / No puedo ir.
  function accionesEnsayo(r: Rehearsal, grande: boolean) {
    if (r.estado === "cancelado" || !activa) return null;
    const q = faltaDe(r.id);
    if (q && q.estado !== "rechazada") {
      if (q.tipo === "llegada") {
        const h = q.llegada_hora ? horaMx(q.llegada_hora) : "";
        return <p className="text-sm font-bold text-aviso">{q.estado === "aprobada" ? <><Icono nombre="check" /> Llegada tarde aprobada: tu hora de entrada es las {h}</> : `Avisaste que llegas a las ${h} · esperando respuesta`}</p>;
      }
      return <p className="text-sm font-bold text-aviso">{q.estado === "aprobada" ? <><Icono nombre="check" /> Falta justificada</> : "Avisaste que no vas · esperando respuesta"}</p>;
    }
    const op = opcionesFalta.find((o) => o.id === r.id);
    const empezo = new Date(r.inicia) <= ahora;
    const voy = confirmados.has(r.id);
    const b = grande ? "rounded-full px-5 py-3 text-sm font-bold" : "rounded-full px-4 py-2 text-xs font-bold";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!empezo && (voy
            ? <MiniAction action={confirmarVoy} hidden={{ rid: r.id, pid: id, voy: "0" }} className="flex items-center gap-2" buttonClass={`${b} border border-exito/60 text-exito`} label={<><Icono nombre="check" /> Confirmaste que vas · quitar</>} ariaLabel="Quitar mi confirmación" />
            : <MiniAction action={confirmarVoy} hidden={{ rid: r.id, pid: id, voy: "1" }} className="flex items-center gap-2" buttonClass={`${b} bg-texto text-sala`} label="Voy" ariaLabel={`Voy a ${r.titulo}`} />)}
          {op && puedeAvisarLlegada(r.inicia, ahora) && <Link href={`?llegada=${r.id}#pedir`} scroll={false} className={`${b} border border-white/25 hover:border-white/50`}>Voy tarde</Link>}
          {op?.permitido && <Link href={`?falta=${r.id}#pedir`} scroll={false} className={`${b} border border-white/25 hover:border-white/50`}>{q ? "Volver a pedir falta" : "No puedo ir"}</Link>}
        </div>
        {op && !op.permitido && !empezo && <p className="text-xs text-texto-3">{q ? "Tu solicitud fue rechazada." : `Las faltas se avisan ${textoLimite(horasAviso)}; para este ensayo ya pasó el límite.`}</p>}
      </div>
    );
  }

  return (
    <main className="pb-10 [&_section[aria-labelledby]]:scroll-mt-16">
      <PageHeading eyebrow="Mis producciones" title={prod.nombre}>{prod.papeles.join(" · ")}</PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mi cuenta</Link>

        {d.alta?.baja_at && (
          <section role="status" className="rounded-2xl border border-[#ff8fa3]/40 bg-[#ff8fa3]/10 p-5 text-sm">
            <p className="font-bold">Baja de esta producción desde el {new Date(`${d.alta.baja_at}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}.</p>
            {d.alta.baja_motivo && <p className="mt-1 text-texto-2">Motivo: {d.alta.baja_motivo}</p>}
            <p className="mt-1 text-texto-2">Tu historial (asistencia, pagos y documentos) se conserva aquí.</p>
          </section>
        )}

        <nav aria-label="Secciones" className="sticky top-0 z-10 -mx-5 flex gap-1 overflow-x-auto bg-sala/95 px-5 py-2 text-sm backdrop-blur md:mx-0 md:rounded-full md:px-3">
          {bloques.map((b) => (
            <a key={b.id} href={`#${b.id}`} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-texto-2 hover:bg-telon hover:text-texto">
              {b.label}{b.aviso ? <span className="rounded-full bg-[#be123c] px-1.5 py-0.5 text-[10px] font-bold text-white">{b.aviso}</span> : null}
            </a>
          ))}
        </nav>

        {/* 1. Hoy: lo que sigue, con qué llevar y los tres botones. */}
        <section aria-labelledby="hoy" className={tarjeta}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hoy" className={titulo}>{etiquetaProximo(prox)}</h2>
            {prox && <span className="text-sm text-texto-2">{fechaEnsayo(prox.r.inicia, prox.r.termina)}</span>}
          </div>
          {prox ? (
            <div className="flex flex-col gap-3 rounded-xl bg-sala p-4">
              <p className="text-xl font-bold">{prox.r.titulo}</p>
              <ul className="flex flex-col gap-1 text-sm text-texto-2">
                <li><Icono nombre="reloj" /> {fechaEnsayo(prox.r.inicia, prox.r.termina)}</li>
                {prox.r.lugar && <li><Icono nombre="calendario" /> {prox.r.lugar}</li>}
                {prox.r.notas && <li className="whitespace-pre-line"><Icono nombre="lista" /> {prox.r.notas}</li>}
              </ul>
              {accionesEnsayo(prox.r, true)}
              <AgregarCalendario ics={`/calendario/ensayo/${prox.r.id}`} evento={{ uid: `ensayo-${prox.r.id}`, titulo: `Ensayo: ${prox.r.titulo}`, inicia: prox.r.inicia, termina: prox.r.termina, lugar: prox.r.lugar }} />
            </div>
          ) : <p className="text-sm text-texto-2">No tienes ensayos ni llamados próximos.</p>}
          {despues.length > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Después</p>
              <ul className="flex flex-col gap-1.5">
                {despues.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 rounded-lg bg-sala px-4 py-2.5 text-sm">
                    <p><b>{r.titulo}</b> <span className="text-texto-2">· {fechaCorta(r.inicia)}{r.lugar ? ` · ${r.lugar}` : ""}</span></p>
                    {accionesEnsayo(r, false)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <a href="#avisos" className="rounded-xl bg-sala p-3">
              <p className={sub}>Avisos</p>
              <p className={`text-xl font-black ${sinLeer ? "text-[#ff8fa3]" : ""}`}>{sinLeer} <span className="text-xs font-normal text-texto-2">sin leer</span></p>
            </a>
            <a href="#docs" className="rounded-xl bg-sala p-3">
              <p className={sub}>Expediente</p>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${SEMAFORO[sem].cls}`}>{sem === "verde" ? "Completo" : SEMAFORO[sem].label}</span>
              {falta.length > 0 && <p className="mt-1 text-xs text-texto-2">{falta.length === 1 ? "Falta 1 cosa" : `Faltan ${falta.length} cosas`}</p>}
            </a>
            <a href="#pagos" className="rounded-xl bg-sala p-3">
              <p className={sub}>Pagos</p>
              {!conPagos ? <p className="text-sm text-texto-2">Sin pagos</p>
                : debeHoy > 0 ? <p className="text-lg font-black text-[#ff8fa3]">{pesos(debeHoy)} <span className="text-xs font-normal text-texto-2">pendiente</span></p>
                : <p className="font-bold text-exito">Al corriente</p>}
            </a>
            <a href="#ensayos-todos" className="rounded-xl bg-sala p-3">
              <p className={sub}>Ensayos</p>
              <p className="text-sm"><b>{proximos.filter((r) => r.estado !== "cancelado").length}</b> próximos · <b>{pasados.length}</b> pasados</p>
            </a>
          </div>
          {falta.length > 0 && <p className="text-sm text-texto-2">Te falta: {falta.join(", ")}.</p>}
          {sem === "amarillo" && <p className="text-sm text-texto-2">Tu expediente está completo; la producción lo revisará.</p>}
          {vigentes.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-aviso/40 bg-sala p-4">
              <h3 className="font-bold">Advertencias: {cuentaAdvertencias(vigentes)} de {d.limite}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {vigentes.map((i) => (
                  <li key={i.id}><span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${NIVEL_INCIDENCIA[i.nivel]?.cls}`}>{NIVEL_INCIDENCIA[i.nivel]?.label}</span>
                    {TIPO_INCIDENCIA[i.tipo]} · {new Date(`${i.fecha}T12:00:00Z`).toLocaleDateString("es-MX")} · {i.descripcion}</li>
                ))}
              </ul>
              <p className="text-xs text-texto-3">Si tienes dudas sobre alguna, escríbele a la producción en «Pedir o avisar».</p>
            </div>
          )}
          <details id="ensayos-todos" className="text-sm">
            <summary className="cursor-pointer font-bold">Todos mis ensayos ({proximos.length} próximos · {pasados.length} pasados)</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {proximos.map((r) => (
                <li key={r.id} className={`flex flex-col gap-1 rounded-lg bg-sala px-4 py-2.5 ${r.estado === "cancelado" ? "opacity-60" : ""}`}>
                  <p><b>{r.titulo}</b>{r.estado === "cancelado" && <span className="ml-2 font-bold text-[#fecdd3]">Cancelado</span>} <span className="text-texto-2">· {fechaCorta(r.inicia)}{r.lugar ? ` · ${r.lugar}` : ""}</span></p>
                  {r.notas && <p className="whitespace-pre-line text-texto-2">{r.notas}</p>}
                  {accionesEnsayo(r, false)}
                </li>
              ))}
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
              {ensayos.length === 0 && <li className="text-texto-2">Todavía no hay ensayos programados.</li>}
            </ul>
          </details>
        </section>

        {d.person && !d.member?.confirmado_at && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[#a48bff]/40 bg-telon p-5">
            <p className="font-bold">Ya tenemos tu expediente de otra producción.</p>
            <p className="text-sm text-texto-2">Revisa abajo que tus datos (emergencia, salud y medidas) sigan al día. Si cambió algo, corrígelo y guarda; si todo sigue igual, confírmalo:</p>
            <ConfirmVigente pid={id} uid={session.userId} />
          </section>
        )}

        {/* 2. Mis documentos: expediente, documentos, pagos y evaluaciones. */}
        <section aria-labelledby="docs" className={tarjeta}>
          <h2 id="docs" className={titulo}>Mis documentos{conPagos ? " y pagos" : ""}</h2>
          {misDocs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className={sub}>Documentos</p>
              <p className="text-sm text-texto-2">Puedes subir una foto o PDF. La producción marca cada uno como entregado cuando lo recibe (también puedes entregarlo en papel).</p>
              <ul className="flex flex-col gap-2">
                {misDocs.map((t) => {
                  const doc = d.docs.find((x) => x.doc_type_id === t.id);
                  const url = doc?.archivo_path ? urls.get(doc.archivo_path) : undefined;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2.5 text-sm">
                      <span><b>{t.nombre}</b>{t.obligatorio ? "" : " · opcional"}{t.descripcion && <span className="block text-xs text-texto-2">{t.descripcion}</span>}
                        <span className="block text-xs text-texto-3">{doc?.entregado_at ? <><Icono nombre="check" /> Recibido por la producción</> : doc?.archivo_path ? "Subido, falta que la producción lo revise" : "Pendiente"}
                          {url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">ver</a></>}</span>
                      </span>
                      {!doc?.entregado_at && <DocUpload pid={id} uid={session.userId} docTypeId={t.id} hay={!!doc?.archivo_path} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <details className="rounded-xl bg-sala p-4" open={sem !== "verde"}>
            <summary className="cursor-pointer font-bold">Mi expediente <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${SEMAFORO[sem].cls}`}>{sem === "verde" ? "Completo" : SEMAFORO[sem].label}</span></summary>
            <p className="my-3 text-sm text-texto-2">Solo lo ven la producción y tú. Lo llenas una vez y se usa en todas tus producciones. Sirve para cuidarte en ensayos y funciones, y para tu vestuario.</p>
            <ExpedienteForm pid={id} uid={session.userId} f={d.person} esMenor={esMenor} propio />
          </details>
          {conPagos && d.fee && (
            <div id="pagos" className="flex flex-col gap-3 scroll-mt-16">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={sub}>Pagos</p>
                <a href={`/cuenta/produccion/${id}/estado-de-cuenta`} className="text-sm font-bold text-violeta-claro">Estado de cuenta (PDF) <Icono nombre="flecha-abajo" /></a>
              </div>
              {insc && insc.estado !== "no_aplica" && (
                <p className="flex flex-wrap items-center gap-2 text-sm">Inscripción{insc.debe ? `: ${pesos(insc.debe)}` : ""}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INSCRIPCION_LABEL[insc.estado].cls}`}>{INSCRIPCION_LABEL[insc.estado].label}</span></p>
              )}
              {d.terms.beca ? <p className="text-sm">Tienes beca: no pagas mensualidad.</p> : (
                <p className="text-sm">Mensualidad: <b>{pesos(Number(d.terms.cuota_especial ?? d.fee.monto))}</b> · {textoVencimiento(d.fee)}</p>
              )}
              <p className="text-sm">Adeudo a hoy: <b>{pesos(debeHoy)}</b></p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ms.map((m) => (
                  <li key={m.periodo} className="flex items-center justify-between rounded-lg bg-sala px-3 py-2 text-sm">
                    <span>{mayus(mesNombre(m.periodo))}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MES_LABEL[m.estado].cls}`}>{MES_LABEL[m.estado].label}</span>
                  </li>
                ))}
              </ul>
              {d.pagos.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-bold">Recibos ({d.pagos.length})</summary>
                  <ul className="mt-2 flex flex-col divide-y divide-white/10 rounded-xl bg-sala" aria-label="Mis recibos">
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
                </details>
              )}
              <p className="text-xs text-texto-3">Los pagos los registra la producción. Si ya pagaste, manda tu comprobante en <a href="?nueva=pago#pedir" className="font-bold text-violeta-claro underline">Pedir o avisar</a>; si ves algo que no coincide, mándales un «Tema de pagos».</p>
            </div>
          )}
          {evaluaciones.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className={sub}>Mis evaluaciones</p>
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
            </div>
          )}
        </section>

        {/* 3. Materiales */}
        <section aria-labelledby="materiales" className={tarjeta}>
          <h2 id="materiales" className={titulo}>Materiales</h2>
          {materiales.length === 0 && <p className="text-sm text-texto-2">La producción todavía no sube materiales (partituras, pistas, libretos, videos).</p>}
          {porCarpeta(materiales).map(([carpeta, items]) => (
            <div key={carpeta}>
              {carpeta && <p className={`${sub} mb-1`}>{carpeta}</p>}
              <ul className="flex flex-col gap-1.5">
                {items.map((m) => {
                  const href = m.archivo_path ? matUrls.get(m.archivo_path) : m.url ?? undefined;
                  return (
                    <li key={m.id} className="rounded-lg bg-sala px-3 py-2 text-sm">
                      {href ? <a href={href} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">{m.titulo} <Icono nombre="externo" /></a> : <b>{m.titulo}</b>}
                      <span className="text-texto-3"> · {TIPO_MATERIAL[m.tipo]}</span>
                      {m.descripcion && <span className="block text-xs text-texto-2">{m.descripcion}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {materiales.length > 0 && <p className="text-xs text-texto-3">Son privados: no los compartas fuera de la producción.</p>}
        </section>

        {/* 4. Avisos */}
        <section aria-labelledby="avisos" className={tarjeta}>
          <h2 id="avisos" className={titulo}>Avisos {sinLeer > 0 && <span className="ml-2 rounded-full bg-[#be123c] px-2.5 py-0.5 text-sm text-white">{sinLeer} sin leer</span>}</h2>
          {comunicados.length === 0 && <p className="text-sm text-texto-2">No hay avisos todavía.</p>}
          <ul className="flex flex-col gap-2">
            {comunicados.map((a) => (
              <li key={a.id} className={`rounded-lg px-4 py-3 text-sm ${leidos.has(a.id) ? "bg-sala opacity-75" : a.importante ? "border border-aviso/50 bg-sala" : "border border-white/20 bg-sala"}`}>
                <p className="font-bold">{a.importante && <span className="mr-1 text-aviso"><Icono nombre="punto" /> Importante ·</span>} {a.titulo}</p>
                <p className="text-xs text-texto-3">{new Date(a.created_at).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" })}</p>
                <p className="mt-1 whitespace-pre-line">{a.cuerpo}</p>
                {leidos.has(a.id) ? <p className="mt-1 text-xs text-exito"><Icono nombre="check" /> Leído</p> : (
                  <form action={markRead} className="mt-2"><input type="hidden" name="aid" value={a.id} /><input type="hidden" name="pid" value={id} />
                    <button className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">Enterado</button></form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Pedir o avisar */}
        <section aria-labelledby="pedir" className={`${tarjeta} gap-4`}>
          <div>
            <h2 id="pedir" className={titulo}>Pedir o avisar</h2>
            <p className="mt-1 text-sm text-texto-2">Avisa una falta o que llegarás tarde (le llega al encargado del ensayo), manda documentos o comprobantes de pago, escríbele a alguien del equipo o pide cualquier otra cosa a Producción. Aquí queda el registro y la respuesta.</p>
          </div>
          {activa && (
            <RequestForm key={String(sp.falta ?? sp.llegada ?? sp.nueva ?? "")} pid={id} uid={session.userId} ensayos={opcionesFalta} horas={horasAviso} tolerancia={tolerancia}
              docTipos={misDocs.map((t) => ({ id: t.id, nombre: t.nombre }))} cuota={cuota} equipo={equipo}
              inicial={{ tipo: tipoInicial as RequestTipo | "mensaje" | null, falta: typeof sp.falta === "string" ? sp.falta : typeof sp.llegada === "string" ? sp.llegada : null, para: typeof sp.para === "string" ? sp.para : null }} />
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

        {/* 6. Mi obra */}
        <section aria-labelledby="obra" className={`${tarjeta} gap-5`}>
          <h2 id="obra" className={titulo}>Mi obra</h2>
          {obra?.ficha && (obra.ficha.frase || obra.ficha.sinopsis || obra.ficha.temporada) && (
            <div className="flex flex-col gap-1 text-sm">
              {obra.ficha.frase && <p className="text-lg font-bold">{obra.ficha.frase}</p>}
              {obra.ficha.sinopsis && <p className="whitespace-pre-line text-texto-2">{obra.ficha.sinopsis}</p>}
              <p className="text-texto-3">{[obra.ficha.temporada, obra.ficha.venue, obra.ficha.duracion].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          {(obra?.funciones.length ?? 0) > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Funciones</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {obra!.funciones.map((f) => <li key={f.id} className="rounded-lg bg-sala px-3 py-2"><b>{fechaCorta(f.starts_at)}</b>{f.venue ? ` · ${f.venue}` : ""}{f.puertas_at ? <span className="block text-xs text-texto-3">Puertas: {horaMx(f.puertas_at)}</span> : null}</li>)}
              </ul>
            </div>
          )}
          {hitos.length > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Calendario</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {hitos.map((h, i) => <li key={i} className="rounded-lg bg-sala px-3 py-2"><b>{h.nombre}</b> · {textoHito(h)}{h.notas ? <span className="block text-xs text-texto-2">{h.notas}</span> : null}</li>)}
              </ul>
            </div>
          )}
          {(obra?.lugares.length ?? 0) > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Lugares</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {obra!.lugares.map((l, i) => (
                  <li key={i} className="rounded-lg bg-sala px-3 py-2"><span className="text-xs text-texto-3">{TIPO_LUGAR[l.tipo] ?? l.tipo} · </span><b>{l.nombre}</b>
                    {l.direccion && <span className="block text-texto-2">{l.direccion}</span>}
                    {l.notas && <span className="block text-xs text-texto-2">{l.notas}</span>}
                    {l.mapa_url && <a href={l.mapa_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-violeta-claro">Ver mapa <Icono nombre="externo" /></a>}</li>
                ))}
              </ul>
            </div>
          )}
          {(obra?.equipo.length ?? 0) > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Equipo</p>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {obra!.equipo.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2">
                    <span><b>{m.nombre}</b>{m.puesto && <span className="block text-xs text-texto-2">{m.puesto}</span>}</span>
                    {activa && <Link href={`?nueva=mensaje&para=${m.user_id}#pedir`} scroll={false} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50">Escribir</Link>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(obra?.reparto.length ?? 0) > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Reparto</p>
              <ul className="flex flex-wrap gap-1.5 text-sm">
                {obra!.reparto.map((c, i) => <li key={i} className={`rounded-full px-3 py-1 ${c.yo ? "bg-ciruela/30 font-bold" : "bg-sala"}`}>{c.nombre}{c.papel ? <span className="text-texto-2"> · {c.papel}</span> : <span className="text-texto-3"> · {TIPO_CREDITO[c.tipo] ?? c.tipo}</span>}</li>)}
              </ul>
            </div>
          )}
          {cumples.length > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Cumpleaños de {MESES[mesHoy - 1]}</p>
              <BirthdayList items={cumples} />
            </div>
          )}
          <div>
            <p className={`${sub} mb-1`}>Preguntas frecuentes</p>
            {(obra?.preguntas.length ?? 0) === 0 ? <p className="text-sm text-texto-2">La producción todavía no escribe las respuestas. Si tienes una duda, escríbeles en «Pedir o avisar».</p> : (
              <ul className="flex flex-col gap-1.5">
                {obra!.preguntas.map((q) => (
                  <li key={q.id}>
                    <details className="rounded-lg bg-sala px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-bold">{q.pregunta}</summary>
                      <p className="mt-1 whitespace-pre-line text-texto-2">{q.respuesta}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
