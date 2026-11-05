import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { listRoles } from "@/lib/panel-data";
import { AREAS, PUESTOS_SUGERIDOS, etiqueta } from "@/lib/produccion-nueva-rules";
import { agregarPuestosSugeridos, borrarPuesto } from "@/app/panel/producciones/obra-actions";
import { PuestoForm } from "./PuestoForm";

type Puesto = {
  id: string; puesto: string; area: string; roles: string[]; email: string | null; telefono: string | null; user_id: string | null;
  invite_id: string | null; people: { nombre: string } | null;
};
const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export async function cargarPuestos(pid: string) {
  const { data } = await (await createClient()).from("production_puestos")
    .select("id, puesto, area, roles, email, telefono, user_id, invite_id, people(nombre)").eq("production_id", pid).order("orden");
  return (data ?? []) as unknown as Puesto[];
}

/** Estado de un puesto en una palabra. */
export function estadoPuesto(p: Puesto): { texto: string; cls: string } {
  if (p.user_id) return { texto: p.people?.nombre ?? "Con cuenta", cls: "text-exito" };
  if (p.people) return { texto: `${p.people.nombre}${p.invite_id ? " · invitación enviada" : " · sin cuenta"}`, cls: "text-aviso" };
  return { texto: "Vacío", cls: "text-texto-3" };
}

// Puestos del equipo de la obra (0135): Dirección vocal, Coreografía… Cada uno con quién lo ocupa y sus permisos.
export async function PuestosEditor({ pid, obra }: { pid: string; obra: string }) {
  const [puestos, { roles }] = await Promise.all([cargarPuestos(pid), listRoles()]);
  const opciones = roles.filter((r) => r.id !== "integrante" && r.id !== "direccion_general_darf");
  const nombreRol = new Map(roles.map((r) => [r.id, r.nombre]));
  const yaEstan = new Set(puestos.map((p) => p.puesto.toLowerCase()));
  const faltan = PUESTOS_SUGERIDOS.filter((s) => !yaEstan.has(s.puesto.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      {faltan.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h3 className="titular text-lg">Puestos sugeridos</h3>
          <p className="text-sm text-texto-2">Palomea los que tendrá esta obra. Cada uno trae sus permisos sugeridos; luego llenas quién lo ocupa (o lo dejas vacío).</p>
          <ActionForm action={agregarPuestosSugeridos} hidden={{ pid }} submit="Agregar los palomeados">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {faltan.map((s) => (
                <label key={s.puesto} className="flex cursor-pointer items-start gap-2 rounded-lg bg-sala px-3 py-2 text-sm has-[:checked]:outline has-[:checked]:outline-violeta-claro">
                  <input type="checkbox" name="sugerido" value={s.puesto} className="mt-1" />
                  <span><b>{s.puesto}</b><span className="block text-xs text-texto-3">{s.roles.map((r) => nombreRol.get(r) ?? r).join(", ")}</span></span>
                </label>
              ))}
            </div>
          </ActionForm>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <h3 className="titular text-lg">Equipo de la obra <span className="text-sm font-normal text-texto-3">({puestos.length})</span></h3>
        <ul className="flex flex-col gap-2">
          {puestos.map((p) => {
            const e = estadoPuesto(p);
            return (
              <li key={p.id} className="rounded-lg bg-sala px-3 py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                    <span><b>{p.puesto}</b> <span className="text-xs text-texto-3">{etiqueta(AREAS, p.area)}</span></span>
                    <span className={`text-sm font-semibold ${e.cls}`}>{e.texto}</span>
                    <span className="w-full text-xs text-texto-3">{p.roles.length ? `Permisos: ${p.roles.map((r) => nombreRol.get(r) ?? r).join(", ")}` : "Sin permisos en el panel"}</span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <PuestoForm pid={pid} obra={obra} roles={opciones} p={{
                      id: p.id, puesto: p.puesto, area: p.area, roles: p.roles, nombre: p.people?.nombre ?? null,
                      correo: p.email, telefono: p.telefono, conCuenta: !!p.user_id,
                    }} />
                    <ActionForm inline action={borrarPuesto} hidden={{ pid, id: p.id }} confirm={`¿Quitar el puesto ${p.puesto}? Se le quitan los permisos que daba.`} submit="Quitar puesto" submitClass={ghost} />
                  </div>
                </details>
              </li>
            );
          })}
          {puestos.length === 0 && <li className="text-sm text-texto-3">Aún no hay puestos.</li>}
        </ul>
        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-bold text-violeta-claro">+ Agregar otro puesto</summary>
          <div className="mt-3"><PuestoForm pid={pid} obra={obra} roles={opciones} submit="Agregar puesto" /></div>
        </details>
      </Card>
    </div>
  );
}
