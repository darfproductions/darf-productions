import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PageHeading } from "@/components/PageHeading";
import { getSession } from "@/lib/auth";
import { ESTADO_CONVOCATORIA, ESTADO_SOLICITUD } from "@/lib/audition-rules";
import { formatSlot, getAudition, getMyApplication } from "@/lib/auditions";
import { getProduction, getTheme, themeStyle } from "@/lib/productions";
import { cancelMyApplication } from "./actions";
import { ApplyForm } from "./ApplyForm";

export async function generateMetadata({ params }: PageProps<"/audiciones/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getAudition(id);
  return { title: data?.audition.titulo ?? "Audición" };
}

// Convocatoria pública: requisitos, personajes, horarios e inscripción (con cuenta).
// Si es de una obra, usa los colores de la obra y enlaza a su página.
export default async function AuditionPage({ params }: PageProps<"/audiciones/[id]">) {
  const { id } = await params;
  const data = await getAudition(id);
  if (!data) notFound();
  const { audition: a, roles, fields, slots } = data;
  const [session, obra] = await Promise.all([getSession(), a.production_id ? getProduction(a.production_id) : null]);
  const theme = obra ? getTheme(obra.production) : null;
  const mine = session ? await getMyApplication(a.id, session.userId) : null;
  const abierta = a.estado === "abierta" && (!a.inscripcion_cierra || new Date(a.inscripcion_cierra) > new Date());
  const qr = mine && !mine.checked_in_at && !["cancelado", "no_cumple"].includes(mine.estado) ? await QRCode.toDataURL(mine.qr_token, { margin: 1, width: 240 }) : null;
  const edades = a.edad_min || a.edad_max ? `${a.edad_min ? `de ${a.edad_min}` : ""}${a.edad_max ? ` hasta ${a.edad_max}` : ""} años` : null;

  return (
    <main style={themeStyle(theme)} className={`pb-10 ${theme ? "min-h-dvh bg-obra-fondo text-obra-texto" : ""}`}>
      {obra && (
        <div className="mx-auto max-w-[1440px] px-5 pt-6 md:px-16">
          <Link href={`/producciones/${obra.production.id}`} className="text-sm font-bold uppercase tracking-[0.2em] text-obra-acento">← {obra.production.nombre}</Link>
        </div>
      )}
      <PageHeading eyebrow={`${obra ? obra.production.nombre : "Convocatoria general"} · Audiciones · ${ESTADO_CONVOCATORIA[a.estado] ?? a.estado}`} title={a.titulo}>
        {a.descripcion}
      </PageHeading>
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 md:px-16 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-7">
          {mine && mine.estado !== "cancelado" && (
            <div className="flex flex-col gap-4 rounded-2xl border border-[#7ee2a8]/40 bg-[#7ee2a8]/10 p-6 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR generado (data URL) */}
              {qr && <img src={qr} alt="Tu QR para la audición" width={160} height={160} className="rounded-xl bg-white p-2" />}
              <div className="flex flex-col gap-1">
                <p className="text-lg font-bold">Ya estás inscrito</p>
                <p className="text-sm">Estado: <b>{ESTADO_SOLICITUD[mine.estado]?.label ?? mine.estado}</b>{mine.audition_slots ? ` · ${formatSlot(mine.audition_slots.inicia)}` : ""}</p>
                {mine.numero && <p className="text-sm">Tu número: <b>{mine.numero}</b>{!mine.checked_in_at && a.numeracion === "previa" ? " (puede ajustarse antes del día)" : ""}</p>}
                {!mine.audition_slots && !a.elegir_horario && <p className="text-sm text-texto-2">Te avisaremos tu horario.</p>}
                {qr && <p className="text-sm text-texto-2">Muestra este QR en la mesa de registro el día de la audición.</p>}
                {!mine.checked_in_at && ["inscrito", "convocado", "en_espera"].includes(mine.estado) && (
                  <form action={cancelMyApplication}>
                    <input type="hidden" name="app" value={mine.id} />
                    <input type="hidden" name="aid" value={a.id} />
                    <button className="mt-2 text-sm font-bold text-[#ff8fa3] underline">Cancelar mi inscripción</button>
                  </form>
                )}
              </div>
            </div>
          )}

          {abierta && !session && (
            <div className="rounded-2xl bg-telon p-6">
              <p className="text-lg font-semibold">Para inscribirte necesitas una cuenta DARF.</p>
              <Link href={`/entrar?next=/audiciones/${a.id}`} className="boton-compra mt-4 inline-block rounded-full px-6 py-3 text-sm font-bold uppercase tracking-[0.1em]">Entrar o crear cuenta</Link>
            </div>
          )}
          {abierta && session && !mine?.checked_in_at && (
            <>
              <h2 className="titular text-2xl">{mine && mine.estado !== "cancelado" ? "Editar mi inscripción" : "Inscripción"}</h2>
              <ApplyForm aid={a.id} userId={session.userId} roles={roles} fields={fields} slots={a.elegir_horario ? slots : []} fechaAudicion={slots[0]?.inicia ?? null}
                opciones={{ pedirFoto: a.pedir_foto, pedirTutor: a.pedir_tutor }} defaults={{ nombre: session.profile?.nombre ?? "", telefono: session.profile?.telefono ?? "" }} previa={mine} />
            </>
          )}
          {!abierta && !mine && <p className="rounded-2xl bg-telon p-6 text-texto-2">La inscripción a esta convocatoria está cerrada.</p>}
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-2xl bg-telon p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Detalles</p>
            <dl className="flex flex-col gap-2 text-sm">
              {a.sede && <div><dt className="text-texto-3">Sede</dt><dd className="font-semibold">{a.sede}</dd></div>}
              {edades && <div><dt className="text-texto-3">Edad</dt><dd className="font-semibold">{edades}</dd></div>}
              {a.inscripcion_cierra && <div><dt className="text-texto-3">Inscripción hasta</dt><dd className="font-semibold capitalize">{formatSlot(a.inscripcion_cierra)}</dd></div>}
            </dl>
            {a.requisitos && <p className="mt-4 whitespace-pre-line text-sm text-texto-2">{a.requisitos}</p>}
          </div>
          {roles.length > 0 && (
            <div className="rounded-2xl bg-telon p-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Personajes</p>
              <ul className="flex flex-col gap-3">
                {roles.map((r) => <li key={r.id}><p className="font-bold">{r.nombre}</p>{r.descripcion && <p className="text-sm text-texto-2">{r.descripcion}</p>}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
