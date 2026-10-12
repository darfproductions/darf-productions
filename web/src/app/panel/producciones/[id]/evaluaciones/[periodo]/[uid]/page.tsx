import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getEvaluations, getRubric, periodExtras } from "@/lib/rubric";
import { asistenciaPct, promedio, siguiente, type Nivel } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { saveEvaluation } from "../../actions";

export const metadata: Metadata = { title: "Evaluar alumno" };

function Campos({ prefix, id, niveles, level, numero, label }: { prefix: string; id: string; niveles: Nivel[]; level?: string | null; numero?: number | null; label: string }) {
  return (
    <>
      <select className={input} name={`${prefix}l_${id}`} defaultValue={level ?? ""} aria-label={`Nivel en ${label}`}>
        <option value="">Nivel…</option>
        {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
      </select>
      <input className={input} name={`${prefix}n_${id}`} inputMode="decimal" placeholder="0–10" defaultValue={numero ?? ""} aria-label={`Calificación en ${label}`} />
    </>
  );
}

// Evaluación de un alumno en un periodo. Cada maestro califica solo sus materias y su parte de lo
// compartido (p. ej. Actitud y conducta), y deja su comentario. La coordinación ve todo.
export default async function EvaluarAlumno({ params }: PageProps<"/panel/producciones/[id]/evaluaciones/[periodo]/[uid]">) {
  const { id, periodo, uid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones/${periodo}/${uid}`);
  if (!can(access, id, "rubrica.gestionar")) redirect(`/panel/producciones/${id}`);
  const me = access.session.userId;
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, evs, roster, restr, maestrosRes, extras] = await Promise.all([
    getRubric(id), getEvaluations(id, { periodo, uid }), supabase.rpc("rubric_roster", { pid: id }),
    supabase.rpc("rubric_restricted", { pid: id }), supabase.rpc("rubric_teacher_list", { pid: id }), periodExtras(periodo, uid),
  ]);
  const alumnos = (roster.data ?? []) as { user_id: string; nombre: string; papeles: string[]; activo: boolean }[];
  const a = alumnos.find((x) => x.user_id === uid);
  const per = periodos.find((p) => p.id === periodo);
  if (!a || !per) notFound();
  const coordina = !restr.data;
  const maestros = (maestrosRes.data ?? []) as { user_id: string; nombre: string; criterios: string[] }[];
  const misMaterias = new Set(maestros.find((m) => m.user_id === me)?.criterios ?? []);
  const puede = (c: { id: string; compartido?: boolean }) => !c.compartido && (coordina || misMaterias.has(c.id));
  const nombreMaestro = new Map(maestros.map((m) => [m.user_id, m.nombre]));
  const nivelDe = new Map(niveles.map((n) => [n.id, n.nombre]));
  const ev = evs[0];
  const sc = (c: string) => ev?.rubric_scores.find((s) => s.criterion_id === c);
  const mio = (c: string) => ev?.rubric_shared_scores.find((s) => s.criterion_id === c && s.teacher_id === me);
  const miNota = ev?.rubric_notes.find((n) => n.teacher_id === me)?.comentario ?? "";
  const next = siguiente(alumnos.filter((x) => x.activo).map((x) => x.user_id), uid);
  const base = `/panel/producciones/${id}/evaluaciones/${periodo}`;
  const pct = extras ? asistenciaPct(extras) : null;
  const ver = (lvl: string | null | undefined, n: number | null | undefined) => [lvl ? nivelDe.get(lvl) : null, n != null ? String(n) : null].filter(Boolean).join(" · ") || "—";

  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro">← {per.nombre}</Link>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-2xl">{a.nombre}</h2>
          <p className="text-sm text-texto-2">{per.nombre} · {a.papeles.join(" · ") || "Integrante"}</p>
        </div>
        {extras && (
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[["Ensayos", extras.citados], ["Asistencias", extras.presentes], ["Retardos", extras.retardos], ["Faltas", extras.faltas], ["Justificadas", extras.justificadas], ["Asistencia", pct == null ? "—" : `${pct} %`]].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-sala p-2"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texto-3">{k}</p><p className="font-black">{v}</p></div>
            ))}
            {extras.incidencias.length > 0 && <p className="text-[#fde68a] sm:col-span-3 lg:col-span-6">{extras.incidencias.length} llamada(s) de atención en el periodo: {extras.incidencias.map((i) => i.descripcion).join(" · ")}</p>}
          </div>
        )}
        <ActionForm action={saveEvaluation} hidden={{ pid: id, periodo, uid, siguiente: next ?? "" }} submit="Guardar evaluación">
          <ul className="flex flex-col gap-3">
            {criterios.map((c) => (
              <li key={c.id} className="grid gap-2 rounded-lg bg-sala p-3 sm:grid-cols-[1fr_200px_110px] sm:items-center">
                <span>
                  <b>{c.nombre}</b>{c.compartido && <span className="text-xs text-texto-3"> · la califican todos los maestros (tu parte)</span>}
                  {c.descripcion && <span className="block text-xs text-texto-3">{c.descripcion}</span>}
                  {c.compartido && coordina && ev && ev.rubric_shared_scores.filter((s) => s.criterion_id === c.id).length > 0 && (
                    <span className="block text-xs text-texto-2">
                      {ev.rubric_shared_scores.filter((s) => s.criterion_id === c.id).map((s) => `${nombreMaestro.get(s.teacher_id) ?? "Maestro"}: ${ver(s.level_id, s.numero)}`).join(" · ")}
                      {" · "}promedio {promedio(ev.rubric_shared_scores.filter((s) => s.criterion_id === c.id)) ?? "—"}
                    </span>
                  )}
                </span>
                {c.compartido ? (
                  <><input type="hidden" name="compartido" value={c.id} /><Campos prefix="s" id={c.id} niveles={niveles} level={mio(c.id)?.level_id} numero={mio(c.id)?.numero} label={c.nombre} /></>
                ) : puede(c) ? (
                  <><input type="hidden" name="criterio" value={c.id} /><Campos prefix="" id={c.id} niveles={niveles} level={sc(c.id)?.level_id} numero={sc(c.id)?.numero} label={c.nombre} /></>
                ) : (
                  <span className="text-sm text-texto-3 sm:col-span-2">{ver(sc(c.id)?.level_id, sc(c.id)?.numero)} <span className="text-xs">(otro maestro)</span></span>
                )}
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Tu comentario (sale con tu nombre y tus materias)
            <textarea className={input} name="nota" rows={3} maxLength={2000} defaultValue={miNota} placeholder="Fortalezas y en qué trabajar." />
          </label>
          {coordina && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Comentario general (coordinación)
              <textarea className={input} name="comentario" rows={3} maxLength={2000} defaultValue={ev?.comentario ?? ""} />
            </label>
          )}
          {coordina && ev && ev.rubric_notes.filter((n) => n.teacher_id !== me).length > 0 && (
            <div className="flex flex-col gap-1 text-sm text-texto-2">
              {ev.rubric_notes.filter((n) => n.teacher_id !== me).map((n) => <p key={n.teacher_id}><b>{nombreMaestro.get(n.teacher_id) ?? "Maestro"}:</b> {n.comentario}</p>)}
            </div>
          )}
          {next && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ir" value="siguiente" defaultChecked /> Al guardar, pasar al siguiente alumno</label>}
        </ActionForm>
      </Card>
    </div>
  );
}
