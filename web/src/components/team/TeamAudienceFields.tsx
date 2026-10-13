// Elegir a quién va algo del equipo: todo el equipo, roles o personas (se lee con parseTeamAudience).
export function TeamAudienceFields({ roles, gente, pregunta = "¿Para quién es?" }: {
  roles: { id: string; nombre: string }[];
  gente: { user_id: string; nombre: string }[];
  pregunta?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 font-semibold">{pregunta}</legend>
      <label className="flex items-center gap-2"><input type="radio" name="audiencia" value="todos" defaultChecked /> Todo el equipo</label>
      <label className="flex flex-wrap items-center gap-2"><input type="radio" name="audiencia" value="roles" /> Roles:
        {roles.map((r) => <label key={r.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="roles" value={r.id} /> {r.nombre}</label>)}
      </label>
      <label className="flex items-center gap-2"><input type="radio" name="audiencia" value="personas" /> Solo estas personas:</label>
      <PeopleChecks gente={gente} name="personas" />
    </fieldset>
  );
}

export function PeopleChecks({ gente, name }: { gente: { user_id: string; nombre: string }[]; name: string }) {
  return (
    <div className="ml-6 flex flex-wrap gap-2">
      {gente.map((g) => (
        <label key={g.user_id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs has-[:checked]:border-white">
          <input type="checkbox" name={name} value={g.user_id} /> {g.nombre}
        </label>
      ))}
      {gente.length === 0 && <span className="text-xs text-texto-3">Aún no hay nadie en el equipo.</span>}
    </div>
  );
}
