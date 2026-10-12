import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getEvaluations, getRubric } from "@/lib/rubric";
import { completa } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { publishPeriod, removeRubricItem, saveRubricItem, seedRubric } from "./actions";

export const metadata: Metadata = { title: "Evaluaciones" };

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

function Lista({ pid, tipo, titulo, ayuda, items, conDescripcion }: {
  pid: string; tipo: "criterio" | "nivel"; titulo: string; ayuda: string; items: { id: string; nombre: string; descripcion?: string | null }[]; conDescripcion?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div><h2 className="titular text-xl">{titulo}</h2><p className="text-sm text-texto-2">{ayuda}</p></div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-end gap-2">
            <ActionForm inline action={saveRubricItem} hidden={{ pid, tipo, id: it.id }} submit="Guardar" submitClass={small}>
              <input className={input} name="nombre" defaultValue={it.nombre} maxLength={80} aria-label="Nombre" />
              {conDescripcion && <input className={`${input} min-w-[220px]`} name="descripcion" defaultValue={it.descripcion ?? ""} placeholder="Qué se observa (opcional)" maxLength={300} />}
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

// Rúbrica del taller: criterios, niveles y periodos; avance de evaluación y publicación.
export default async function Evaluaciones({ params }: PageProps<"/panel/producciones/[id]/evaluaciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones`);
  if (!can(access, id, "rubrica.gestionar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, evs, roster] = await Promise.all([
    getRubric(id), getEvaluations(id), supabase.rpc("rubric_roster", { pid: id }),
  ]);
  const alumnos = ((roster.data ?? []) as { user_id: string; activo: boolean }[]).filter((a) => a.activo);
  const hechas = (pid: string) => evs.filter((e) => e.period_id === pid && completa(criterios, e.rubric_scores)).length;

  return (
    <div className="flex flex-col gap-4">
      {criterios.length === 0 && niveles.length === 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-texto-2">¿Empiezas con la rúbrica básica? (Actuación, Canto, Baile, Disciplina, Trabajo en equipo · Excelente, Bien, En proceso, Necesita apoyo). Luego la ajustas.</p>
          <ActionForm inline action={seedRubric} hidden={{ pid: id }} submit="Usar rúbrica básica" />
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="titular text-xl">Periodos</h2>
          <p className="text-sm text-texto-2">Ej. Bimestre 1, Bimestre 2, Final. Evalúa a cada alumno y, cuando esté listo, publica: el alumno lo verá en su portal con su boleta en PDF.</p>
        </div>
        <ul className="flex flex-col divide-y divide-white/10">
          {periodos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <b>{p.nombre}</b>{" "}
                <span className={`text-xs ${p.publicado_at ? "text-[#7ee2a8]" : "text-texto-3"}`}>{p.publicado_at ? "Publicado" : "Sin publicar"}</span>
                <span className="block text-xs text-texto-3">{hechas(p.id)} de {alumnos.length} alumnos evaluados</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/panel/producciones/${id}/evaluaciones/${p.id}`} className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">Evaluar</Link>
                <ActionForm inline action={publishPeriod} hidden={{ pid: id, id: p.id, publicar: p.publicado_at ? "no" : "si" }} submit={p.publicado_at ? "Ocultar" : "Publicar"} submitClass={small}
                  confirm={p.publicado_at ? undefined : `¿Publicar “${p.nombre}”? Cada alumno verá su evaluación.`} />
                <ActionForm inline action={removeRubricItem} hidden={{ pid: id, tipo: "periodo", id: p.id }} confirm={`¿Quitar “${p.nombre}” y todas sus evaluaciones?`} submit="Quitar" submitClass={small} />
              </span>
            </li>
          ))}
          {periodos.length === 0 && <li className="py-2 text-sm text-texto-3">Aún no hay periodos.</li>}
        </ul>
        <ActionForm inline action={saveRubricItem} hidden={{ pid: id, tipo: "periodo" }} submit="Agregar periodo" submitClass={small}>
          <input className={input} name="nombre" placeholder="Bimestre 1" maxLength={60} />
        </ActionForm>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lista pid={id} tipo="criterio" titulo="Criterios" ayuda="Lo que se evalúa a cada alumno." items={criterios} conDescripcion />
        <Lista pid={id} tipo="nivel" titulo="Niveles" ayuda="Del mejor al que necesita más apoyo. Además de nivel, cada criterio lleva número de 0 a 10." items={niveles} />
      </div>
    </div>
  );
}
