import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getEvaluations, getRubric, misMateriasAsistente } from "@/lib/rubric";
import { completa } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { publishPeriod, removeRubricItem, saveRubricItem, seedRubric, setAsistenteMaterias, setTeacherCriteria, toggleRubric } from "./actions";

export const metadata: Metadata = { title: "Evaluaciones" };

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

function Lista({ pid, tipo, titulo, ayuda, items, conDescripcion, edita }: {
  pid: string; tipo: "criterio" | "nivel"; titulo: string; ayuda: string; items: { id: string; nombre: string; descripcion?: string | null; compartido?: boolean }[]; conDescripcion?: boolean; edita: boolean;
}) {
  if (!edita) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">{titulo}</h2>
        <ul className="flex flex-col gap-1 text-sm">{items.map((it) => <li key={it.id}>{it.nombre}{it.compartido && <span className="text-texto-3"> · la califican todos los maestros</span>}</li>)}</ul>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <div><h2 className="titular text-xl">{titulo}</h2><p className="text-sm text-texto-2">{ayuda}</p></div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-end gap-2">
            <ActionForm inline action={saveRubricItem} hidden={{ pid, tipo, id: it.id }} submit="Guardar" submitClass={small}>
              <input className={input} name="nombre" defaultValue={it.nombre} maxLength={80} aria-label="Nombre" />
              {conDescripcion && <input className={`${input} min-w-[220px]`} name="descripcion" defaultValue={it.descripcion ?? ""} placeholder="Qué se observa (opcional)" maxLength={300} />}
              {tipo === "criterio" && (
                <label className="flex items-center gap-1.5 text-xs" title="Cada maestro la califica y se promedia (ej. Actitud y conducta)">
                  <input type="hidden" name="compartido" value="off" /><input type="checkbox" name="compartido" value="on" defaultChecked={it.compartido} /> Todos los maestros
                </label>
              )}
            </ActionForm>
            <ActionForm inline action={removeRubricItem} hidden={{ pid, tipo, id: it.id }} confirm={`¿Quitar “${it.nombre}”? Se borran sus calificaciones.`} submit="Quitar" submitClass={small} />
          </li>
        ))}
      </ul>
      <ActionForm inline action={saveRubricItem} hidden={{ pid, tipo }} submit="Agregar" submitClass={small}>
        <input className={input} name="nombre" placeholder={tipo === "criterio" ? "Nuevo criterio" : "Nuevo nivel"} maxLength={80} />
      </ActionForm>
    </Card>
  );
}

// Asistente artístico (0100): ve sus materias y los periodos para proponer calificaciones.
async function InicioAsistente({ id, uid, activa }: { id: string; uid: string; activa: boolean }) {
  if (!activa) return <Card className="text-sm text-texto-2">Las evaluaciones están apagadas en esta obra.</Card>;
  const [{ criterios, periodos }, mias] = await Promise.all([getRubric(id), misMateriasAsistente(id, uid)]);
  const nombres = criterios.filter((c) => mias.includes(c.id)).map((c) => c.nombre);
  return (
    <div className="flex flex-col gap-4">
      <Card className="text-sm">
        {nombres.length ? <>Propones calificaciones en: <b>{nombres.join(", ")}</b>. </> : <>Aún no tienes materias asignadas: pídeselas a la coordinación del taller. </>}
        El maestro de cada materia aprueba o corrige tu propuesta; hasta entonces no cuenta en la boleta.
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Periodos</h2>
        <ul className="flex flex-col divide-y divide-white/10">
          {periodos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><b>{p.nombre}</b> <span className={`text-xs ${p.publicado_at ? "text-exito" : "text-texto-3"}`}>{p.publicado_at ? "Publicado (ya no se proponen)" : "Abierto"}</span></span>
              {!p.publicado_at && nombres.length > 0 && <Link href={`/panel/producciones/${id}/evaluaciones/${p.id}`} className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">Proponer</Link>}
            </li>
          ))}
          {periodos.length === 0 && <li className="py-2 text-sm text-texto-3">Aún no hay periodos.</li>}
        </ul>
      </Card>
    </div>
  );
}

