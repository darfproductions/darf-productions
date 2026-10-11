import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card, buttonGhost } from "@/components/panel/ui";
import { listMembers, listRoles } from "@/lib/panel-data";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { AddMemberForm } from "./AddMemberForm";
import { removeMember } from "./actions";

export const metadata: Metadata = { title: "Permisos de la obra" };

// Quién tiene qué rol en ESTA obra. Solo con permisos.gestionar (la base lo exige).
export default async function ProductionPermissions({ params }: PageProps<"/panel/producciones/[id]/permisos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/permisos`);
  if (!can(access, id, "permisos.gestionar")) redirect(`/panel/producciones/${id}`);
  const [miembros, { roles, permissions, grants }] = await Promise.all([listMembers(id), listRoles()]);
  const desc = new Map(permissions.map((p) => [p.id, p.descripcion]));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Dar un rol</h2>
          <p className="mt-1 text-sm text-texto-2">
            La persona necesita tener cuenta en DARF. Puede tener varios roles en la misma obra.
          </p>
        </div>
        <AddMemberForm pid={id} roles={roles.filter((r) => r.id !== "integrante")} />
      </Card>

      <Card className="p-0 md:p-0">
        <h2 className="titular px-5 pt-5 text-xl">Equipo con acceso ({miembros.length})</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {miembros.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{m.nombre || "Sin nombre"}</p>
                <p className="truncate text-sm text-texto-3">{m.email} · {m.role_nombre}</p>
              </div>
              <form action={removeMember}>
                <input type="hidden" name="pid" value={id} />
                <input type="hidden" name="id" value={m.id} />
                <ConfirmSubmit message={`¿Quitar a ${m.nombre || m.email} como ${m.role_nombre}?`} className={buttonGhost}>Quitar</ConfirmSubmit>
              </form>
            </li>
          ))}
          {miembros.length === 0 && <li className="px-5 py-4 text-texto-2">Nadie todavía. El Director siempre tiene acceso.</li>}
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
