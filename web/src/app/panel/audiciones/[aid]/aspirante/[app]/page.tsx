/* eslint-disable @next/next/no-img-element -- foto privada con enlace temporal */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ESTADO_SOLICITUD, ageAt, hora, minutos, score, videoSource } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import type { Criterio } from "@/lib/audition-rules";
import { createClient } from "@/lib/supabase/server";
import { addVideo, removeItem } from "../../../actions";

export const metadata: Metadata = { title: "Ficha del aspirante" };

const FUENTE = { youtube: "YouTube", drive: "Drive", otro: "Enlace" } as const;

// Ficha de un aspirante en esta convocatoria: datos, horas del día, calificaciones y videos.
// Es la base de su expediente: si entra al elenco, en la etapa 3E se liga a él.
export default async function ApplicantPage({ params }: PageProps<"/panel/audiciones/[aid]/aspirante/[app]">) {
  const { aid, app } = await params;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], `/aspirante/${app}`);
  const etiqueta = new Map(((a.criterios ?? []) as Criterio[]).map((c) => [c.k, c.l]));
  if (!/^[0-9a-f-]{36}$/.test(app)) notFound();
  const supabase = await createClient();
  const [{ data: x }, scores, videos, roles] = await Promise.all([
    supabase.from("audition_applications").select("*, audition_slots(inicia, sala)").eq("id", app).eq("audition_id", aid).maybeSingle(),
    supabase.from("audition_scores").select("ronda, puntos, notas, judge_id").eq("application_id", app).order("ronda"),
    supabase.from("audition_videos").select("id, titulo, url, application_id, created_at").eq("audition_id", aid).order("created_at"),
    supabase.from("audition_roles").select("id, nombre").eq("audition_id", aid),
  ]);
  if (!x) notFound();
  const fotos = await signPhotos([x.foto_path]);
  const edad = ageAt(x.fecha_nacimiento, x.audition_slots ? new Date(x.audition_slots.inicia) : new Date());
  const propios = (videos.data ?? []).filter((v) => v.application_id === app);
  const delDia = (videos.data ?? []).filter((v) => !v.application_id);
  const roleName = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const dur = minutos(x.entered_at, x.finished_at);
  const h = { aid };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="flex gap-4 lg:col-span-7">
        <div className="h-36 w-28 shrink-0 overflow-hidden rounded-lg bg-telon-2">
          {x.foto_path && fotos.get(x.foto_path) && <img src={fotos.get(x.foto_path)} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <p className="text-xl font-bold">{x.numero ? `Nº ${x.numero} · ` : ""}{x.nombre}</p>
          <p className="text-texto-2">{edad} años · <a href={`tel:${x.telefono}`} className="underline">{x.telefono}</a>{x.walk_in ? " · llegó sin cita" : ""}</p>
          <p><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_SOLICITUD[x.estado]?.cls}`}>{ESTADO_SOLICITUD[x.estado]?.label}</span>{x.ronda > 1 ? ` · ronda ${x.ronda}` : ""}</p>
          {x.audition_slots && <p className="capitalize">{formatSlot(x.audition_slots.inicia)}{x.audition_slots.sala ? ` · ${x.audition_slots.sala}` : ""}</p>}
          {(x.roles as string[]).length > 0 && <p>Personajes: {(x.roles as string[]).map((r) => roleName.get(r)).filter(Boolean).join(", ")}</p>}
          {x.es_menor && <p className="text-[#f2b544]">Menor de edad{x.tutor_nombre ? ` · tutor: ${x.tutor_nombre} · ${x.tutor_telefono}` : " · autorización por la escuela u organización"}</p>}
          {!x.consentimiento_imagen && <p className="text-xs text-texto-3">No autorizó fotos o video.</p>}
        </div>
      </Card>

      <Card className="lg:col-span-5">
        <h2 className="mb-2 font-bold">Día de la audición</h2>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div><dt className="text-xs text-texto-3">Llegó</dt><dd className="text-lg font-bold">{hora(x.checked_in_at) || "—"}</dd></div>
          <div><dt className="text-xs text-texto-3">Entró</dt><dd className="text-lg font-bold">{hora(x.entered_at) || "—"}</dd></div>
          <div><dt className="text-xs text-texto-3">Salió</dt><dd className="text-lg font-bold">{hora(x.finished_at) || "—"}</dd></div>
        </dl>
        {dur !== null && <p className="mt-2 text-center text-xs text-texto-3">Estuvo {dur} min en sala.</p>}
      </Card>

      <Card className="flex flex-col gap-3 lg:col-span-7">
        <h2 className="font-bold">Videos de su audición</h2>
        <ul className="flex flex-col gap-2">
          {propios.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
              <a href={v.url} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">{v.titulo} ↗</a>
              <span className="flex items-center gap-2 text-xs text-texto-3">{FUENTE[videoSource(v.url) ?? "otro"]}
                <ActionForm inline action={removeItem} hidden={{ ...h, tabla: "audition_videos", id: v.id }} confirm="¿Quitar este video de la ficha? (el video sigue en YouTube o Drive)" submit="Quitar" submitClass="rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold" />
              </span>
            </li>
          ))}
          {propios.length === 0 && <li className="text-sm text-texto-3">Sin videos todavía.</li>}
        </ul>
        <ActionForm action={addVideo} hidden={{ ...h, app }} submit="Agregar video">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input className={input} name="titulo" placeholder="Ej. Coreografía, Canción" />
            <input className={input} name="url" type="url" required placeholder="https://youtu.be/… o https://drive.google.com/…" />
          </div>
          <p className="text-xs text-texto-3">Sube el video a YouTube como “no listado” o a Google Drive (compartido con el equipo) y pega aquí el enlace.</p>
        </ActionForm>
        {delDia.length > 0 && (
          <div className="text-sm">
            <p className="mb-1 text-texto-3">Videos generales del día (por grupo):</p>
            <ul className="flex flex-col gap-1">{delDia.map((v) => <li key={v.id}><a href={v.url} target="_blank" rel="noreferrer" className="text-violeta-claro underline">{v.titulo} ↗</a></li>)}</ul>
          </div>
        )}
      </Card>

      <Card className="lg:col-span-5">
        <h2 className="mb-2 font-bold">Calificaciones</h2>
        {(scores.data ?? []).length === 0 && <p className="text-sm text-texto-3">Aún sin calificar.</p>}
        <ul className="flex flex-col gap-2 text-sm">
          {(scores.data ?? []).map((s, i) => (
            <li key={i} className="rounded-lg bg-sala px-3 py-2">
              <p className="text-xs text-texto-3">{s.ronda === 1 ? "Audición" : `Callback ${s.ronda - 1}`}</p>
              <p>{Object.entries((s.puntos ?? {}) as Record<string, number>).map(([k, v]) => `${etiqueta.get(k) ?? k} ${score(v)}`).join(" · ") || "Sin calificar"}</p>
              {s.notas && <p className="mt-1 text-texto-2">{s.notas}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
