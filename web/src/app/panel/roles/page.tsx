import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card, Notice, PanelTitle, button, buttonGhost, input } from "@/components/panel/ui";
import { listRoles, type Permission } from "@/lib/panel-data";
import { requireCasa } from "@/lib/permissions";
import { CATEGORIAS_ROL, FRANJAS } from "@/lib/gafete-rules";
import { createRole, deleteRole, updateRoleCategoria, updateRolePermissions } from "./actions";

// Selector de la categoría del gafete (0087).
function CategoriaSelect({ actual }: { actual?: string }) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 font-semibold">Categoría del gafete <span className="font-normal text-texto-3">(color de la franja; la persona lleva la más alta que tenga)</span></legend>
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS_ROL.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 has-[:checked]:border-white">
            <input type="radio" name="categoria" value={c.id} required defaultChecked={actual === c.id} className="sr-only" />
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: FRANJAS[c.id].fondo }} />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const chipCategoria = (c: string) => {
  const f = FRANJAS[c as keyof typeof FRANJAS];
  return f ? <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: f.fondo }} />{CATEGORIAS_ROL.find((x) => x.id === c)?.label ?? (c === "direccion_general" ? "Dirección general" : c === "casa" ? "Casa DARF" : c)}</span> : null;
};

export const metadata: Metadata = { title: "Roles" };

function PermissionChecks({ permissions, checked }: { permissions: Permission[]; checked: Set<string> }) {
  const grupos = [...new Set(permissions.map((p) => p.grupo))];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {grupos.map((g) => (
        <fieldset key={g} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{g}</legend>
          {permissions.filter((p) => p.grupo === g).map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="perm" value={p.id} defaultChecked={checked.has(p.id)} className="mt-1" />
              <span>{p.descripcion}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

// Solo el Director: roles de sistema (fijos) y personalizados (ej. "Vestuario").
export default async function RolesPage({ searchParams }: PageProps<"/panel/roles">) {
  await requireCasa("casa.roles", "/panel/roles");
  const sp = await searchParams;
  const { roles, permissions, grants } = await listRoles();
  const desc = new Map(permissions.map((p) => [p.id, p.descripcion]));
  const custom = roles.filter((r) => !r.es_sistema);
  const system = roles.filter((r) => r.es_sistema);

  return (
    <>
      <PanelTitle eyebrow="Ajustes" title="Roles y permisos">
        Los roles de sistema están fijos. Crea roles personalizados (por ejemplo “Vestuario”) y elige qué pueden hacer.
      </PanelTitle>
      {typeof sp.error === "string" && <Notice>{sp.error}</Notice>}
      {typeof sp.ok === "string" && <Notice ok>{sp.ok}</Notice>}

      <Card>
        <details>
          <summary className="cursor-pointer text-lg font-bold">+ Crear rol personalizado</summary>
          <form action={createRole} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
                <input className={input} name="nombre" required maxLength={40} placeholder="Vestuario" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Descripción (opcional)
                <input className={input} name="descripcion" maxLength={120} placeholder="Medidas y materiales del elenco" />
              </label>
            </div>
            <CategoriaSelect />
            <PermissionChecks permissions={permissions} checked={new Set()} />
            <button className={`${button} self-start`}>Crear rol</button>
          </form>
        </details>
      </Card>

      {custom.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="titular text-xl">Personalizados</h2>
          {custom.map((r) => (
            <Card key={r.id}>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-bold">{r.nombre}</span>{chipCategoria(r.categoria)}
                  <span className="ml-2 text-sm text-texto-3">{(grants.get(r.id)?.size ?? 0)} {(grants.get(r.id)?.size ?? 0) === 1 ? "permiso" : "permisos"}</span>
                </summary>
                <form action={updateRoleCategoria} className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="id" value={r.id} />
                  <CategoriaSelect actual={r.categoria} />
                  <button className={`${buttonGhost} self-start`}>Guardar categoría</button>
                </form>
                <form action={updateRolePermissions} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="id" value={r.id} />
                  <PermissionChecks permissions={permissions} checked={grants.get(r.id) ?? new Set()} />
                  <button className={`${button} self-start`}>Guardar permisos</button>
                </form>
                <form action={deleteRole} className="mt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit message={`¿Eliminar el rol "${r.nombre}"?`} className={buttonGhost}>Eliminar rol</ConfirmSubmit>
                </form>
              </details>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="titular text-xl">De sistema</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {system.map((r) => (
            <li key={r.id}>
              <Card className="h-full">
                <p className="font-bold">{r.nombre}{chipCategoria(r.categoria)}</p>
                <p className="text-sm text-texto-3">{r.descripcion}</p>
                <p className="mt-2 text-sm text-texto-2">
                  {[...(grants.get(r.id) ?? [])].map((p) => desc.get(p) ?? p).join(" · ") || "Sin permisos del panel: usa su portal en Mi cuenta."}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
