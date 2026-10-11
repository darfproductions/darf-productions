import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ESTADO_CONVOCATORIA } from "@/lib/audition-rules";
import { listAuditions } from "@/lib/panel-auditions";
import { can, canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createAudition } from "./actions";

export const metadata: Metadata = { title: "Audiciones" };

// Convocatorias de la obra.
export default async function AuditionsPage({ params }: PageProps<"/panel/producciones/[id]/audiciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones`);
  if (!canAny(access, id, ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"])) redirect(`/panel/producciones/${id}`);
  const auditions = await listAuditions(id);
  return (
    <div className="flex flex-col gap-4">
      {auditions.map((a) => (
        <Link key={a.id} href={`/panel/producciones/${id}/audiciones/${a.id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{ESTADO_CONVOCATORIA[a.estado] ?? a.estado}</p>
          <p className="mt-1 text-lg font-bold">{a.titulo}</p>
        </Link>
      ))}
      {auditions.length === 0 && <Card>Esta obra aún no tiene convocatorias.</Card>}
      {can(access, id, "audiciones.gestionar") && (
        <Card>
          <h2 className="titular mb-3 text-xl">Nueva convocatoria</h2>
          <ActionForm action={createAudition} hidden={{ pid: id }} submit="Crear (en borrador)">
            <input className={`${input} max-w-md`} name="titulo" required placeholder="Audición general 2027" />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
