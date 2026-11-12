import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PanelTitle } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, score } from "@/lib/audition-rules";
import { ESTADO_OFERTA, TIPO_CREDITO } from "@/lib/casting-rules";
import { NIVEL_INCIDENCIA, TIPO_INCIDENCIA, mesNombre, pesos } from "@/lib/member-rules";
import { METODOS } from "@/lib/pago-rules";
import { casa } from "@/lib/panel-nav";
import { estadoDoc, pestanaValida, pestanasFicha, porObra, type PersonaFicha } from "@/lib/persona-rules";
import { requirePanel } from "@/lib/permissions";
import { ASISTENCIA, fechaEnsayo, porcentaje } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { mayus } from "@/lib/dates";
import { Icono } from "@/components/Icono";

import { NombreFicha } from "../NombreFicha";
export const metadata: Metadata = { title: "Ficha de talento" };

type H = {
  nombre: string | null; email: string;
  obras: { production_id: string; obra: string; tipo: string; papel: string | null }[];
  ofertas: { obra: string; tipo: string; papel: string | null; estado: string; fecha: string }[];
  audiciones: {
    id: string; audition_id: string; titulo: string; obra: string | null; fecha: string; estado: string; ronda: number; numero: number | null;
    llego: string | null; entro: string | null; salio: string | null; personajes: string[] | null; promedio: number | null;
    respuestas: { pregunta: string; respuesta: string }[]; videos: { titulo: string; url: string }[];
    /** 0112: entrevista del host. */
    entrevista?: { pregunta: string; respuesta: string }[]; entrevista_extra?: string | null;
  }[];
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
const dia = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const sub = "text-xs font-bold uppercase tracking-[0.18em] text-texto-3";

// Ficha completa de una persona (0141): todo su recorrido en DARF en pestañas (Obras · Documentos · Pagos · Asistencia ·
// Incidencias). Cada pestaña sale solo si quien mira tiene ese permiso en alguna de sus obras; la base filtra por obra.
export default async function TalentPage({ params, searchParams }: PageProps<"/panel/talento/[uid]">) {
  const { uid } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/talento/${uid}`);
  if (!/^[0-9a-f-]{36}$/.test(uid)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { data: altas }, fichaRes] = await Promise.all([
    supabase.rpc("talent_history", { uid }), supabase.rpc("talent_enrollments", { uid }), supabase.rpc("persona_ficha", { uid }),
  ]);
  if (error || !data) notFound();
  const altaDe = (pid: string) => ((altas ?? []) as { production_id: string; ingreso: string; baja_at: string | null; baja_motivo: string | null }[]).find((a) => a.production_id === pid);
  const h = data as H;
  const ficha = (fichaRes.data ?? null) as PersonaFicha | null;
  const pestanas = pestanasFicha(ficha);
  const t = pestanaValida(sp.t, pestanas);
  const { data: compras } = casa(access, "casa.personas") ? await supabase.rpc("talent_purchases", { uid }) : { data: [] };
  const misCompras = (compras ?? []) as { order_code: string; obra: string; funcion: string; estado: string; total: number; boletos: number; asistio: number; created_at: string }[];
  const { data: persona } = await supabase.from("people").select("id, nombre").eq("profile_id", uid).maybeSingle();
  const obrasActivas = (ficha?.obras ?? []).filter((o) => o.integrante && !o.baja_at);
  const docsPend = (ficha?.documentos ?? []).filter((d) => d.obligatorio && !d.entregado_at).length;
  const incVig = (ficha?.incidencias ?? []).filter((i) => !i.anulada_at).length;

  return (
    <>
      <PanelTitle eyebrow="Personas" title={h.nombre ?? h.email}>{h.email}</PanelTitle>
      <div className="flex flex-wrap items-center gap-2">
        {persona && casa(access, "casa.personas") && <NombreFicha id={persona.id as string} nombre={persona.nombre as string} />}
        {persona && <Link href={`/panel/talento/p/${persona.id}/perfil`} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Perfil profesional <Icono nombre="flecha-der" /></Link>}
      </div>

      {ficha && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-telon p-3"><p className={sub}>Obras</p><p className="text-xl font-black">{ficha.obras.length} <span className="text-xs font-normal text-texto-2">· {obrasActivas.length} activas</span></p></div>
          {pestanas.some((p) => p.id === "documentos") && <div className="rounded-xl bg-telon p-3"><p className={sub}>Documentos</p><p className={`text-xl font-black ${docsPend ? "text-aviso" : "text-exito"}`}>{docsPend ? `${docsPend} pendientes` : "Al día"}</p></div>}
          {pestanas.some((p) => p.id === "asistencia") && ficha.asistencia.length > 0 && (() => {
            const s = ficha.asistencia.reduce((a, x) => ({ presentes: a.presentes + x.presentes, retardos: a.retardos + x.retardos, faltas: a.faltas + x.faltas, justificadas: a.justificadas + x.justificadas }), { presentes: 0, retardos: 0, faltas: 0, justificadas: 0 });
            const pct = porcentaje(s);
            return <div className="rounded-xl bg-telon p-3"><p className={sub}>Asistencia</p><p className="text-xl font-black">{pct == null ? "—" : `${pct} %`} <span className="text-xs font-normal text-texto-2">· {s.faltas} faltas</span></p></div>;
          })()}
          {pestanas.some((p) => p.id === "incidencias") && <div className="rounded-xl bg-telon p-3"><p className={sub}>Incidencias</p><p className={`text-xl font-black ${incVig ? "text-aviso" : ""}`}>{incVig}</p></div>}
        </div>
      )}

      <nav aria-label="Pestañas de la ficha" className="flex flex-wrap gap-2 text-sm">
        {pestanas.map((p) => (
          <Link key={p.id} href={`/panel/talento/${uid}${p.id === "obras" ? "" : `?t=${p.id}`}`} aria-current={t === p.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 font-semibold ${t === p.id ? "border-texto bg-texto text-sala" : "border-white/20 hover:border-white/50"}`}>{p.label}</Link>
        ))}
      </nav>

      {t === "obras" && (
        <>
          <Card>
            <h2 className="titular mb-3 text-xl">Obras ({h.obras.length})</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {h.obras.map((o, i) => (
                <li key={i}><b>{o.obra}</b> · {TIPO_CREDITO[o.tipo] ?? o.tipo}{o.papel ? ` · ${o.papel}` : ""}
                  {altaDe(o.production_id)?.baja_at && <span className="ml-2 text-xs font-bold text-[#fecdd3]">Baja el {new Date(`${altaDe(o.production_id)!.baja_at}T12:00:00Z`).toLocaleDateString("es-MX")}: {altaDe(o.production_id)!.baja_motivo}</span>}
                  {casa(access, "casa.personas") && <> · <Link href={`/panel/producciones/${o.production_id}/expedientes/${uid}`} className="text-violeta-claro">expediente</Link></>}</li>
              ))}
              {h.obras.length === 0 && <li className="text-texto-3">Aún sin obras.</li>}
            </ul>
            {ficha && ficha.obras.some((o) => !o.integrante) && (
              <p className="mt-3 text-sm text-texto-2">En el equipo de: {ficha.obras.filter((o) => !o.integrante).map((o) => `${o.obra} (${o.rol})`).join(", ")}.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="titular text-xl">Audiciones ({h.audiciones.length})</h2>
            {h.audiciones.map((a) => (
              <details key={a.id} className="rounded-lg bg-sala px-4 py-3 text-sm">
                <summary className="cursor-pointer">
                  <b>{a.titulo}</b> <span className="text-texto-3">· {a.obra ?? "Convocatoria general"} · {fecha(a.fecha)}</span>{" "}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_SOLICITUD[a.estado]?.cls}`}>{ESTADO_SOLICITUD[a.estado]?.label}</span>
                  {a.promedio !== null && <span className="ml-2">Promedio <b>{score(a.promedio)}</b></span>}
                </summary>
                <div className="mt-2 flex flex-col gap-1.5">
                  {a.personajes && <p>Personajes: {a.personajes.join(", ")}</p>}
                  {a.numero && <p>Nº {a.numero}{a.ronda > 1 ? ` · llegó a callback ${a.ronda - 1}` : ""}</p>}
                  {a.respuestas.map((r, i) => (
                    <p key={i} className="break-words"><span className="text-texto-3">{r.pregunta}:</span>{" "}
                      {/^https:\/\//.test(r.respuesta) ? <a href={r.respuesta} target="_blank" rel="noreferrer" className="text-violeta-claro underline">abrir enlace</a> : r.respuesta}</p>
                  ))}
                  {((a.entrevista ?? []).length > 0 || a.entrevista_extra) && (
                    <div className="rounded-lg bg-sala px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-texto-3">Entrevista</p>
                      {(a.entrevista ?? []).map((r, i) => <p key={i} className="break-words"><span className="text-texto-3">{r.pregunta}:</span> {r.respuesta}</p>)}
                      {a.entrevista_extra && <p className="break-words"><span className="text-texto-3">Adicional:</span> {a.entrevista_extra}</p>}
                    </div>
                  )}
                  {a.videos.map((v, i) => <a key={i} href={v.url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">{v.titulo} <Icono nombre="externo" /></a>)}
                  <Link href={`/panel/audiciones/${a.audition_id}/aspirante/${a.id}`} className="text-xs font-bold text-violeta-claro">Abrir en la audición <Icono nombre="flecha-der" /></Link>
                </div>
              </details>
            ))}
            {h.audiciones.length === 0 && <p className="text-sm text-texto-3">Sin audiciones registradas con su cuenta.</p>}
          </Card>

          {h.ofertas.length > 0 && (
            <Card>
              <h2 className="titular mb-3 text-xl">Ofertas</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {h.ofertas.map((o, i) => (
                  <li key={i}>{o.obra} · {TIPO_CREDITO[o.tipo] ?? o.tipo}{o.papel ? ` · ${o.papel}` : ""} · {fecha(o.fecha)}{" "}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_OFERTA[o.estado]?.cls}`}>{ESTADO_OFERTA[o.estado]?.label}</span></li>
                ))}
              </ul>
            </Card>
          )}

          {casa(access, "casa.personas") && (
            <Card>
              <h2 className="titular mb-3 text-xl">Como público: compras y funciones ({misCompras.length})</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {misCompras.map((c) => (
                  <li key={c.order_code}><b>{c.obra}</b> · función {fecha(c.funcion)} · {c.boletos} {c.boletos === 1 ? "boleto" : "boletos"} · ${Number(c.total).toLocaleString("es-MX")} · {c.estado}
                    {c.asistio > 0 && <span className="ml-1 text-exito">· asistió ({c.asistio})</span>} <span className="text-xs text-texto-3">({c.order_code})</span></li>
                ))}
                {misCompras.length === 0 && <li className="text-texto-3">Sin compras con esta cuenta.</li>}
              </ul>
            </Card>
          )}
        </>
      )}

      {t === "documentos" && ficha && (
        <Card className="flex flex-col gap-4">
          <h2 className="titular text-xl">Documentos</h2>
          {ficha.documentos.length === 0 && <p className="text-sm text-texto-3">Ninguna de sus obras le pide documentos (o no tienes permiso para verlos).</p>}
          {porObra(ficha.documentos).map((g) => (
            <div key={g.production_id}>
              <p className={`${sub} mb-1`}>{g.obra} · <Link href={`/panel/producciones/${g.production_id}/expedientes/${uid}`} className="normal-case tracking-normal text-violeta-claro">expediente</Link></p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {g.items.map((d, i) => {
                  const e = estadoDoc(d);
                  return <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2"><span><b>{d.nombre}</b>{d.obligatorio ? "" : <span className="text-texto-3"> · opcional</span>}</span><span className={`text-xs font-bold ${e.ok ? "text-exito" : d.obligatorio ? "text-aviso" : "text-texto-3"}`}>{e.ok && <Icono nombre="check" />} {e.label}</span></li>;
                })}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {t === "pagos" && ficha && (
        <Card className="flex flex-col gap-4">
          <h2 className="titular text-xl">Pagos</h2>
          {ficha.pagos.length === 0 && <p className="text-sm text-texto-3">Sin pagos registrados en las obras donde gestionas cuotas.</p>}
          {porObra(ficha.pagos).map((g) => (
            <div key={g.production_id}>
              <p className={`${sub} mb-1`}>{g.obra} · {pesos(g.items.filter((p) => !p.anulado_at).reduce((a, p) => a + Number(p.monto), 0))} · <Link href={`/panel/producciones/${g.production_id}/expedientes/${uid}`} className="normal-case tracking-normal text-violeta-claro">expediente</Link></p>
              <ul className="flex flex-col divide-y divide-white/10 rounded-xl bg-sala text-sm">
                {g.items.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${p.anulado_at ? "opacity-60" : ""}`}>
                    <span><span className="font-mono text-xs text-texto-3">{p.folio}</span> <b className={p.anulado_at ? "line-through" : ""}>{p.concepto === "inscripcion" ? "Inscripción" : p.periodo ? mayus(mesNombre(p.periodo)) : "Mensualidad"}</b> · {METODOS[p.metodo] ?? p.metodo}{p.anulado_at ? " · anulado" : ""}</span>
                    <span>{pesos(Number(p.monto))} <span className="text-xs text-texto-3">· {fecha(p.registrado_at)}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {t === "asistencia" && ficha && (
        <Card className="flex flex-col gap-4">
          <h2 className="titular text-xl">Asistencia</h2>
          {ficha.asistencia.length === 0 && <p className="text-sm text-texto-3">Todavía no tiene asistencia registrada.</p>}
          {ficha.asistencia.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {ficha.asistencia.map((s) => (
                <li key={s.production_id} className="rounded-xl bg-sala p-3 text-sm">
                  <p className="font-bold">{s.obra} <span className="font-normal text-texto-2">· {porcentaje(s) == null ? "—" : `${porcentaje(s)} %`}</span></p>
                  <p className="text-texto-2">{s.presentes} presente · {s.retardos} retardos · {s.faltas} faltas · {s.justificadas} justificadas</p>
                </li>
              ))}
            </ul>
          )}
          {ficha.ultimos.length > 0 && (
            <div>
              <p className={`${sub} mb-1`}>Últimos ensayos</p>
              <ul className="flex flex-col gap-1 text-sm">
                {ficha.ultimos.map((u, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-1.5">
                    <span>{u.titulo} <span className="text-texto-3">· {u.obra} · {fechaEnsayo(u.inicia)}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ASISTENCIA[u.estado]?.cls}`}>{ASISTENCIA[u.estado]?.label}{u.minutos_tarde ? ` · ${u.minutos_tarde} min` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {t === "incidencias" && ficha && (
        <Card>
          <h2 className="titular mb-3 text-xl">Incidencias en todas las obras</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ficha.incidencias.map((i) => (
              <li key={i.id} className={i.anulada_at ? "opacity-60" : ""}>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${NIVEL_INCIDENCIA[i.nivel]?.cls}`}>{NIVEL_INCIDENCIA[i.nivel]?.label}</span>
                <b>{i.obra}</b> · {TIPO_INCIDENCIA[i.tipo]} · {dia(i.fecha)} · {i.descripcion}{i.anulada_at ? " (anulada)" : ""}
              </li>
            ))}
            {ficha.incidencias.length === 0 && <li className="text-texto-3">Ninguna.</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
