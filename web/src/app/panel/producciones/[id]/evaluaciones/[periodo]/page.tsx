import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { ESTADO_PROPUESTA, getEvaluations, getPropuestas, getRubric, misMateriasAsistente } from "@/lib/rubric";
import { completa, filasBoleta, promedio } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";
import { entregarCalificaciones, publishPeriod, regresarEntrega } from "../actions";

export const metadata: Metadata = { title: "Evaluar" };

const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Alumnos de un periodo: quién falta, promedio y acceso a su evaluación y boleta.
export default async function Periodo({ params }: PageProps<"/panel/producciones/[id]/evaluaciones/[periodo]">) {
  const { id, periodo } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones/${periodo}`);
  const gestiona = can(access, id, "rubrica.gestionar");
  if (!gestiona && !can(access, id, "rubrica.proponer")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  if (!(await supabase.rpc("rubric_active", { pid: id })).data) redirect(`/panel/producciones/${id}/evaluaciones`);
  const base = `/panel/producciones/${id}/evaluaciones`;
  if (!gestiona) {
    // Asistente artístico (0100): sus alumnos y el estado de sus propuestas en este periodo.
    const [{ criterios, periodos }, roster, props, mias] = await Promise.all([
      getRubric(id), supabase.rpc("rubric_roster_asistente", { pid: id }), getPropuestas(periodo), misMateriasAsistente(id, access.session.userId),
    ]);
    const per = periodos.find((p) => p.id === periodo);
    if (!per) notFound();
    const alumnos = (roster.data ?? []) as { user_id: string; nombre: string }[];
    const materias = criterios.filter((c) => mias.includes(c.id));
    return (
      <div className="flex flex-col gap-4">
        <Link href={base} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Evaluaciones</Link>
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">{per.nombre}</h2>
          <p className="text-sm text-texto-2">Tus propuestas en {materias.map((c) => c.nombre).join(", ") || "—"}. El maestro de la materia las revisa.</p>
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {alumnos.map((a) => {
              const mi = props.filter((q) => q.user_id === a.user_id && q.proposed_by === access.session.userId);
              return (
                <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <b>{a.nombre}</b>
                    <span className="block text-xs">
                      {materias.map((c) => {
                        const q = mi.find((x) => x.criterion_id === c.id);
                        return <span key={c.id} className={`mr-3 ${q ? ESTADO_PROPUESTA[q.estado].cls : "text-texto-3"}`}>{c.nombre}: {q ? ESTADO_PROPUESTA[q.estado].label : "sin proponer"}</span>;
                      })}
                    </span>
                  </span>
                  {!per.publicado_at && materias.length > 0 && (
                    <Link href={`${base}/${periodo}/${a.user_id}`} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">{mi.length ? "Ver" : "Proponer"}</Link>
                  )}
                </li>
              );
            })}
            {alumnos.length === 0 && <li className="py-2 text-texto-3">Esta obra no tiene integrantes todavía.</li>}
          </ul>
        </Card>
      </div>
    );
  }
  const [{ criterios, niveles, periodos }, evs, roster, props, entRes, pubRes, restr, maestrosRes] = await Promise.all([
    getRubric(id), getEvaluations(id, { periodo }), supabase.rpc("rubric_roster", { pid: id }), getPropuestas(periodo),
    supabase.rpc("rubric_entregas_periodo", { per: periodo }), supabase.rpc("rubric_puede_publicar", { pid: id }),
    supabase.rpc("rubric_restricted", { pid: id }), supabase.rpc("rubric_teacher_list", { pid: id }),
  ]);
  const me = access.session.userId;
  const publica = !!pubRes.data;
  const revisa = !restr.data || publica;
  const entregas = (entRes.data ?? []) as { teacher_id: string; nombre: string; estado: "pendiente" | "entregada" | "regresada"; entregado_at: string | null; regresado_at: string | null; nota: string | null }[];
  const mia = entregas.find((e) => e.teacher_id === me);
  const misMaterias = ((maestrosRes.data ?? []) as { user_id: string; criterios: string[] }[]).find((m) => m.user_id === me)?.criterios ?? [];
  const per = periodos.find((p) => p.id === periodo);
  if (!per) notFound();
  const alumnos = (roster.data ?? []) as { user_id: string; nombre: string; papeles: string[]; activo: boolean }[];
  const activos = alumnos.filter((a) => a.activo);
  const faltanMias = activos.filter((a) => {
    const ev = evs.find((e) => e.user_id === a.user_id);
    return misMaterias.some((c) => !ev?.rubric_scores.some((x) => x.criterion_id === c && (x.level_id || x.numero != null)));
  }).length;
  const sinEntregar = entregas.filter((e) => e.estado !== "entregada");
  const porRevisar = (uid: string) => props.filter((q) => q.user_id === uid && q.estado === "pendiente").length;
  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Evaluaciones</Link>
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">{per.nombre} {per.publicado_at && <span className="text-sm font-normal text-exito">· publicado</span>}</h2>
        {criterios.length === 0 && <p className="text-sm text-aviso">Primero agrega criterios a la rúbrica.</p>}
        {mia && !per.publicado_at && (
          <div className="flex flex-col gap-2 rounded-lg bg-sala p-3 text-sm">
            {mia.estado === "entregada" ? (
              <p><Icono nombre="candado" /> <b>Entregaste tus calificaciones</b>{mia.entregado_at ? ` el ${fechaHora(mia.entregado_at)}` : ""}. Están en revisión; si hay que cambiar algo, te las regresan.</p>
            ) : (
              <>
                {mia.estado === "regresada" && <p className="text-aviso"><b>Te regresaron tus calificaciones.</b>{mia.nota ? ` “${mia.nota}”` : ""}</p>}
                <p className="text-texto-2">Cuando termines tus materias, entrégalas para revisión. Ya no podrás cambiarlas, salvo que te las regresen.</p>
                <ActionForm action={entregarCalificaciones} hidden={{ pid: id, periodo }} submit="Entregar mis calificaciones"
                  confirm={faltanMias ? `Te faltan ${faltanMias} alumno(s) por calificar. ¿Entregar así?` : "¿Entregar tus calificaciones? Ya no podrás cambiarlas, salvo que te las regresen."} />
              </>
            )}
          </div>
        )}
        {revisa && entregas.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-sala p-3 text-sm">
            <p className="font-bold">Entregas de los maestros</p>
            <ul className="flex flex-col gap-2">
              {entregas.map((e) => (
                <li key={e.teacher_id} className="flex flex-col gap-1.5">
                  <span>
                    <b>{e.nombre}</b>{" "}
                    <span className={`text-xs font-bold ${e.estado === "entregada" ? "text-exito" : e.estado === "regresada" ? "text-aviso" : "text-texto-3"}`}>
                      {e.estado === "entregada" ? "Entregó" : e.estado === "regresada" ? "Regresada" : "Aún no entrega"}
                    </span>
                  </span>
                  {e.estado === "entregada" && !per.publicado_at && (
                    <ActionForm inline action={regresarEntrega} hidden={{ pid: id, periodo, teacher: e.teacher_id }} submit="Regresar" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">
                      <input className={`${input} min-w-[220px]`} name="nota" maxLength={1000} placeholder="Qué hay que revisar (opcional)" aria-label={`Nota para ${e.nombre}`} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-texto-3">Puedes corregir cualquier calificación entrando a cada alumno, aunque el maestro ya la haya entregado.</p>
          </div>
        )}
        {publica && !per.publicado_at && (
          <ActionForm action={publishPeriod} hidden={{ pid: id, id: periodo, publicar: "si" }} submit={<><Icono nombre="check" /> Aprobar y publicar boletas</>}
            confirm={sinEntregar.length ? `Aún no entregan: ${sinEntregar.map((e) => e.nombre).join(", ")}. ¿Aprobar y publicar de todos modos?` : `¿Aprobar y publicar “${per.nombre}”? Cada alumno verá su evaluación y su boleta.`} />
        )}
        <ul className="flex flex-col divide-y divide-white/10 text-sm">
          {alumnos.map((a) => {
            const ev = evs.find((e) => e.user_id === a.user_id);
            const ok = ev && completa(criterios, ev.rubric_scores, ev.rubric_shared_scores);
            const prom = ev ? promedio(filasBoleta(criterios, niveles, ev.rubric_scores, ev.rubric_shared_scores)) : null;
            return (
              <li key={a.user_id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${a.activo ? "" : "opacity-60"}`}>
                <span>
                  <b>{a.nombre}</b>{!a.activo && <span className="text-xs text-texto-3"> · baja</span>}
                  <span className="block text-xs text-texto-3">{a.papeles.join(" · ") || "Integrante"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {porRevisar(a.user_id) > 0 && <span className="rounded-full bg-[#422006] px-2.5 py-1 text-xs font-bold text-[#fde68a]">{porRevisar(a.user_id)} {porRevisar(a.user_id) === 1 ? "propuesta" : "propuestas"} por revisar</span>}
                  <span className={`text-xs font-bold ${ok ? "text-exito" : ev ? "text-aviso" : "text-texto-3"}`}>
                    {ok ? `Completa${prom != null ? ` · ${prom}` : ""}` : ev ? "Incompleta" : "Pendiente"}
                  </span>
                  <Link href={`${base}/${periodo}/${a.user_id}`} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">{ev ? "Editar" : "Evaluar"}</Link>
                  {ev && <a href={`${base}/${periodo}/${a.user_id}/boleta`} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">Boleta PDF</a>}
                </span>
              </li>
            );
          })}
          {alumnos.length === 0 && <li className="py-2 text-texto-3">Esta obra no tiene integrantes todavía.</li>}
        </ul>
      </Card>
    </div>
  );
}
