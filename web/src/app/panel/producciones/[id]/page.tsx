import Link from "next/link";
import { Card } from "@/components/panel/ui";
import { formatPerformanceDate } from "@/lib/productions";
import { getPanelProduction, listMembers, performanceSummary } from "@/lib/panel-data";
import { can, groupMembers } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { kitMissing } from "@/lib/themes";

// Resumen de la obra: estado del kit, funciones y equipo responsable.
export default async function ProductionSummary({ params }: PageProps<"/panel/producciones/[id]">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}`);
  const [p, funciones, miembros] = await Promise.all([
    getPanelProduction(id),
    performanceSummary(id),
    can(access, id, "obra.ver") ? listMembers(id) : Promise.resolve([]),
  ]);
  if (!p) return null;
  const faltan = kitMissing(p);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Kit de la plantilla</p>
        {faltan.length === 0 ? (
          <p className="mt-2 font-semibold text-[#bbf7d0]">Completo: la obra se puede publicar.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-[#f2b544]">{faltan.map((f) => <li key={f}>• {f}</li>)}</ul>
        )}
        <Link href={`/producciones/${p.id}`} className="mt-4 inline-block text-sm font-bold text-violeta-claro">Ver página pública ↗</Link>
      </Card>

      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Funciones</p>
        <p className="mt-2 text-2xl font-black">{funciones.total}</p>
        <p className="text-sm text-texto-2">
          {funciones.enVenta} en venta · {funciones.proxima ? `próxima: ${formatPerformanceDate(funciones.proxima)}` : "sin próxima fecha"}
        </p>
      </Card>

      <Card className="md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Equipo con acceso al panel</p>
          {can(access, id, "permisos.gestionar") && (
            <Link href={`/panel/producciones/${id}/permisos`} className="text-sm font-bold text-violeta-claro">Gestionar permisos →</Link>
          )}
        </div>
        {miembros.length === 0 ? (
          <p className="mt-2 text-texto-2">Nadie tiene un rol asignado en esta obra todavía (el Director siempre tiene acceso).</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {groupMembers(miembros).map((m) => (
              <li key={m.user_id} className="flex flex-col gap-0.5 rounded-lg bg-sala px-3 py-2 text-sm">
                <span className="truncate font-semibold">{m.nombre || m.email}</span>
                <span className="text-texto-3">{m.roles.map((r) => r.role_nombre).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
