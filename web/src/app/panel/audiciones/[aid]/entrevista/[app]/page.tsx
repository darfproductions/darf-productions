import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icono } from "@/components/Icono";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { EnEscenaHost } from "../EnEscenaHost";
import { EntrevistaForm } from "../EntrevistaForm";

export const metadata: Metadata = { title: "Entrevista" };

// Entrevista de un aspirante (0112): las preguntas de la convocatoria y un espacio adicional.
export default async function EntrevistaAspirante({ params }: PageProps<"/panel/audiciones/[aid]/entrevista/[app]">) {
  const { aid, app } = await params;
  await requireAudition(aid, ["audiciones.entrevista", "audiciones.gestionar"], `/entrevista/${app}`);
  if (!/^[0-9a-f-]{36}$/.test(app)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: escena }] = await Promise.all([
    supabase.rpc("audition_entrevista", { app }),
    supabase.rpc("audition_juez_actual", { aid }),
  ]);
  if (!data || (data as { id: string }).id !== app) notFound();
  const actual = (escena as { app: string | null } | null)?.app ? (escena as { app: string; numero: number | null; nombre: string }) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/panel/audiciones/${aid}/entrevista`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Lista de entrevistas</Link>
      <EnEscenaHost aid={aid} actual={actual} esta={{ app, nombre: (data as { nombre: string }).nombre }} />
      <EntrevistaForm aid={aid} app={app} />
    </div>
  );
}
