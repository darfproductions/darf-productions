import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getEvaluations, getRubric } from "@/lib/rubric";
import { siguiente } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";
import { saveEvaluation } from "../../actions";

export const metadata: Metadata = { title: "Evaluar alumno" };

// Evaluación de un alumno en un periodo: nivel y número por criterio, más comentario.
export default async function EvaluarAlumno({ params }: PageProps<"/panel/producciones/[id]/evaluaciones/[periodo]/[uid]">) {
  const { id, periodo, uid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones/${periodo}/${uid}`);
  if (!can(access, id, "rubrica.gestionar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, evs, roster] = await Promise.all([getRubric(id), getEvaluations(id, { periodo, uid }), supabase.rpc("rubric_roster", { pid: id })]);
  const alumnos = (roster.data ?? []) as { user_id: string; nombre: string; papeles: string[]; activo: boolean }[];
  const a = alumnos.find((x) => x.user_id === uid);
  const per = periodos.find((p) => p.id === periodo);
  if (!a || !per) notFound();
  const ev = evs[0];
  const sc = (c: string) => ev?.rubric_scores.find((s) => s.criterion_id === c);
  const next = siguiente(alumnos.filter((x) => x.activo).map((x) => x.user_id), uid);
  const base = `/panel/producciones/${id}/evaluaciones/${periodo}`;
  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro">← {per.nombre}</Link>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-2xl">{a.nombre}</h2>
          <p className="text-sm text-texto-2">{per.nombre} · {a.papeles.join(" · ") || "Integrante"}</p>
        </div>
        <ActionForm action={saveEvaluation} hidden={{ pid: id, periodo, uid, siguiente: next ?? "" }} submit="Guardar evaluación">
          <ul className="flex flex-col gap-3">
            {criterios.map((c) => (
              <li key={c.id} className="grid gap-2 rounded-lg bg-sala p-3 sm:grid-cols-[1fr_200px_110px] sm:items-center">
                <input type="hidden" name="criterio" value={c.id} />
                <span><b>{c.nombre}</b>{c.descripcion && <span className="block text-xs text-texto-3">{c.descripcion}</span>}</span>
                <select className={input} name={`l_${c.id}`} defaultValue={sc(c.id)?.level_id ?? ""} aria-label={`Nivel en ${c.nombre}`}>
                  <option value="">Nivel…</option>
                  {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                </select>
                <input className={input} name={`n_${c.id}`} inputMode="decimal" placeholder="0–10" defaultValue={sc(c.id)?.numero ?? ""} aria-label={`Calificación en ${c.nombre}`} />
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Comentario para el alumno
            <textarea className={input} name="comentario" rows={4} maxLength={2000} defaultValue={ev?.comentario ?? ""} placeholder="Fortalezas y en qué trabajar." />
          </label>
          {next && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ir" value="siguiente" defaultChecked /> Al guardar, pasar al siguiente alumno</label>}
        </ActionForm>
      </Card>
    </div>
  );
}
