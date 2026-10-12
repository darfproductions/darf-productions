import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getEvaluations, getRubric } from "@/lib/rubric";
import { completa, filasBoleta, promedio } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Evaluar" };

// Alumnos de un periodo: quién falta, promedio y acceso a su evaluación y boleta.
export default async function Periodo({ params }: PageProps<"/panel/producciones/[id]/evaluaciones/[periodo]">) {
  const { id, periodo } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/evaluaciones/${periodo}`);
  if (!can(access, id, "rubrica.gestionar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, evs, roster] = await Promise.all([getRubric(id), getEvaluations(id, { periodo }), supabase.rpc("rubric_roster", { pid: id })]);
  const per = periodos.find((p) => p.id === periodo);
  if (!per) notFound();
  const alumnos = (roster.data ?? []) as { user_id: string; nombre: string; papeles: string[]; activo: boolean }[];
  const base = `/panel/producciones/${id}/evaluaciones`;
  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm font-bold text-violeta-claro">← Evaluaciones</Link>
      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">{per.nombre} {per.publicado_at && <span className="text-sm font-normal text-[#7ee2a8]">· publicado</span>}</h2>
        {criterios.length === 0 && <p className="text-sm text-[#fde68a]">Primero agrega criterios a la rúbrica.</p>}
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
                  <span className={`text-xs font-bold ${ok ? "text-[#7ee2a8]" : ev ? "text-[#fde68a]" : "text-texto-3"}`}>
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
