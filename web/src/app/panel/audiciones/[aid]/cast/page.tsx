import type { Metadata } from "next";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { CastBoard, type Tablero } from "./CastBoard";
import { ResultadosVotacion, type Resultados } from "./ResultadosVotacion";

export const metadata: Metadata = { title: "Cast" };

// Ajuste del cast (0089, 0167): arriba los resultados de la votación; abajo la propuesta para moverla en la junta,
// agregar personajes y mandar las ofertas. Mover y mandar solo Dirección general; los demás lo ven.
export default async function Cast({ params }: PageProps<"/panel/audiciones/[aid]/cast">) {
  const { aid } = await params;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], "/cast");
  if (!["ajuste", "enviado"].includes(a.fase)) {
    return <Card>El cast se arma al cerrar la votación. Ahora la convocatoria va en: <b>{a.fase}</b>.</Card>;
  }
  const supabase = await createClient();
  const [{ data, error }, { data: res }] = await Promise.all([
    supabase.rpc("audition_cast_board", { aid }),
    supabase.rpc("audition_resultados", { aid }),
  ]);
  if (error) return <Card>{error.message}</Card>;
  const t = data as Tablero;
  const fotos = await signPhotos([...t.roles.flatMap((r) => r.asignados), ...t.ensamble, ...t.fuera].map((p) => p.foto_path));
  return (
    <div className="flex flex-col gap-8">
      {res && <ResultadosVotacion r={res as Resultados} />}
      <section aria-label="Cast" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titular text-xl">{a.fase === "enviado" ? "Cast enviado" : "Propuesta del cast"}</h2>
          {/* 0168: el cast como va, antes de mandar, por sección. Cada cambio ya se guarda solo. */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <a href={`/panel/audiciones/${aid}/cast/documento`} className="rounded-full border border-white/25 px-3 py-1.5 hover:border-white/50">Documento del cast (PDF)</a>
            <a href={`/panel/audiciones/${aid}/exportar/cast`} className="rounded-full border border-white/25 px-3 py-1.5 hover:border-white/50">Excel</a>
          </div>
        </div>
        <CastBoard aid={aid} tablero={t} fotos={Object.fromEntries(fotos)} enviado={a.fase === "enviado"} conObra={!!a.production_id} />
      </section>
    </div>
  );
}
