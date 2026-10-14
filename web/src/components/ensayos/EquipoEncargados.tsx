// Casillas para citar al equipo de producción y elegir encargados del ensayo (0099). Sirve en el
// formulario de crear y en el de cambiar un ensayo que ya existe.

export type Persona = { user_id: string; nombre: string; detalle?: string };

const chip = "flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs has-[:checked]:border-white";

export function EquipoEncargados({ equipo, elenco, valores }: {
  equipo: Persona[]; elenco: Persona[];
  valores?: { equipo?: string[]; equipo_todos?: boolean; encargados?: string[] };
}) {
  const v = valores ?? {};
  const todos = [...elenco, ...equipo.filter((e) => !elenco.some((x) => x.user_id === e.user_id))];
  return (
    <>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">Equipo de producción que debe asistir</legend>
        {equipo.length === 0 ? (
          <p className="text-xs text-texto-3">Esta obra aún no tiene equipo (personas con rol de staff, crew, maestros…). Se agrega en Permisos.</p>
        ) : (
          <>
            <label className="flex items-center gap-2"><input type="checkbox" name="equipo_todos" defaultChecked={v.equipo_todos} /> Todo el equipo</label>
            <p className="text-xs text-texto-3">O solo estas personas:</p>
            <div className="flex flex-wrap gap-2">
              {equipo.map((g) => (
                <label key={g.user_id} className={chip}>
                  <input type="checkbox" name="equipo" value={g.user_id} defaultChecked={v.equipo?.includes(g.user_id)} /> {g.nombre}
                  {g.detalle && <span className="text-texto-3">{g.detalle}</span>}
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">Encargados de abrir el ensayo</legend>
        <p className="text-xs text-texto-3">
          El primero que llega lo abre desde su cuenta (el mismo día, desde una hora antes) y pasa lista con el QR.
          Los demás encargados pueden pasar lista en cuanto alguien los escanea. Dirección, maestros y producción siempre pueden.
        </p>
        <div className="flex flex-wrap gap-2">
          {todos.map((g) => (
            <label key={g.user_id} className={chip}>
              <input type="checkbox" name="encargados" value={g.user_id} defaultChecked={v.encargados?.includes(g.user_id)} /> {g.nombre}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
