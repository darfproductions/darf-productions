import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { saveEntrevista } from "../../actions";

type Entrevista = {
  id: string; numero: number | null; nombre: string; es_menor: boolean; personajes: string[] | null;
  preguntas: string[]; entrevista: { pregunta: string; respuesta: string }[]; extra: string | null; por: string | null; at: string | null;
};

// Entrevista de un aspirante (0112): las preguntas de la convocatoria y un espacio adicional. Al darle "Subir
// respuestas", a cada juez le aparecen en su pantalla en unos segundos (junto a la calificación de quien está en escena).
// Se usa en la página de la entrevista y en Modo audición, "Host y juez".
export async function EntrevistaForm({ aid, app, compacta = false }: { aid: string; app: string; compacta?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("audition_entrevista", { app });
  const e = data as Entrevista | null;
  if (!e || e.id !== app) return <Card className="text-sm text-texto-3">No se encontró la entrevista.</Card>;
  const respuesta = (p: string) => e.entrevista.find((x) => x.pregunta === p)?.respuesta ?? "";
  // Preguntas que ya se contestaron pero ya no están en la convocatoria: se conservan.
  const preguntas = [...e.preguntas, ...e.entrevista.map((x) => x.pregunta).filter((p) => !e.preguntas.includes(p))];
  const cuando = e.at ? new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "America/Mexico_City" }).format(new Date(e.at)) : null;

  return (
    <>
      {!compacta && (
        <Card className="flex flex-col gap-1">
          <p className="text-xl font-bold">{e.numero ? `Nº ${e.numero} · ` : ""}{e.nombre}{e.es_menor && <span className="ml-2 text-sm text-aviso">menor de edad</span>}</p>
          {e.personajes?.length ? <p className="text-sm text-texto-2">Se inscribió para: {e.personajes.join(", ")}</p> : null}
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        {compacta && <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">Entrevista de {e.nombre}</p>}
        {cuando && <p className="text-xs text-texto-3">Subida por {e.por ?? "el equipo"} · {cuando}. Ya la ven los jueces.</p>}
        <ActionForm action={saveEntrevista} hidden={{ aid, app }} submit="Subir respuestas">
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
            <p className="text-xs text-texto-3">Al subirlas, a cada juez le aparecen en su pantalla en unos segundos. Puedes corregir y volver a subir.</p>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