// Rúbrica del taller: criterios, niveles y periodos; avance de evaluación y publicación.
export default async function Evaluaciones({ params }: PageProps<"/panel/producciones/[id]/evaluaciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones`);
  const gestiona = can(access, id, "rubrica.gestionar");
  if (!gestiona && !can(access, id, "rubrica.proponer")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data: activa } = await supabase.rpc("rubric_active", { pid: id });
  if (!gestiona) return <InicioAsistente id={id} uid={access.session.userId} activa={!!activa} />;
  const encender = access.isDirector || can(access, id, "obra.publicar");
  if (!activa) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Evaluaciones apagadas en esta obra</h2>
        <p className="text-sm text-texto-2">Enciéndelas si esta obra es un taller con calificaciones (rúbrica, maestros, periodos y boletas). Lo que ya se haya capturado se conserva.</p>
        {encender ? <ActionForm inline action={toggleRubric} hidden={{ pid: id, on: "si" }} submit="Encender evaluaciones" />
          : <p className="text-sm text-texto-3">Pide a la Dirección de la obra o al Director que las encienda.</p>}
      </Card>
    );
  }
  const [{ criterios, niveles, periodos }, evs, roster, restr, maestrosRes, asistRes] = await Promise.all([
    getRubric(id), getEvaluations(id), supabase.rpc("rubric_roster", { pid: id }), supabase.rpc("rubric_restricted", { pid: id }),
    supabase.rpc("rubric_teacher_list", { pid: id }), supabase.rpc("rubric_assistant_list", { pid: id }),
  ]);
  const [{ data: publica }, { data: entregasRes }] = await Promise.all([
    supabase.rpc("rubric_puede_publicar", { pid: id }),
    supabase.from("rubric_entregas").select("period_id, estado").eq("production_id", id),
  ]);
  const entregas = (entregasRes ?? []) as { period_id: string; estado: string }[];
  const coordina = !restr.data;
  const maestros = (maestrosRes.data ?? []) as { user_id: string; nombre: string; criterios: string[] }[];
  const asistentes = (asistRes.data ?? []) as { user_id: string; nombre: string; criterios: string[] }[];
  const yo = maestros.find((m) => m.user_id === access.session.userId);
  const materias = criterios.filter((c) => !c.compartido);
  const alumnos = ((roster.data ?? []) as { user_id: string; activo: boolean }[]).filter((a) => a.activo);
  const conMaterias = maestros.filter((m) => m.criterios.length > 0).length;
  const estadoPeriodo = (p: { id: string; publicado_at: string | null }) => {
    if (p.publicado_at) return { texto: "Publicado", cls: "text-exito" };
    const n = entregas.filter((e) => e.period_id === p.id && e.estado === "entregada").length;
    if (n === 0) return { texto: "En captura", cls: "text-texto-3" };
    return { texto: `En revisión · ${n} de ${conMaterias} ${conMaterias === 1 ? "maestro entregó" : "maestros entregaron"}`, cls: "text-aviso" };
  };
  const hechas = (pid: string) => evs.filter((e) => e.period_id === pid && completa(criterios, e.rubric_scores, e.rubric_shared_scores)).length;

  return (
    <div className="flex flex-col gap-4">
      {encender && (
        <div className="flex justify-end">
          <ActionForm inline action={toggleRubric} hidden={{ pid: id, on: "no" }} confirm="¿Apagar las evaluaciones? Los maestros no podrán capturar y los alumnos dejarán de ver sus boletas (se conservan)." submit="Apagar evaluaciones" submitClass={small} />
        </div>
      )}
      {!coordina && (
        <Card className="text-sm">
          Calificas: <b>{criterios.filter((c) => yo?.criterios.includes(c.id)).map((c) => c.nombre).join(", ") || "—"}</b>
          {criterios.some((c) => c.compartido) && <> y tu parte de <b>{criterios.filter((c) => c.compartido).map((c) => c.nombre).join(", ")}</b></>}.
          La rúbrica, las fechas y la publicación las maneja la coordinación.
        </Card>
      )}
      {coordina && criterios.length === 0 && niveles.length === 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-texto-2">¿Empiezas con la rúbrica básica? (Actuación, Canto, Baile y Actitud y conducta, que califican todos los maestros · Excelente, Bien, En proceso, Necesita apoyo). Luego la ajustas.</p>
          <ActionForm inline action={seedRubric} hidden={{ pid: id }} submit="Usar rúbrica básica" />
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="titular text-xl">Periodos</h2>
          <p className="text-sm text-texto-2">Ej. Bimestre 1, Bimestre 2, Final. Cada maestro califica y <b>entrega</b> sus calificaciones; la coordinación y la Dirección de la obra las revisan, y la Dirección de la obra aprueba y publica: el alumno lo verá en su portal con su boleta en PDF.</p>
          {!publica && <p className="text-xs text-texto-3">Las boletas las aprueba y publica la Dirección de la obra.</p>}
        </div>
        <ul className="flex flex-col divide-y divide-white/10">
          {periodos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <b>{p.nombre}</b>{" "}
                <span className={`text-xs ${estadoPeriodo(p).cls}`}>{estadoPeriodo(p).texto}</span>
                <span className="block text-xs text-texto-3">{p.desde || p.hasta ? `${p.desde ?? "…"} a ${p.hasta ?? "…"} · ` : "Sin fechas (cuenta toda la asistencia) · "}{hechas(p.id)} de {alumnos.length} alumnos completos</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/panel/producciones/${id}/evaluaciones/${p.id}`} className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">Evaluar</Link>
                {publica && <ActionForm inline action={publishPeriod} hidden={{ pid: id, id: p.id, publicar: p.publicado_at ? "no" : "si" }} submit={p.publicado_at ? "Ocultar" : "Aprobar y publicar"} submitClass={small}
                  confirm={p.publicado_at ? undefined : `¿Aprobar y publicar “${p.nombre}”? Cada alumno verá su evaluación y su boleta.`} />}
                {coordina && <ActionForm inline action={removeRubricItem} hidden={{ pid: id, tipo: "periodo", id: p.id }} confirm={`¿Quitar “${p.nombre}” y todas sus evaluaciones?`} submit="Quitar" submitClass={small} />}
              </span>
              {coordina && (
                <div className="w-full">
                  <ActionForm inline action={saveRubricItem} hidden={{ pid: id, tipo: "periodo", id: p.id }} submit="Guardar fechas" submitClass={small}>
                    <input className={input} name="nombre" defaultValue={p.nombre} maxLength={60} aria-label="Nombre del periodo" />
                    <label className="flex items-center gap-1 text-xs">Del <input className={input} type="date" name="desde" defaultValue={p.desde ?? ""} /></label>
                    <label className="flex items-center gap-1 text-xs">al <input className={input} type="date" name="hasta" defaultValue={p.hasta ?? ""} /></label>
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
          {periodos.length === 0 && <li className="py-2 text-sm text-texto-3">Aún no hay periodos.</li>}
        </ul>
        {coordina && (
          <ActionForm inline action={saveRubricItem} hidden={{ pid: id, tipo: "periodo" }} submit="Agregar periodo" submitClass={small}>
            <input className={input} name="nombre" placeholder="Bimestre 1" maxLength={60} />
            <label className="flex items-center gap-1 text-xs">Del <input className={input} type="date" name="desde" /></label>
            <label className="flex items-center gap-1 text-xs">al <input className={input} type="date" name="hasta" /></label>
          </ActionForm>
        )}
        <p className="text-xs text-texto-3">Las fechas definen qué ensayos, faltas, retardos y llamadas de atención salen en la boleta de ese periodo.</p>
      </Card>

      {coordina && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Maestros y materias</h2>
            <p className="text-sm text-texto-2">Asigna a cada maestro sus materias: solo podrá calificar esas (y su parte de lo que califican todos). Un maestro sin materias coordina toda la rúbrica. Para que aparezca aquí, dale el rol Maestro en Permisos.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {maestros.map((m) => (
              <li key={m.user_id} className="rounded-lg bg-sala p-3">
                <ActionForm action={setTeacherCriteria} hidden={{ pid: id, uid: m.user_id }} submit="Guardar materias" submitClass={small}>
                  <p className="font-bold">{m.nombre} {!m.criterios.length && <span className="text-xs font-normal text-aviso">· coordina (sin materias)</span>}</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {materias.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5"><input type="checkbox" name="crit" value={c.id} defaultChecked={m.criterios.includes(c.id)} /> {c.nombre}</label>
                    ))}
                  </div>
                </ActionForm>
              </li>
            ))}
            {maestros.length === 0 && <li className="text-sm text-texto-3">Aún no hay nadie con el rol Maestro en esta obra.</li>}
          </ul>
        </Card>
      )}

      {coordina && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Asistentes y materias</h2>
            <p className="text-sm text-texto-2">Los asistentes artísticos (de dirección vocal, de coreografía…) proponen calificaciones solo en las materias que les asignes. El maestro de la materia las aprueba, las corrige o las rechaza; hasta entonces no cuentan. Para que aparezca aquí, dale el rol Asistente artístico en Permisos.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {asistentes.map((m) => (
              <li key={m.user_id} className="rounded-lg bg-sala p-3">
                <ActionForm action={setAsistenteMaterias} hidden={{ pid: id, uid: m.user_id }} submit="Guardar materias" submitClass={small}>
                  <p className="font-bold">{m.nombre} {!m.criterios.length && <span className="text-xs font-normal text-texto-3">· sin materias (no propone)</span>}</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {materias.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5"><input type="checkbox" name="crit" value={c.id} defaultChecked={m.criterios.includes(c.id)} /> {c.nombre}</label>
                    ))}
                  </div>
                </ActionForm>
              </li>
            ))}
            {asistentes.length === 0 && <li className="text-sm text-texto-3">Aún no hay nadie con el rol Asistente artístico en esta obra.</li>}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Lista pid={id} tipo="criterio" titulo="Materias" ayuda="Lo que se evalúa. Marca “Todos los maestros” en la que califican todos y se promedia (ej. Actitud y conducta)." items={criterios} conDescripcion edita={coordina} />
        <Lista pid={id} tipo="nivel" titulo="Niveles" ayuda="Del mejor al que necesita más apoyo. Además de nivel, cada materia lleva número de 0 a 10." items={niveles} edita={coordina} />
      </div>
    </div>
  );
}
