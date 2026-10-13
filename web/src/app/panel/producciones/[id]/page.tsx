import Link from "next/link";
import { BirthdayList } from "@/components/BirthdayList";
import { Card } from "@/components/panel/ui";
import { cumplesDelMes, MESES, type Cumple } from "@/lib/account-rules";
import { createClient } from "@/lib/supabase/server";
import { formatPerformanceDate } from "@/lib/productions";
import { getPanelProduction, listMembers, performanceSummary } from "@/lib/panel-data";
import { can, groupMembers } from "@/lib/panel-nav";
import { ordenarPendientes, pendienteHref, pendienteTexto } from "@/lib/panel-home-rules";
import { getPendientes } from "@/lib/panel-pendientes";
import { requirePanel } from "@/lib/permissions";
import { kitMissing } from "@/lib/themes";

// Resumen de la obra: estado del kit, funciones y equipo responsable.
export default async function ProductionSummary({ params }: PageProps<"/panel/producciones/[id]">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}`);
  const [p, funciones, miembros, todos] = await Promise.all([
    getPanelProduction(id),
    performanceSummary(id),
    can(access, id, "obra.ver") ? listMembers(id) : Promise.resolve([]),
    getPendientes(),
  ]);
  // 0085: lo pendiente de esta obra (mismo dato que la bandeja de Inicio).
  const porHacer = ordenarPendientes(todos.filter((x) => x.production_id === id));
  if (!p) return null;
  const faltan = kitMissing(p);
  const mes = new Date().getMonth() + 1;
  const cumples = can(access, id, "obra.ver")
    ? cumplesDelMes((((await (await createClient()).rpc("birthdays", { pid: id })).data ?? []) as Cumple[]), mes)
    : [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={`md:col-span-2 ${porHacer.length ? "border border-aviso/40" : ""}`}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Por hacer en esta obra</p>
        {porHacer.length === 0 ? (
          <p className="mt-2 text-texto-2">Todo al día.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {porHacer.map((x) => (
              <li key={`${x.tipo}-${x.ref_id ?? ""}`}>
                <Link href={pendienteHref(x)} className="flex items-center justify-between gap-3 rounded-lg bg-sala px-4 py-2.5 hover:bg-telon-2">
                  <span><b className="text-aviso">{pendienteTexto(x)}</b>{x.ref_titulo ? <span className="text-sm text-texto-2"> · {x.ref_titulo}</span> : null}</span>
                  <span className="text-violeta-claro">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Kit de la plantilla</p>
        {faltan.length === 0 ? (
          <p className="mt-2 font-semibold text-[#bbf7d0]">Completo: la obra se puede publicar.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-aviso">{faltan.map((f) => <li key={f}>• {f}</li>)}</ul>
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

      {can(access, id, "obra.ver") && (
        <Card className="md:col-span-2">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Cumpleaños de {MESES[mes - 1]}</p>
          <BirthdayList items={cumples} vacio="Nadie del elenco o del equipo cumple años este mes (o aún no registran su fecha)." />
        </Card>
      )}

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
