/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, ageAt, hora, mensajeAprobada, mensajeRegreso } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { addVideo, aprobarCompletas, pedirCompletar, revisarSolicitud, setApplicationEstado, setSlot } from "../../actions";
import { ligaWhatsApp } from "@/lib/pago-rules";
import { origenSitio } from "@/lib/site-origin";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Solicitudes" };

const fechaCorta = (iso: string) => `${new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" }).format(new Date(iso))}, ${hora(iso)}`;

type App = {
  id: string; estado: string; ronda: number; nombre: string; fecha_nacimiento: string; telefono: string; foto_path: string | null;
  roles: string[]; respuestas: Record<string, string>; es_menor: boolean; tutor_nombre: string | null; tutor_telefono: string | null;
  tutor_email: string | null; consentimiento_imagen: boolean; walk_in: boolean; numero: number | null; checked_in_at: string | null;
  created_at: string; slot_id: string | null; audition_slots: { inicia: string } | null; user_id: string | null;
  completar_pedido_at: string | null; completar_nota: string | null; revisada_at: string | null; completado_at: string | null;
};
type Faltante = { id: string; faltan: string[]; pedido_at: string | null; completado_at: string | null };
const DECISIONES = ["convocado", "en_espera", "no_cumple", "inscrito"];

// Solicitudes (solo quien gestiona: aquí sí hay datos de contacto). Si la convocatoria
// no deja elegir horario, aquí se asigna.
export default async function Applications({ params, searchParams }: PageProps<"/panel/audiciones/[aid]/solicitudes">) {
  const { aid } = await params;
  const sp = await searchParams;
  const { a: aud } = await requireAudition(aid, ["audiciones.gestionar"], "/solicitudes");
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const rol = typeof sp.rol === "string" ? sp.rol : "";
  const supabase = await createClient();
  const [{ data }, roles, fields, slots, { data: faltData }] = await Promise.all([
    supabase.from("audition_applications").select("*, audition_slots(inicia)").eq("audition_id", aid).order("numero", { nullsFirst: false }).order("created_at"),
    supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden"),
    supabase.from("audition_fields").select("id, etiqueta").eq("audition_id", aid).order("orden"),
    supabase.from("audition_slots").select("id, inicia").eq("audition_id", aid).order("inicia"),
    supabase.rpc("audition_faltantes", { aid }),
  ]);
  // 0133: qué le falta a cada solicitud (preguntas obligatorias nuevas o la foto) y si ya se le pidió completar.
  const falta = new Map(((faltData ?? []) as Faltante[]).map((x) => [x.id, x]));
  const puedePedir = (a: App) => !!a.user_id && !a.checked_in_at && !["cancelado", "no_cumple"].includes(a.estado) && ["abierta", "cerrada"].includes(aud.estado);
  const horarios = (slots.data ?? []) as { id: string; inicia: string }[];
  const todas = (data ?? []) as App[];
  const faltaAlgo = (a: App) => (falta.get(a.id)?.faltan.length ?? 0) > 0;
  const soloFalta = sp.falta === "1";
  const apps = todas.filter((a) => (!estado || a.estado === estado) && (!rol || a.roles.includes(rol)) && (!soloFalta || faltaAlgo(a)));
  const porPedir = todas.filter((a) => faltaAlgo(a) && puedePedir(a)).length;
  // 0134: revisión de solicitudes. "En revisión" = inscrito; al aprobar pasa a la lista del día (convocado).
  const enRevision = (a: App) => a.estado === "inscrito" && !a.checked_in_at;
  const completasPorAprobar = todas.filter((a) => enRevision(a) && !a.completar_pedido_at && !faltaAlgo(a)).length;
  const sitio = await origenSitio();
  const titulo = aud.titulo;
  const telWa = (a: App) => (a.es_menor && a.tutor_telefono ? a.tutor_telefono : a.telefono);
  const fotos = await signPhotos(apps.map((a) => a.foto_path));
  const roleName = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const q = (k: string, v: string) => {
    const p = new URLSearchParams({ ...(estado && { estado }), ...(rol && { rol }), ...(soloFalta && { falta: "1" }) });
    if (v) p.set(k, v); else p.delete(k);
    return `?${p.toString()}`;
  };
  const conteo = (e: string) => todas.filter((a) => a.estado === e).length;

  return (
    <>
      <a href={`/panel/audiciones/${aid}/exportar`} className="self-end text-sm font-bold text-violeta-claro">Descargar inscritos (Excel) <Icono nombre="flecha-abajo" /></a>
      <Card>
        <details>
          <summary className="cursor-pointer font-bold">+ Video general del día (por grupo o sesión completa)</summary>
          <div className="mt-3">
            <ActionForm action={addVideo} hidden={{ aid }} submit="Agregar video">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <input className={input} name="titulo" required placeholder="Ej. Grupo 1 (números 1 a 10)" />
                <input className={input} name="url" type="url" required placeholder="https://youtu.be/… o https://drive.google.com/…" />
              </div>
              <p className="text-xs text-texto-3">Para el video de una sola persona, ábrela (su nombre) y agrégalo en su ficha.</p>
            </ActionForm>
          </div>
        </details>
      </Card>
      {todas.some(enRevision) && (
        <Card className="flex flex-col gap-2 border border-lila/40">
          <h2 className="font-bold">{todas.filter(enRevision).length} {todas.filter(enRevision).length === 1 ? "solicitud en revisión" : "solicitudes en revisión"}</h2>
          <p className="text-sm text-texto-2">Revisa cada una: <b>Aprobar</b> la pasa a la lista de quienes audicionan; <b>Regresar</b> le avisa lo que tiene que corregir (con tu nota) y puede editarla aunque la inscripción ya haya cerrado.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={q("estado", "inscrito")} className="rounded-full border border-white/25 px-4 py-2 text-sm font-bold">Ver las que están en revisión</Link>
            {completasPorAprobar > 0 && (
              <ActionForm inline action={aprobarCompletas} hidden={{ aid }} confirm={`¿Aprobar ${completasPorAprobar} ${completasPorAprobar === 1 ? "solicitud que está completa" : "solicitudes que están completas"}? Pasan a la lista del día y les llega el aviso.`}
                submit={`Aprobar las completas (${completasPorAprobar})`} submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />
            )}
          </div>
        </Card>
      )}
      {todas.some(faltaAlgo) && (
        <Card className="flex flex-col gap-2 border border-aviso/40">
          <h2 className="font-bold">A {todas.filter(faltaAlgo).length} {todas.filter(faltaAlgo).length === 1 ? "solicitud le falta" : "solicitudes les falta"} información</h2>
          <p className="text-sm text-texto-2">Les faltan preguntas obligatorias que agregaste después, o la foto. Al pedirles que completen, les llega un aviso con lo que falta y pueden editar su inscripción aunque ya haya cerrado. Al guardar, se les quita el aviso.</p>
          <div className="flex flex-wrap items-center gap-2">
            {porPedir > 0 && (
              <ActionForm inline action={pedirCompletar} hidden={{ aid }} confirm={`¿Pedir a ${porPedir} ${porPedir === 1 ? "persona" : "personas"} que completen su inscripción?`}
                submit={`Pedir que completen (${porPedir})`} submitClass="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala" />
            )}
            <Link href={q("falta", soloFalta ? "" : "1")} className="text-sm font-bold text-violeta-claro">{soloFalta ? "Ver todas" : "Ver solo a quienes les falta algo"}</Link>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={q("estado", "")} className={`rounded-full border px-3 py-1.5 font-semibold ${!estado ? "border-texto" : "border-white/20"}`}>Todas ({todas.length})</Link>
        {Object.entries(ESTADO_SOLICITUD).map(([k, v]) => conteo(k) > 0 && (
          <Link key={k} href={q("estado", k)} className={`rounded-full border px-3 py-1.5 font-semibold ${estado === k ? "border-texto" : "border-white/20"}`}>{v.label} ({conteo(k)})</Link>
        ))}
        {(roles.data ?? []).length > 0 && <span className="mx-1 text-texto-3">·</span>}
        {(roles.data ?? []).map((r) => (
          <Link key={r.id} href={q("rol", rol === r.id ? "" : r.id)} className={`rounded-full border px-3 py-1.5 font-semibold ${rol === r.id ? "border-texto" : "border-white/20"}`}>{r.nombre}</Link>
        ))}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {apps.map((a) => {
          const edad = ageAt(a.fecha_nacimiento, a.audition_slots ? new Date(a.audition_slots.inicia) : new Date());
          return (
            <li key={a.id}>
              <Card className="flex gap-4">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-telon-2">
                  {a.foto_path && fotos.get(a.foto_path) && <img src={fotos.get(a.foto_path)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                  <p className="text-base font-bold"><Link href={`/panel/audiciones/${aid}/aspirante/${a.id}`} className="hover:underline">{a.nombre}</Link> <span className="font-normal text-texto-3">· {edad} años</span></p>
                  <p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_SOLICITUD[a.estado]?.cls}`}>{ESTADO_SOLICITUD[a.estado]?.label}</span>
                    {a.numero && <span className="ml-2">Nº {a.numero}</span>}{a.walk_in && <span className="ml-2 text-texto-3">sin cita</span>}</p>
                  <p className="text-texto-2"><a href={`tel:${a.telefono}`} className="underline">{a.telefono}</a>{a.audition_slots ? ` · ${formatSlot(a.audition_slots.inicia)}` : ""}</p>
                  {a.es_menor && (a.tutor_nombre
                    ? <p className="text-aviso">Menor · tutor: {a.tutor_nombre} · <a href={`tel:${a.tutor_telefono}`} className="underline">{a.tutor_telefono}</a>{a.tutor_email ? ` · ${a.tutor_email}` : ""}</p>
                    : <p className="text-aviso">Menor · autorización por la escuela u organización</p>)}
                  {horarios.length > 0 && (!aud.elegir_horario || !a.audition_slots) && !a.checked_in_at && (
                    <ActionForm inline action={setSlot} hidden={{ aid, app: a.id }} submit="Asignar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">
                      <select name="slot" defaultValue={a.slot_id ?? ""} className={`${input} py-1.5 text-xs`} aria-label="Horario">
                        <option value="">Sin horario</option>
                        {horarios.map((hs) => <option key={hs.id} value={hs.id}>{formatSlot(hs.inicia)}</option>)}
                      </select>
                    </ActionForm>
                  )}
                  {a.roles.length > 0 && <p>Personajes: {a.roles.map((r) => roleName.get(r)).filter(Boolean).join(", ")}</p>}
                  {(fields.data ?? []).map((f) => a.respuestas?.[f.id as string] && (
                    <p key={f.id} className="break-words"><span className="text-texto-3">{f.etiqueta}:</span>{" "}
                      {/^https?:\/\//.test(a.respuestas[f.id as string]) ? <a href={a.respuestas[f.id as string]} target="_blank" rel="noreferrer" className="text-violeta-claro underline">abrir enlace</a> : a.respuestas[f.id as string]}
                    </p>
                  ))}
                  {!a.consentimiento_imagen && <p className="text-xs text-texto-3">No autorizó fotos o video.</p>}
                  {faltaAlgo(a) && <p className="text-xs font-semibold text-aviso">Le falta: {falta.get(a.id)!.faltan.join(", ")}</p>}
                  {a.completar_pedido_at && !a.checked_in_at && (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-aviso/10 p-2.5 text-xs">
                      <p><b className="text-aviso">Regresada el {fechaCorta(a.completar_pedido_at)}</b>{a.completar_nota ? <>: {a.completar_nota}</> : null} · aún no la corrige.</p>
                      {ligaWhatsApp(telWa(a), mensajeRegreso(a.nombre, titulo, a.completar_nota ?? "Revisa y completa tu inscripción.", `${sitio}/audiciones/${aid}`)) && (
                        <a href={ligaWhatsApp(telWa(a), mensajeRegreso(a.nombre, titulo, a.completar_nota ?? "Revisa y completa tu inscripción.", `${sitio}/audiciones/${aid}`))!} target="_blank" rel="noreferrer"
                          className="self-start rounded-full bg-[#25d366] px-3 py-1.5 font-bold text-[#052e16]">Mandar por WhatsApp <Icono nombre="externo" /></a>
                      )}
                    </div>
                  )}
                  {!a.completar_pedido_at && a.completado_at && enRevision(a) && <p className="text-xs font-semibold text-exito">Ya corrigió su solicitud ({fechaCorta(a.completado_at)}): revísala de nuevo.</p>}
                  {enRevision(a) && !a.completar_pedido_at && puedePedir(a) && (
                    <div className="flex flex-col gap-2 rounded-lg border border-lila/30 p-2.5">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-lila">Revisar solicitud</p>
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionForm inline action={revisarSolicitud} hidden={{ aid, app: a.id, accion: "aprobar" }}
                          confirm={faltaAlgo(a) ? `A ${a.nombre} le falta: ${falta.get(a.id)!.faltan.join(", ")}. ¿Aprobarla de todos modos?` : undefined}
                          submit="Aprobar" submitClass="rounded-full bg-[#22c55e] px-4 py-1.5 text-xs font-bold text-[#052e16]" />
                        <details className="min-w-0 flex-1">
                          <summary className="cursor-pointer rounded-full border border-aviso/50 px-4 py-1.5 text-xs font-bold text-aviso [list-style:none]">Regresar…</summary>
                          <div className="mt-2">
                            <ActionForm action={revisarSolicitud} hidden={{ aid, app: a.id, accion: "regresar" }} submit="Regresar y avisarle">
                              <textarea name="nota" maxLength={500} rows={3} className={`${input} text-xs`} aria-label="Nota para la persona"
                                placeholder="¿Qué tiene que corregir? Ej. Te falta la foto de cuerpo completo."
                                defaultValue={faltaAlgo(a) ? `Falta: ${falta.get(a.id)!.faltan.join(", ")}.` : ""} />
                            </ActionForm>
                          </div>
                        </details>
                      </div>
                    </div>
                  )}
                  {a.estado === "convocado" && a.revisada_at && !a.checked_in_at && ligaWhatsApp(telWa(a), mensajeAprobada(a.nombre, titulo, `${sitio}/cuenta`)) && (
                    <a href={ligaWhatsApp(telWa(a), mensajeAprobada(a.nombre, titulo, `${sitio}/cuenta`))!} target="_blank" rel="noreferrer"
                      className="self-start text-xs font-bold text-[#25d366]">Avisarle por WhatsApp que fue aprobada <Icono nombre="externo" /></a>
                  )}
                  <ActionForm inline action={setApplicationEstado} hidden={{ aid, app: a.id }} submit="Guardar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">
                    <select name="estado" defaultValue={a.estado} className={`${input} py-1.5 text-xs`} aria-label="Decisión">
                      {[...new Set([a.estado, ...DECISIONES])].map((e) => <option key={e} value={e}>{ESTADO_SOLICITUD[e]?.label ?? e}</option>)}
                    </select>
                  </ActionForm>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {apps.length === 0 && <Card>No hay solicitudes con este filtro.</Card>}
    </>
  );
}
