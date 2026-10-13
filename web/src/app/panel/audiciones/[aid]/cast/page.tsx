import type { Metadata } from "next";
import { Card } from "@/components/panel/ui";
import { requireAudition, signPhotos } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { CastBoard, type Tablero } from "./CastBoard";

export const metadata: Metadata = { title: "Cast" };

// Ajuste del cast (0089): la propuesta de la votación, para moverla y mandar las ofertas.
export default async function Cast({ params }: PageProps<"/panel/audiciones/[aid]/cast">) {
  const { aid } = await params;
  const { a } = await requireAudition(aid, ["audiciones.gestionar"], "/cast");
  if (!["ajuste", "enviado"].includes(a.fase)) {
    return <Card>El cast se arma al cerrar la votación. Ahora la convocatoria va en: <b>{a.fase}</b>.</Card>;
  }
  const { data, error } = await (await createClient()).rpc("audition_cast_board", { aid });
  if (error) return <Card>{error.message}</Card>;
  const t = data as Tablero;
  const fotos = await signPhotos([...t.roles.flatMap((r) => r.asignados), ...t.ensamble, ...t.fuera].map((p) => p.foto_path));
  return <CastBoard aid={aid} tablero={t} fotos={Object.fromEntries(fotos)} enviado={a.fase === "enviado"} conObra={!!a.production_id} />;
}
