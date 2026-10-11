/* eslint-disable @next/next/no-img-element -- fotos privadas con enlace temporal */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, ageAt } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { signPhotos } from "@/lib/panel-auditions";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { setApplicationEstado } from "../../actions";

export const metadata: Metadata = { title: "Solicitudes" };

type App = {
  id: string; estado: string; ronda: number; nombre: string; fecha_nacimiento: string; telefono: string; foto_path: string | null;
  roles: string[]; respuestas: Record<string, string>; es_menor: boolean; tutor_nombre: string | null; tutor_telefono: string | null;
  tutor_email: string | null; consentimiento_imagen: boolean; walk_in: boolean; numero: number | null; checked_in_at: string | null;
  created_at: string; audition_slots: { inicia: string } | null;
};
const DECISIONES = ["convocado", "en_espera", "no_cumple", "inscrito"];

// Solicitudes (solo quien gestiona: aquí sí hay datos de contacto).
export default async function Applications({ params, searchParams }: PageProps<"/panel/producciones/[id]/audiciones/[aid]/solicitudes">) {
  const { id, aid } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones/${aid}/solicitudes`);
  if (!can(access, id, "audiciones.gestionar")) redirect(`/panel/producciones/${id}/audiciones/${aid}`);
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const rol = typeof sp.rol === "string" ? sp.rol : "";
  const supabase = await createClient();
  const [{ data }, roles, fields] = await Promise.all([
    supabase.from("audition_applications").select("*, audition_slots(inicia)").eq("audition_id", aid).order("created_at"),
    supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid).order("orden"),
    supabase.from("audition_fields").select("id, etiqueta").eq("audition_id", aid).order("orden"),
  ]);
  const todas = (data ?? []) as App[];
  const apps = todas.filter((a) => (!estado || a.estado === estado) && (!rol || a.roles.includes(rol)));
  const fotos = await signPhotos(apps.map((a) => a.foto_path));
  const roleName = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const q = (k: string, v: string) => {
    const p = new URLSearchParams({ ...(estado && { estado }), ...(rol && { rol }) });
    if (v) p.set(k, v); else p.delete(k);
    return `?${p.toString()}`;
  };
  const conteo = (e: string) => todas.filter((a) => a.estado === e).length;

  return (
    <>
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
                  <p className="text-base font-bold">{a.nombre} <span className="font-normal text-texto-3">· {edad} años</span></p>
                  <p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_SOLICITUD[a.estado]?.cls}`}>{ESTADO_SOLICITUD[a.estado]?.label}</span>
                    {a.numero && <span className="ml-2">Nº {a.numero}</span>}{a.walk_in && <span className="ml-2 text-texto-3">sin cita</span>}</p>
                  <p className="text-texto-2"><a href={`tel:${a.telefono}`} className="underline">{a.telefono}</a>{a.audition_slots ? ` · ${formatSlot(a.audition_slots.inicia)}` : ""}</p>
                  {a.es_menor && <p className="text-[#f2b544]">Menor · tutor: {a.tutor_nombre} · <a href={`tel:${a.tutor_telefono}`} className="underline">{a.tutor_telefono}</a>{a.tutor_email ? ` · ${a.tutor_email}` : ""}</p>}
                  {a.roles.length > 0 && <p>Personajes: {a.roles.map((r) => roleName.get(r)).filter(Boolean).join(", ")}</p>}
                  {(fields.data ?? []).map((f) => a.respuestas?.[f.id as string] && (
                    <p key={f.id} className="break-words"><span className="text-texto-3">{f.etiqueta}:</span>{" "}
                      {/^https?:\/\//.test(a.respuestas[f.id as string]) ? <a href={a.respuestas[f.id as string]} target="_blank" rel="noreferrer" className="text-violeta-claro underline">abrir enlace</a> : a.respuestas[f.id as string]}
                    </p>
                  ))}
                  {!a.consentimiento_imagen && <p className="text-xs text-texto-3">No autorizó fotos o video.</p>}
                  <ActionForm inline action={setApplicationEstado} hidden={{ pid: id, aid, app: a.id }} submit="Guardar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">
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
