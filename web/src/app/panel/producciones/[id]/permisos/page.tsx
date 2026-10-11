import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card } from "@/components/panel/ui";
import { listMembers, listRoles } from "@/lib/panel-data";
import { can, groupMembers } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { AddMemberForm } from "./AddMemberForm";
import { EditRolesForm } from "./EditRolesForm";
import { removeMember } from "./actions";

export const metadata: Metadata = { title: "Permisos de la obra" };

// Quién tiene qué rol en ESTA obra. Solo con permisos.gestionar (la base lo exige).
export default async function ProductionPermissions({ params }: PageProps<"/panel/producciones/[id]/permisos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/permisos`);
  if (!can(access, id, "permisos.gestionar")) redirect(`/panel/producciones/${id}`);
  const [miembros, { roles, permissions, grants }] = await Promise.all([listMembers(id), listRoles()]);
  const desc = new Map(permissions.map((p) => [p.id, p.descripcion]));
  const personas = groupMembers(miembros);
  const opciones = roles.filter((r) => r.id !== "integrante");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Dar acceso</h2>
          <p className="mt-1 text-sm text-texto-2">
            La persona necesita tener cuenta en DARF. Puede tener varios roles y suma los permisos de todos
            (por ejemplo Mesa de registro + Puerta + Staff). Crea un rol personalizado solo si necesitas una
            combinación de permisos que ningún rol tiene.
          </p>
        </div>
        <AddMemberForm pid={id} roles={opciones} />
      </Card>

      <Card className="p-0 md:p-0">
        <h2 className="titular px-5 pt-5 text-xl">Equipo con acceso ({personas.length})</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {personas.map((m) => (
            <li key={m.user_id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.nombre || "Sin nombre"}</p>
                  <p className="truncate text-sm text-texto-3">{m.email}</p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {m.roles.map((r) => (
                    <li key={r.rowId}>
                      <form action={removeMember} className="flex items-center gap-1 rounded-full bg-telon-2 py-1 pl-3 pr-1 text-sm font-semibold">
                        {r.role_nombre}
                        <input type="hidden" name="pid" value={id} />
                        <input type="hidden" name="id" value={r.rowId} />
                        <ConfirmSubmit message={`¿Quitar el rol ${r.role_nombre} a ${m.nombre || m.email}?`} className="grid h-6 w-6 place-items-center rounded-full text-texto-3 hover:bg-white/10 hover:text-texto">
                          <span aria-label={`Quitar ${r.role_nombre}`}>×</span>
                        </ConfirmSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Editar roles</summary>
                <EditRolesForm pid={id} userId={m.user_id} email={m.email} roles={opciones} current={m.roles.map((r) => r.role_id)} />
              </details>
            </li>
          ))}
          {personas.length === 0 && <li className="px-5 py-4 text-texto-2">Nadie todavía. El Director siempre tiene acceso.</li>}
        </ul>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer font-bold">¿Qué puede hacer cada rol?</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <li key={r.id} className="rounded-lg bg-sala p-3 text-sm">
                <p className="font-bold">{r.nombre}{!r.es_sistema && <span className="ml-2 text-xs text-texto-3">personalizado</span>}</p>
                <p className="mt-1 text-texto-2">
                  {[...(grants.get(r.id) ?? [])].map((p) => desc.get(p) ?? p).join(" · ") || "Sin permisos administrativos"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}
