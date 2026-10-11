import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { PLANTILLAS } from "@/lib/audition-rules";
import { createAudition } from "./actions";

// Crear convocatoria (de una obra o general) a partir de una plantilla.
// Las opciones se pueden cambiar después en Configuración.
export function NewAuditionForm({ pid }: { pid: string | null }) {
  return (
    <ActionForm action={createAudition} hidden={{ pid: pid ?? "" }} submit="Crear (en borrador)">
      <input className={`${input} max-w-md`} name="titulo" required placeholder={pid ? "Audición general 2027" : "Buscamos bailarines 2027"} />
      <fieldset className="grid gap-2 md:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Tipo de audición</legend>
        {Object.entries(PLANTILLAS).map(([k, t], i) => (
          <label key={k} className="flex cursor-pointer gap-2 rounded-xl border border-white/15 p-3 text-sm has-[:checked]:border-white">
            <input type="radio" name="plantilla" value={k} defaultChecked={i === 0} className="mt-1" />
            <span><b>{t.label}</b><span className="mt-0.5 block text-texto-3">{t.descripcion}</span></span>
          </label>
        ))}
      </fieldset>
    </ActionForm>
  );
}
