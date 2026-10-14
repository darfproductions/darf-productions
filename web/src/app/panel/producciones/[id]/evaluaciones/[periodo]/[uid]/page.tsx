import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { ESTADO_PROPUESTA, getEvaluations, getPropuestas, getRubric, misMateriasAsistente, periodExtras, type Propuesta } from "@/lib/rubric";
import { asistenciaPct, promedio, siguiente, type Nivel } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { proponerCalificacion, resolverPropuesta, retirarPropuesta, saveEvaluation } from "../../actions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Evaluar alumno" };

function Campos({ prefix, id, niveles, level, numero, label }: { prefix: string; id: string; niveles: Nivel[]; level?: string | null; numero?: number | null; label: string }) {
  return (
    <>
      <select key={level ?? ""} className={input} name={`${prefix}l_${id}`} defaultValue={level ?? ""} aria-label={`Nivel en ${label}`}>
        <option value="">Nivel…</option>
        {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
      </select>
      <input className={input} name={`${prefix}n_${id}`} inputMode="decimal" placeholder="0–10" defaultValue={numero ?? ""} aria-label={`Calificación en ${label}`} />
    </>
  );
}

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

/** Lo que propone un asistente, en texto: "Bien · 8.5". */
function valor(q: { level_id: string | null; numero: number | null }, niveles: Nivel[]) {
  return [q.level_id ? niveles.find((n) => n.id === q.level_id)?.nombre : null, q.numero != null ? String(q.numero) : null].filter(Boolean).join(" · ") || "—";
}

// Asistente artístico (0100): propone en sus materias; el maestro de la materia aprueba o corrige.
async function ProponerAlumno({ id, periodo, uid, me }: { id: string; periodo: string; uid: string; me: string }) {
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, roster, props, mias] = await Promise.all([
    getRubric(id), supabase.rpc("rubric_roster_asistente", { pid: id }), getPropuestas(periodo), misMateriasAsistente(id, me),
  ]);
  const a = ((roster.data ?? []) as { user_id: string; nombre: string }[]).find((x) => x.user_id === uid);
  const per = periodos.find((p) => p.id === periodo);
  if (!a || !per) notFound();
  const materias = criterios.filter((c) => mias.includes(c.id));
  const base = `/panel/producciones/${id}/evaluaciones/${periodo}`;
  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> {per.nombre}</Link>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-2xl">{a.nombre}</h2>
          <p className="text-sm text-texto-2">{per.nombre} · tu propuesta la aprueba o corrige el maestro de la materia. Hasta entonces no cuenta en la boleta.</p>
        </div>
        {per.publicado_at && <p className="text-sm text-aviso">Este periodo ya se publicó: ya no se proponen calificaciones.</p>}
        {materias.length === 0 && <p className="text-sm text-texto-3">Aún no tienes materias asignadas.</p>}
        {materias.map((c) => {
          const q = props.find((x) => x.user_id === uid && x.criterion_id === c.id && x.proposed_by === me);
          const editable = !per.publicado_at && (!q || q.estado === "pendiente");
          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg bg-sala p-3">
              <p><b>{c.nombre}</b>{q && <span className={`ml-2 text-xs font-bold ${ESTADO_PROPUESTA[q.estado].cls}`}>{ESTADO_PROPUESTA[q.estado].label}</span>}</p>
              {c.descripcion && <p className="text-xs text-texto-3">{c.descripcion}</p>}
              {q && !editable && <p className="text-sm text-texto-2">Propusiste: {valor(q, niveles)}{q.comentario ? ` · ${q.comentario}` : ""}</p>}
              {editable && (
                <ActionForm action={proponerCalificacion} hidden={{ pid: id, periodo, uid, crit: c.id }} submit={q ? "Cambiar propuesta" : "Enviar propuesta"}>
                  <div className="grid gap-2 sm:grid-cols-[200px_110px]">
                    <select key={`${q?.level_id ?? ""}-${q?.updated_at ?? ""}`} className={input} name="nivel" defaultValue={q?.level_id ?? ""} aria-label={`Nivel en ${c.nombre}`}>
                      <option value="">Nivel…</option>
                      {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                    </select>
                    <input className={input} name="numero" inputMode="decimal" placeholder="0–10" defaultValue={q?.numero ?? ""} aria-label={`Calificación en ${c.nombre}`} />
                  </div>
                  <textarea className={input} name="comentario" rows={2} maxLength={1000} defaultValue={q?.comentario ?? ""} placeholder="Nota para el maestro (opcional): qué observaste." />
                </ActionForm>
              )}
              {q && q.estado === "pendiente" && !per.publicado_at && (
                <ActionForm inline action={retirarPropuesta} hidden={{ pid: id, qid: q.id }} confirm="¿Retirar tu propuesta?" submit="Retirar" submitClass={`${small} self-start`} />
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** Propuesta pendiente de un asistente: el maestro la aprueba tal cual, la corrige o la rechaza. */
function RevisarPropuesta({ q, pid, niveles, materia }: { q: Propuesta; pid: string; niveles: Nivel[]; materia: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-sala p-3 text-sm">
      <p><b>{materia}</b> · propuesta de {q.asistente}: <b>{valor(q, niveles)}</b></p>
      {q.comentario && <p className="text-texto-2">“{q.comentario}”</p>}
      <div className="flex flex-wrap items-end gap-2">
        <ActionForm inline action={resolverPropuesta} hidden={{ pid, qid: q.id, accion: "aprobar" }} submit={<><Icono nombre="check" /> Aprobar</>} submitClass="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala" />
        <ActionForm inline action={resolverPropuesta} hidden={{ pid, qid: q.id, accion: "rechazar" }} confirm="¿Rechazar la propuesta? La calificación no cambia." submit="Rechazar" submitClass={small} />
      </div>
      <ActionForm inline action={resolverPropuesta} hidden={{ pid, qid: q.id, accion: "corregir" }} submit="Corregir y aprobar" submitClass={small}>
        <select className={input} name="nivel" defaultValue={q.level_id ?? ""} aria-label={`Nivel corregido en ${materia}`}>
          <option value="">Nivel…</option>
          {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
        <input className={`${input} w-24`} name="numero" inputMode="decimal" placeholder="0–10" defaultValue={q.numero ?? ""} aria-label={`Calificación corregida en ${materia}`} />
      </ActionForm>
    </li>
  );
}

// Evaluación de un alumno en un periodo. Cada maestro califica solo sus materias y su parte de lo
// compartido (p. ej. Actitud y conducta), y deja su comentario. La coordinación ve todo.
export default async function EvaluarAlumno({ params }: PageProps<"/panel/producciones/[id]/evaluaciones/[periodo]/[uid]">) {
  const { id, periodo, uid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones/${periodo}/${uid}`);
  const gestiona = can(access, id, "rubrica.gestionar");
  if (!gestiona && !can(access, id, "rubrica.proponer")) redirect(`/panel/producciones/${id}`);
  const me = access.session.userId;
  const supabase = await createClient();
  if (!(await supabase.rpc("rubric_active", { pid: id })).data) redirect(`/panel/producciones/${id}/evaluaciones`);
  if (!gestiona) return <ProponerAlumno id={id} periodo={periodo} uid={uid} me={me} />;
  const [{ criterios, niveles, periodos }, evs, roster, restr, maestrosRes, extras, props] = await Promise.all([
    getRubric(id), getEvaluations(id, { periodo, uid }), supabase.rpc("rubric_roster", { pid: id }),
    supabase.rpc("rubric_restricted", { pid: id }), supabase.rpc("rubric_teacher_list", { pid: id }), periodExtras(periodo, uid), getPropuestas(periodo),
  ]);
  const [{ data: publica }, { data: miEntrega }] = await Promise.all([
    supabase.rpc("rubric_puede_publicar", { pid: id }),
    supabase.from("rubric_entregas").select("estado").eq("period_id", periodo).eq("teacher_id", me).maybeSingle(),
  ]);
  const alumnos = (roster.data ?? []) as { user_id: string; nombre: string; papeles: string[]; activo: boolean }[];
  const a = alumnos.find((x) => x.user_id === uid);
  const per = periodos.find((p) => p.id === periodo);
  if (!a || !per) notFound();
  const coordina = !restr.data;
  // Corrige lo de todos (lo compartido y comentarios de otros maestros): el admin y quien aprueba las boletas (0101).
  const director = access.isDirector || !!publica;
  // Con la entrega hecha, el maestro ya no cambia lo suyo (se lo regresan para editar).
  const bloqueado = !!restr.data && !publica && miEntrega?.estado === "entregada";
  const maestros = (maestrosRes.data ?? []) as { user_id: string; nombre: string; criterios: string[] }[];
  const misMaterias = new Set(maestros.find((m) => m.user_id === me)?.criterios ?? []);
  const puede = (c: { id: string; compartido?: boolean }) => !c.compartido && (director || coordina || misMaterias.has(c.id));
  const nombreMaestro = new Map(maestros.map((m) => [m.user_id, m.nombre]));
  const nivelDe = new Map(niveles.map((n) => [n.id, n.nombre]));
  const ev = evs[0];
  const sc = (c: string) => ev?.rubric_scores.find((s) => s.criterion_id === c);
  const mio = (c: string) => ev?.rubric_shared_scores.find((s) => s.criterion_id === c && s.teacher_id === me);
  const miNota = ev?.rubric_notes.find((n) => n.teacher_id === me)?.comentario ?? "";
  const next = siguiente(alumnos.filter((x) => x.activo).map((x) => x.user_id), uid);
  const base = `/panel/producciones/${id}/evaluaciones/${periodo}`;
  const pct = extras ? asistenciaPct(extras) : null;
  const deAlumno = props.filter((q) => q.user_id === uid);
  const pendientes = bloqueado ? [] : deAlumno.filter((q) => q.estado === "pendiente");
  const ver = (lvl: string | null | undefined, n: number | null | undefined) => [lvl ? nivelDe.get(lvl) : null, n != null ? String(n) : null].filter(Boolean).join(" · ") || "—";

  const campos = (
    <>
          <ul className="flex flex-col gap-3">
            {criterios.map((c) => (
              <li key={c.id} className="grid gap-2 rounded-lg bg-sala p-3 sm:grid-cols-[1fr_200px_110px] sm:items-center">
                <span>
                  <b>{c.nombre}</b>{c.compartido && <span className="text-xs text-texto-3"> · la califican todos los maestros (tu parte)</span>}
                  {c.descripcion && <span className="block text-xs text-texto-3">{c.descripcion}</span>}
                  {deAlumno.filter((q) => q.criterion_id === c.id && q.estado !== "pendiente").map((q) => (
                    <span key={q.id} className="block text-xs text-texto-3">Propuesta de {q.asistente}: {valor(q, niveles)} · {ESTADO_PROPUESTA[q.estado].label.toLowerCase()}</span>
                  ))}
                  {c.compartido && director && ev && ev.rubric_shared_scores.filter((s) => s.criterion_id === c.id && s.teacher_id !== me).map((s) => (
                    <span key={s.teacher_id} className="mt-1 grid items-center gap-2 text-xs sm:grid-cols-[1fr_150px_80px]">
                      <span>{nombreMaestro.get(s.teacher_id) ?? "Maestro"}:</span>
                      <select className={input} name={`ol_${c.id}__${s.teacher_id}`} defaultValue={s.level_id ?? ""} aria-label="Nivel">
                        <option value="">Nivel…</option>
                        {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                      </select>
                      <input className={input} name={`on_${c.id}__${s.teacher_id}`} inputMode="decimal" defaultValue={s.numero ?? ""} aria-label="Calificación" />
                    </span>
                  ))}
                  {c.compartido && coordina && !director && ev && ev.rubric_shared_scores.filter((s) => s.criterion_id === c.id).length > 0 && (
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
          {ev && ev.rubric_notes.filter((n) => n.teacher_id !== me).length > 0 && (director ? (
            ev.rubric_notes.filter((n) => n.teacher_id !== me).map((n) => (
              <label key={n.teacher_id} className="flex flex-col gap-1.5 text-sm font-semibold">Comentario de {nombreMaestro.get(n.teacher_id) ?? "maestro"} (corrección del Director)
                <textarea className={input} name={`onota_${n.teacher_id}`} rows={2} maxLength={2000} defaultValue={n.comentario} />
              </label>
            ))
          ) : coordina ? (
            <div className="flex flex-col gap-1 text-sm text-texto-2">
              {ev.rubric_notes.filter((n) => n.teacher_id !== me).map((n) => <p key={n.teacher_id}><b>{nombreMaestro.get(n.teacher_id) ?? "Maestro"}:</b> {n.comentario}</p>)}
            </div>
          ) : null)}
          {next && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ir" value="siguiente" defaultChecked /> Al guardar, pasar al siguiente alumno</label>}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> {per.nombre}</Link>
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
            {extras.incidencias.length > 0 && <p className="text-aviso sm:col-span-3 lg:col-span-6">{extras.incidencias.length} llamada(s) de atención en el periodo: {extras.incidencias.map((i) => i.descripcion).join(" · ")}</p>}
          </div>
        )}
        {pendientes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-bold">Propuestas por revisar</h3>
            <p className="text-xs text-texto-3">Calificaciones que propuso un asistente artístico. No cuentan hasta que las apruebas; puedes corregirlas antes.</p>
            <ul className="flex flex-col gap-2">
              {pendientes.map((q) => <RevisarPropuesta key={q.id} q={q} pid={id} niveles={niveles} materia={criterios.find((c) => c.id === q.criterion_id)?.nombre ?? "Materia"} />)}
            </ul>
          </div>
        )}
        {bloqueado && <p className="rounded-lg bg-sala p-3 text-sm"><Icono nombre="candado" /> Ya entregaste tus calificaciones de este periodo. Si hay que cambiar algo, pide que te las regresen.</p>}
        {bloqueado ? <fieldset disabled className="flex flex-col gap-3 opacity-70">{campos}</fieldset> : (
          <ActionForm action={saveEvaluation} hidden={{ pid: id, periodo, uid, siguiente: next ?? "" }} submit="Guardar evaluación">{campos}</ActionForm>
        )}
      </Card>
    </div>
  );
}
