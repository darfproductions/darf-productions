import Link from "next/link";
import { BirthdayList } from "@/components/BirthdayList";
import { Card } from "@/components/panel/ui";
import { ListaRevision } from "@/components/panel/ListaRevision";
import { cumplesDelMes, MESES, type Cumple } from "@/lib/account-rules";
import { createClient } from "@/lib/supabase/server";
import { formatPerformanceDate } from "@/lib/productions";
import { getPanelProduction, listMembers, performanceSummary } from "@/lib/panel-data";
import { can, groupMembers } from "@/lib/panel-nav";
import { ordenarPendientes, pendienteHref, pendienteTexto } from "@/lib/panel-home-rules";
import { getPendientes } from "@/lib/panel-pendientes";
import { requirePanel } from "@/lib/permissions";
import { kitMissing } from "@/lib/themes";
import { mayus, partesMx } from "@/lib/dates";
import { env } from "@/lib/env";
import { listPerformances, listZones } from "@/lib/boleteria";
import { listoParaVender } from "@/lib/listo-vender";
import { elegir } from "@/lib/poster";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { Icono } from "@/components/Icono";

const fechaCorta = (iso: string) =>
  mayus(new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));

/** Asientos activos del mapa: total, sin zona de precio y zonas que usan. */
async function asientosDe(pid: string) {
  const supabase = await createClient();
  const { data } = await todasLasFilas<{ price_category_id: string | null }>((a, b) =>
    supabase.from("seats").select("price_category_id").eq("production_id", pid).eq("is_active", true).order("id").range(a, b));
  return {
    total: data.length,
    sinZona: data.filter((s) => !s.price_category_id).length,
    zonas: [...new Set(data.map((s) => s.price_category_id).filter((z): z is string => !!z))],
  };
}

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
  // Bloque 4C: "Listo para vender", mientras la obra no haya terminado.
  const vende = !p.concluded && !["archivada", "cancelada"].includes(p.estado);
  const [fs, zs, as] = vende ? await Promise.all([listPerformances(id), listZones(id), asientosDe(id)]) : [[], [], null];
  const lista = vende && as
    ? listoParaVender({ pid: id, estado: p.estado, kitFaltan: faltan, funciones: fs, zonas: zs, asientos: as, whatsapp: !!env.whatsapp, posterDestacado: !!elegir(p, "destacada"), elencoSinPublicar: porHacer.find((x) => x.tipo === "elenco_sin_publicar")?.n ?? 0, fecha: fechaCorta })
    : null;
  const mes = partesMx().m;
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
                  <span className="text-violeta-claro"><Icono nombre="flecha-der" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {lista && (
        <ListaRevision className="md:col-span-2" titulo="Listo para vender" listo={lista.listo}
          resumen={lista.listo ? "Todo listo: la obra puede vender boletos." : `Faltan ${lista.faltan} ${lista.faltan === 1 ? "cosa" : "cosas"} para vender.`}
          puntos={lista.puntos.map((x) => ({ ...x, nivel: x.obligatorio ? "obligatorio" : "opcional" }))} />
      )}
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Kit de la plantilla</p>
        {faltan.length === 0 ? (
          <p className="mt-2 font-semibold text-[#bbf7d0]">Completo: la obra se puede publicar.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-aviso">{faltan.map((f) => <li key={f}><Icono nombre="punto" className="h-2 w-2 opacity-70" /> {f}</li>)}</ul>
        )}
        {/* Una obra en borrador aún no tiene página pública (daría 404): se ve en la vista previa. */}
        {p.estado === "borrador"
          ? <Link href={`/vista-previa/${p.id}`} target="_blank" className="mt-4 inline-block text-sm font-bold text-violeta-claro">Vista previa <Icono nombre="externo" /></Link>
          : <Link href={`/producciones/${p.id}`} className="mt-4 inline-block text-sm font-bold text-violeta-claro">Ver página pública <Icono nombre="externo" /></Link>}
      </Card>

      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Funciones</p>
        <p className="mt-2 text-2xl font-black">{funciones.total}</p>
        <p className="text-sm text-texto-2">
          {funciones.enVenta} en venta · {funciones.proxima ? `próxima: ${formatPerformanceDate(funciones.proxima).toLowerCase()}` : "sin próxima fecha"}
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
          <Link href={`/panel/producciones/${id}/guia`} className="text-sm font-bold text-violeta-claro">Guía de tu rol <Icono nombre="flecha-der" /></Link>
          {can(access, id, "permisos.gestionar") && (
            <Link href={`/panel/producciones/${id}/permisos`} className="text-sm font-bold text-violeta-claro">Gestionar permisos <Icono nombre="flecha-der" /></Link>
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
