import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { requireAudition } from "@/lib/panel-auditions";
import { createClient } from "@/lib/supabase/server";
import { saveEntrevista } from "../../../actions";
import { EnEscenaHost } from "../EnEscenaHost";

export const metadata: Metadata = { title: "Entrevista" };

type Entrevista = {
  id: string; numero: number | null; nombre: string; es_menor: boolean; personajes: string[] | null;
  preguntas: string[]; entrevista: { pregunta: string; respuesta: string }[]; extra: string | null; por: string | null; at: string | null;
};

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
  const actual = (escena as { app: string | null } | null)?.app ? (escena as { app: string; numero: number | null; nombre: string }) : null;
  const e = data as Entrevista | null;
  if (!e || e.id !== app) notFound();
  const respuesta = (p: string) => e.entrevista.find((x) => x.pregunta === p)?.respuesta ?? "";
  // Preguntas que ya se contestaron pero ya no están en la convocatoria: se conservan.
  const preguntas = [...e.preguntas, ...e.entrevista.map((x) => x.pregunta).filter((p) => !e.preguntas.includes(p))];

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/panel/audiciones/${aid}/entrevista`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Lista de entrevistas</Link>
      <EnEscenaHost aid={aid} actual={actual} esta={{ app, nombre: e.nombre }} />
      <Card className="flex flex-col gap-1">
        <p className="text-xl font-bold">{e.numero ? `Nº ${e.numero} · ` : ""}{e.nombre}{e.es_menor && <span className="ml-2 text-sm text-aviso">menor de edad</span>}</p>
        {e.personajes?.length ? <p className="text-sm text-texto-2">Se inscribió para: {e.personajes.join(", ")}</p> : null}
        {e.at && <p className="text-xs text-texto-3">Última vez guardada por {e.por ?? "el equipo"} · {new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "America/Mexico_City" }).format(new Date(e.at))}</p>}
      </Card>
      <Card>
        <ActionForm action={saveEntrevista} hidden={{ aid, app }} submit="Guardar entrevista">
          <div className="flex flex-col gap-4">
            {preguntas.map((p) => (
              <label key={p} className="flex flex-col gap-1.5 text-sm font-semibold">{p}
                <input type="hidden" name="pregunta" value={p} />
                <textarea className={`${input} min-h-20 font-normal`} name="respuesta" maxLength={2000} defaultValue={respuesta(p)} />
              </label>
            ))}
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Adicional (otra pregunta o algo que quieras anotar)
              <textarea className={`${input} min-h-24 font-normal`} name="extra" maxLength={2000} defaultValue={e.extra ?? ""} />
            </label>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
