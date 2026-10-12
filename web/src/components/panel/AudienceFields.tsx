import { TIPO_CREDITO } from "@/lib/casting-rules";

// Elegir a quién va: todo el elenco, grupos o personas (se lee con parseAudience).
export function AudienceFields({ gente, pregunta = "¿Para quién es?" }: { gente: { user_id: string; nombre: string }[]; pregunta?: string }) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 font-semibold">{pregunta}</legend>
      <label className="flex items-center gap-2"><input type="radio" name="audiencia" value="todos" defaultChecked /> Todo el elenco</label>
      <label className="flex flex-wrap items-center gap-2"><input type="radio" name="audiencia" value="grupos" /> Grupos:
        {Object.entries(TIPO_CREDITO).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" name="grupos" value={k} /> {v}</label>)}
      </label>
      <label className="flex items-center gap-2"><input type="radio" name="audiencia" value="personas" /> Solo estas personas:</label>
      <div className="ml-6 flex flex-wrap gap-2">
        {gente.map((g) => (
          <label key={g.user_id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs has-[:checked]:border-white">
            <input type="checkbox" name="personas" value={g.user_id} /> {g.nombre}
          </label>
        ))}
        {gente.length === 0 && <span className="text-xs text-texto-3">Aún no hay integrantes.</span>}
      </div>
    </fieldset>
  );
}
