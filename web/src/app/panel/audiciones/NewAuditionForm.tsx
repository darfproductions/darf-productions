import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { EN_BLANCO, GRUPOS, PLANTILLAS } from "@/lib/audition-templates";
import { createClient } from "@/lib/supabase/server";
import { createAudition } from "./actions";

const card = "flex cursor-pointer gap-2 rounded-xl border border-white/15 p-3 text-sm has-[:checked]:border-white has-[:checked]:bg-white/5";

function Opcion({ value, label, descripcion, checked }: { value: string; label: string; descripcion: string; checked?: boolean }) {
  return (
    <label className={card}>
      <input type="radio" name="plantilla" value={value} defaultChecked={checked} className="mt-1" />
      <span><b>{label}</b><span className="mt-0.5 block text-texto-3">{descripcion}</span></span>
    </label>
  );
}

// Crear convocatoria (de una obra o general) desde una plantilla. Arriba las 3 principales
// y Personalizada; abajo, desplegables, las demás y las plantillas guardadas.
export async function NewAuditionForm({ pid }: { pid: string | null }) {
  const supabase = await createClient();
  const { data: propias } = await supabase.from("audition_templates").select("id, nombre, descripcion").order("nombre");
  const principales = Object.entries(PLANTILLAS).filter(([, t]) => t.grupo === "principal");
  return (
    <ActionForm action={createAudition} hidden={{ pid: pid ?? "" }} submit="Crear (en borrador)">
      <input className={`${input} max-w-md`} name="titulo" required placeholder={pid ? "Audición general 2027" : "Buscamos bailarines 2027"} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Tipo de audición</legend>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {principales.map(([k, t], i) => <Opcion key={k} value={k} label={t.label} descripcion={t.descripcion} checked={i === 0} />)}
          <Opcion value="blank" label={EN_BLANCO.label} descripcion={EN_BLANCO.descripcion} />
        </div>
        {(propias ?? []).length > 0 && (
          <details className="rounded-xl bg-sala/60 p-3" open>
            <summary className="cursor-pointer text-sm font-bold">Mis plantillas ({propias?.length})</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(propias ?? []).map((t) => <Opcion key={t.id} value={`tpl:${t.id}`} label={t.nombre as string} descripcion={(t.descripcion as string) ?? "Plantilla guardada"} />)}
            </div>
          </details>
        )}
        <details className="rounded-xl bg-sala/60 p-3">
          <summary className="cursor-pointer text-sm font-bold">Ver más plantillas ▾</summary>
          {GRUPOS.map((g) => (
            <div key={g.id} className="mt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{g.label}</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(PLANTILLAS).filter(([, t]) => t.grupo === g.id).map(([k, t]) => <Opcion key={k} value={k} label={t.label} descripcion={t.descripcion} />)}
              </div>
            </div>
          ))}
        </details>
        <p className="text-xs text-texto-3">La plantilla deja listas las opciones, las preguntas del formulario y lo que califican los jueces. Todo se puede cambiar después.</p>
      </fieldset>
    </ActionForm>
  );
}
