import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { PrintButton } from "@/components/PrintButton";
import type { Expediente } from "@/lib/evaluaciones-rules";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { Encabezado, Votos } from "../../expediente/Secciones";

export const metadata: Metadata = { title: "Votación en PDF" };

// Votación en PDF (0166): por personaje, los totales y qué votó cada juez. Solo la dirección, ya cerrada la votación.
export default async function VotacionPdf({ params }: PageProps<"/panel/audiciones/[aid]/votacion/pdf">) {
  const { aid } = await params;
  await requireAudition(aid, ["audiciones.gestionar"], "/votacion/pdf");
  const { data, error } = await (await createClient()).rpc("audition_expediente", { aid });
  if (error) return <Card>{error.message}</Card>;
  const e = data as Expediente;
  return (
    <div className="flex flex-col gap-5 print:gap-4 print:text-black">
      <Card className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/panel/audiciones/${aid}/votacion`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Votación</Link>
        <PrintButton label="Guardar como PDF" />
      </Card>
      <Encabezado e={e} que="Votación del cast" />
      {e.votacion === null
        ? <Card>Los votos se ven cuando se cierra la votación.</Card>
        : <>
            <p className="text-sm text-texto-2 print:text-black/70">Jueces: {e.jueces.join(", ") || "—"}</p>
            <Votos votacion={e.votacion} />
          </>}
    </div>
  );
}
