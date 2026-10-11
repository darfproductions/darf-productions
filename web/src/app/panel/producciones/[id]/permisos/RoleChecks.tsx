export type RoleOption = { id: string; nombre: string; descripcion: string | null; es_sistema: boolean };

// Casillas de roles: se pueden marcar varios (la persona suma los permisos de todos).
export function RoleChecks({ roles, checked = [] }: { roles: RoleOption[]; checked?: string[] }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold">Roles (puedes marcar varios)</legend>
      {roles.map((r) => (
        <label key={r.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-sala px-3 py-2.5 text-sm has-[:checked]:outline has-[:checked]:outline-violeta-claro">
          <input type="checkbox" name="role" value={r.id} defaultChecked={checked.includes(r.id)} className="mt-1" />
          <span>
            <span className="font-bold">{r.nombre}</span>
            {!r.es_sistema && <span className="ml-1.5 text-xs text-texto-3">personalizado</span>}
            {r.descripcion && <span className="block text-texto-3">{r.descripcion}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
