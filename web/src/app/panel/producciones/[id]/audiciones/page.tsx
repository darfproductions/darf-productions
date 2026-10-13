import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { ESTADO_CONVOCATORIA } from "@/lib/audition-rules";
import { listAuditions } from "@/lib/panel-auditions";
import { can, canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { NewAuditionForm } from "../../../audiciones/NewAuditionForm";

export const metadata: Metadata = { title: "Audiciones" };

// Convocatorias de la obra. Cada una se trabaja en /panel/audiciones/<id>.
export default async function AuditionsPage({ params }: PageProps<"/panel/producciones/[id]/audiciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones`);
  if (!canAny(access, id, ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"])) redirect(`/panel/producciones/${id}`);
  const auditions = await listAuditions(id);
  return (
    <div className="flex flex-col gap-4">
      {auditions.map((a) => (
        <Link key={a.id} href={`/panel/audiciones/${a.id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{ESTADO_CONVOCATORIA[a.estado] ?? a.estado}{a.visibilidad === "enlace" ? " · solo con enlace" : ""}</p>
          <p className="mt-1 text-lg font-bold">{a.titulo}</p>
        </Link>
      ))}
      {auditions.length === 0 && <Card>Esta obra aún no tiene convocatorias.</Card>}
      {can(access, id, "audiciones.gestionar") && (
        <Card>
          <h2 className="titular mb-3 text-xl">Nueva convocatoria</h2>
          <NewAuditionForm pid={id} />
        </Card>
      )}
    </div>
  );
}
