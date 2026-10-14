import type { Metadata } from "next";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card, Notice, PanelTitle, button, buttonGhost, input } from "@/components/panel/ui";
import { listRoles, type Permission, type Role } from "@/lib/panel-data";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { borrarRolCasa, crearRolCasa, guardarMiembro, guardarPermisosCasa, quitarMiembro } from "./actions";

export const metadata: Metadata = { title: "Casa DARF" };

type Miembro = { user_id: string; nombre: string; email: string; roles: string[]; desde: string };

function Permisos({ permissions, checked }: { permissions: Permission[]; checked: Set<string> }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {permissions.map((p) => (
        <label key={p.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="perm" value={p.id} defaultChecked={checked.has(p.id)} className="mt-0.5" />
          <span>{p.descripcion}</span>
        </label>
      ))}
    </div>
  );
}

function Roles({ roles, checked = [] }: { roles: Role[]; checked?: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-2 text-sm">
      <legend className="mb-1.5 font-semibold">Puesto</legend>
      {roles.map((r) => (
        <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 has-[:checked]:border-white">
          <input type="checkbox" name="rol" value={r.id} defaultChecked={checked.includes(r.id)} /> {r.nombre}
        </label>
      ))}
    </fieldset>
  );
}

// Casa DARF (0102): el equipo de la empresa con permisos globales. Solo el Director crea los puestos y los asigna.
export default async function CasaDarf({ searchParams }: PageProps<"/panel/ajustes/casa">) {
  await requireDirector("/panel/ajustes/casa");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ roles, permissions, grants }, lista] = await Promise.all([listRoles("casa"), supabase.rpc("casa_lista")]);
  const miembros = (lista.data ?? []) as Miembro[];
  const nombreRol = new Map(roles.map((r) => [r.id, r.nombre]));
  const desc = new Map(permissions.map((p) => [p.id, p.descripcion]));

  const puestoForm = (
    <form action={crearRolCasa} className="mt-4 flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre del puesto
          <input className={input} name="nombre" required maxLength={40} placeholder="CEO, CFO, Head of HR…" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Descripción (opcional)
          <input className={input} name="descripcion" maxLength={120} />
        </label>
      </div>
      <p className="text-sm font-semibold">¿Qué puede hacer?</p>
      <Permisos permissions={permissions} checked={new Set()} />
      <button className={`${button} self-start`}>Crear puesto</button>
    </form>
  );

  return (
    <>
      <PanelTitle eyebrow="Ajustes" title="Casa DARF">
        El equipo de la empresa. Crea cada puesto con su nombre (CEO, CFO, Head of HR…) y lo que puede hacer en todo DARF; luego asígnalo
        a la persona. En su gafete sale su puesto con la franja de Casa DARF, por encima de cualquier puesto en una obra.
      </PanelTitle>
      {typeof sp.error === "string" && <Notice>{sp.error}</Notice>}
      {typeof sp.ok === "string" && <Notice ok>{sp.ok}</Notice>}

      <section className="flex flex-col gap-3">
        <h2 className="titular text-xl">1 · Puestos</h2>
        {roles.length === 0 && <Card className="text-sm text-texto-2">Aún no hay puestos. Crea el primero (por ejemplo “CEO” con todos los permisos).</Card>}
        {roles.map((r) => (
          <Card key={r.id}>
            <details>
              <summary className="cursor-pointer">
                <span className="font-bold">{r.nombre}</span>
                <span className="ml-2 text-sm text-texto-3">{[...(grants.get(r.id) ?? [])].map((p) => (desc.get(p) ?? p).split(":")[0]).join(" · ") || "Sin permisos"}</span>
              </summary>
              <form action={guardarPermisosCasa} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="id" value={r.id} />
                <Permisos permissions={permissions} checked={grants.get(r.id) ?? new Set()} />
                <button className={`${button} self-start`}>Guardar permisos</button>
              </form>
              <form action={borrarRolCasa} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <ConfirmSubmit message={`¿Eliminar el puesto "${r.nombre}"?`} className={buttonGhost}>Eliminar puesto</ConfirmSubmit>
              </form>
            </details>
          </Card>
        ))}
        <Card>
          <details open={roles.length === 0}>
            <summary className="cursor-pointer text-lg font-bold">+ Crear puesto</summary>
            {puestoForm}
          </details>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="titular text-xl">2 · Personas · {miembros.length}</h2>
        {roles.length > 0 ? (
          <Card className="flex flex-col gap-4">
            <h3 className="font-bold">Agregar a Casa DARF</h3>
            <form action={guardarMiembro} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo de su cuenta
                  <input className={input} name="email" type="email" required placeholder="persona@correo.com" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">En Casa DARF desde
                  <input className={input} name="desde" type="date" />
                </label>
              </div>
              <Roles roles={roles} />
              <p className="text-xs text-texto-3">La persona necesita tener cuenta. “Desde” sale en su gafete (si no lo pones, es hoy).</p>
              <button className={`${button} self-start`}>Agregar</button>
            </form>
          </Card>
        ) : <Card className="text-sm text-texto-3">Primero crea un puesto; luego aquí se lo asignas a la persona.</Card>}
        {miembros.map((m) => (
          <Card key={m.user_id}>
            <details>
              <summary className="cursor-pointer">
                <span className="font-bold">{m.nombre}</span>
                <span className="ml-2 text-sm text-texto-3">{m.roles.map((r) => nombreRol.get(r) ?? r).join(", ")} · desde {m.desde.slice(0, 4)}</span>
              </summary>
              <form action={guardarMiembro} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="email" value={m.email} />
                <p className="text-sm text-texto-3">{m.email}</p>
                <Roles roles={roles} checked={m.roles} />
                <label className="flex max-w-[220px] flex-col gap-1.5 text-sm font-semibold">Desde
                  <input className={input} name="desde" type="date" defaultValue={m.desde} />
                </label>
                <button className={`${buttonGhost} self-start`}>Guardar</button>
              </form>
              <form action={quitarMiembro} className="mt-3">
                <input type="hidden" name="uid" value={m.user_id} />
                <ConfirmSubmit message={`¿Quitar a ${m.nombre} de Casa DARF?`} className={buttonGhost}>Quitar de Casa DARF</ConfirmSubmit>
              </form>
            </details>
          </Card>
        ))}
      </section>
    </>
  );
}
