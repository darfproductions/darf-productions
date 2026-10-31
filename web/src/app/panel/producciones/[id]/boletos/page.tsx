import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { listOrders, listPerformances, listZones, salesSummary, seatCount, ventasActores, ventasPorZona } from "@/lib/boleteria";
import { DesgloseZonas } from "./DesgloseZonas";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { capacidadFuncion, occupancy } from "@/lib/sales";
import { formatMoney } from "@/lib/tickets";
import { createClient } from "@/lib/supabase/server";
import { limiteTexto, tiempoRestante } from "@/lib/expiry-rules";
import { getPanelProduction } from "@/lib/panel-data";
import { origenSitio } from "@/lib/site-origin";
import { estadoOrden, metodoLabel, textoBusqueda } from "@/lib/ventas-rules";
import { OrderActions } from "./OrderActions";
import { getLogistica } from "@/lib/logistica";
import { horario, textoPuertas } from "@/lib/logistica-rules";
import { Icono } from "@/components/Icono";
import { codigoOrden, PREFIJO_ORDEN, restoCodigo } from "@/lib/codigo-orden";

export const metadata: Metadata = { title: "Ventas y órdenes" };

const ESTADO: Record<string, string> = {
  pendiente: "bg-[#5a4313] text-aviso",
  aprobado: "bg-[#14532d] text-[#bbf7d0]",
  rechazado: "bg-[#3a3346] text-texto-3",
};
const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Ventas de la obra: resumen, ocupación por función y órdenes (aprobar/rechazar/cancelar).
export default async function SalesPage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/boletos`);
  if (!can(access, id, "ventas.ver")) redirect(salidaBoletos(access, id, "boletos"));
  const operar = can(access, id, "ventas.operar");
  const funcion = typeof sp.funcion === "string" ? sp.funcion : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  // Desde el buscador (0085) o la casilla "Código" (solo se escribe lo que va después de DARF-): una orden por su
  // código, aunque sea vieja.
  const codigo = typeof sp.codigo === "string" ? codigoOrden(sp.codigo) : "";
  // Bloque 4A: "Soy Juan, pagué ayer": buscar por nombre o teléfono en todas las órdenes.
  const buscar = typeof sp.q === "string" ? textoBusqueda(sp.q) : "";

  await (await createClient()).rpc("expire_due_orders", { pid: id });
  const [funciones, s, filtradas, asientos, zonas, actores, logistica, porZona] = await Promise.all([
    listPerformances(id),
    salesSummary(id),
    listOrders(id, { funcion: funcion || undefined, estado: estado || undefined, codigo: codigo || undefined, buscar: buscar || undefined }),
    seatCount(id),
    listZones(id),
    ventasActores(id),
    getLogistica(id),
    ventasPorZona(id),
  ]);
  const quien = (uid: string | null | undefined) => (uid ? actores.get(uid) ?? "equipo" : null);
  const ordenes = filtradas;
  const obra = (await getPanelProduction(id))?.nombre ?? "DARF";
  const ligaCuenta = `${await origenSitio()}/cuenta`;
  const nombreFuncion = new Map(funciones.map((f) => [f.id, formatPerformanceDate(f.starts_at)]));
  // 0127: "Las puertas abren a las…" en el WhatsApp de pago confirmado (si la obra tiene su logística).
  const puertasDe = new Map(funciones.flatMap((f) => (f.starts_at && (logistica || f.puertas_at) ? [[f.id, textoPuertas(horario({ ...f, starts_at: f.starts_at }, logistica))] as const] : [])));
  const q = (k: string, v: string) => {
    const p = new URLSearchParams({ ...(funcion && { funcion }), ...(estado && { estado }), ...(buscar && { q: buscar }) });
    if (v) p.set(k, v); else p.delete(k);
    const str = p.toString();
    return `/panel/producciones/${id}/boletos${str ? `?${str}` : ""}`;
  };

  return (
    <>
      {porZona && (
        <DesgloseZonas filas={porZona} zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre, color: z.color ?? null }))}
          funciones={funciones.map((f) => ({ id: f.id, nombre: formatPerformanceDate(f.starts_at) }))} />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Ingresos aprobados", formatMoney(s.ingresos)],
          ["Boletos vendidos", String(s.vendidos)],
          ["Por aprobar", `${s.ordenesPendientes} órdenes · ${formatMoney(s.pendiente)}`],
          ["Ya entraron", `${s.validados} de ${s.vendidos}`],
        ].map(([k, v]) => (
          <Card key={k} className="p-4 md:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">{k}</p>
            <p className="mt-1 text-xl font-black">{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="titular mb-3 text-xl">Ocupación por función</h2>
        <ul className="flex flex-col divide-y divide-white/10 text-sm">
          {funciones.map((f) => {
            const v = s.porFuncion.get(f.id);
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold">{formatPerformanceDate(f.starts_at)}{f.on_sale ? "" : " · sin venta"}</span>
                <span className="text-texto-2">
                  Vendidos {occupancy(v?.vendidos ?? 0, capacidadFuncion(asientos, f.prices, zonas))} · apartados {v?.apartados ?? 0} · {formatMoney(v?.ingresos ?? 0)}
                </span>
              </li>
            );
          })}
          {funciones.length === 0 && <li className="py-2 text-texto-3">Esta obra no tiene funciones.</li>}
        </ul>
      </Card>

      <Card className="p-0 md:p-0">
        <div className="flex flex-col gap-3 px-5 pt-5">
          <h2 className="titular text-xl">Órdenes</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {[["", "Todas"], ["pendiente", "Por aprobar"], ["aprobado", "Aprobadas"], ["rechazado", "Canceladas y vencidas"]].map(([v, l]) => (
              <Link key={v} href={q("estado", v)} className={`rounded-full border px-3 py-1.5 font-semibold ${estado === v ? "border-texto" : "border-white/20"}`}>{l}</Link>
            ))}
            <span className="mx-1 text-texto-3">·</span>
            <Link href={q("funcion", "")} className={`rounded-full border px-3 py-1.5 font-semibold ${!funcion ? "border-texto" : "border-white/20"}`}>Todas las funciones</Link>
            {funciones.map((f) => (
              <Link key={f.id} href={q("funcion", f.id)} className={`rounded-full border px-3 py-1.5 font-semibold ${funcion === f.id ? "border-texto" : "border-white/20"}`}>
                {formatPerformanceDate(f.starts_at)}
              </Link>
            ))}
          </div>
        </div>
        <a href={`/panel/producciones/${id}/boletos/exportar?${new URLSearchParams({ ...(funcion && { funcion }), ...(estado && { estado }) }).toString()}`} className="mt-1 self-start px-5 text-sm font-bold text-violeta-claro">Descargar órdenes (Excel) <Icono nombre="flecha-abajo" /></a>
        <form className="mt-3 flex flex-wrap gap-2 px-5" role="search">
          {funcion && <input type="hidden" name="funcion" value={funcion} />}
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input name="q" defaultValue={buscar} aria-label="Buscar por nombre o teléfono" placeholder="Buscar por nombre o teléfono" className="min-w-0 flex-1 rounded-lg bg-sala px-3 py-2 text-sm sm:max-w-xs" />
          <button className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold hover:border-white/50">Buscar</button>
          {buscar && <Link href={q("q", "")} className="self-center text-xs font-bold text-violeta-claro">Quitar búsqueda</Link>}
        </form>
        <form className="mt-2 flex flex-wrap items-center gap-2 px-5" role="search" aria-label="Buscar por código de venta">
          <label className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-sala text-sm sm:max-w-xs">
            <span className="select-none py-2 pl-3 font-mono font-bold text-texto-3" aria-hidden="true">{PREFIJO_ORDEN}</span>
            <input name="codigo" defaultValue={restoCodigo(codigo)} aria-label="Código de venta (lo que va después de DARF-)" placeholder="A1B2C3"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent py-2 pr-3 font-mono uppercase" />
          </label>
          <button className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold hover:border-white/50">Buscar código</button>
        </form>
        {codigo && <p className="mt-3 px-5 text-sm text-texto-2">Orden <b className="font-mono">{codigo}</b> · <Link href={`/panel/producciones/${id}/boletos`} className="font-bold text-violeta-claro">Ver todas</Link></p>}
        <ul className="mt-3 divide-y divide-white/10">
          {ordenes.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {o.order_code} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${ESTADO[o.status]}`}>{estadoOrden(o)}</span>
                    {o.created_by_staff_id && <span className="ml-1 text-xs text-texto-3">taquilla</span>}
                    {o.vencida_at && <span className="ml-1 text-xs font-bold text-[#ff8fa3]">no se pagó a tiempo</span>}
                    {o.status === "pendiente" && tiempoRestante(o.expires_at ?? null) && <span className="ml-1 text-xs text-aviso">vence en {tiempoRestante(o.expires_at ?? null)}</span>}
                    {o.status === "pendiente" && !o.expires_at && <span className="ml-1 text-xs text-texto-3">sin vencimiento</span>}
                  </p>
                  <p className="text-sm text-texto-2">{o.buyer_nombre} · <a href={`tel:${o.buyer_telefono}`} className="underline">{o.buyer_telefono}</a></p>
                  <p className="text-xs text-texto-3"><span>{nombreFuncion.get(o.performance_id)}</span> · pidió {fecha(o.created_at)}</p>
                  {(o.approved_by || o.created_by_staff_id) && o.status === "aprobado" && (
                    <p className="text-xs text-texto-3">
                      {o.created_by_staff_id ? `Vendió ${quien(o.created_by_staff_id)}` : `Aprobó ${quien(o.approved_by)}`}
                      {metodoLabel(o.metodo_pago) && ` · ${metodoLabel(o.metodo_pago)}`}{o.referencia && ` · ref. ${o.referencia}`}
                    </p>
                  )}
                  {o.status === "rechazado" && (o.motivo || o.rejected_by) && (
                    <p className="text-xs text-texto-3">{o.rejected_by ? `${quien(o.rejected_by)}: ` : ""}{o.motivo}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">{formatMoney(o.total)}</p>
                  {o.discount_codigo && <p className="text-xs text-exito">{o.discount_codigo} −{formatMoney(o.discount_amount)}</p>}
                </div>
              </div>
              <ul className="flex flex-wrap gap-2 text-xs">
                {o.tickets.map((t) => (
                  <li key={t.id} title={t.cancel_motivo ? `Cancelado: ${t.cancel_motivo}` : undefined} className={`rounded-full px-2.5 py-1 ${t.is_active ? "bg-telon-2" : "bg-telon-2 line-through opacity-60"}`}>
                    {t.seat_label ?? "General"}{t.checked_in_at && <> <Icono nombre="check" etiqueta="Ya entró" /></>}
                  </li>
                ))}
              </ul>
              {o.tickets.some((t) => t.cancelled_by) && (
                <p className="text-xs text-texto-3">
                  {o.tickets.filter((t) => t.cancelled_by).map((t) => `${t.seat_label ?? "General"} cancelado por ${quien(t.cancelled_by)}${t.cancel_motivo ? ` (${t.cancel_motivo})` : ""}`).join(" · ")}
                </p>
              )}
              {operar && <OrderActions pid={id} o={o} obra={obra} funcion={nombreFuncion.get(o.performance_id) ?? ""} limite={o.status === "pendiente" && o.expires_at ? limiteTexto(o.expires_at) : null} ligaCuenta={ligaCuenta} puertas={puertasDe.get(o.performance_id) ?? null} />}
            </li>
          ))}
          {ordenes.length === 0 && <li className="px-5 py-4 text-texto-2">{codigo ? `No hay ninguna orden ${codigo} en esta obra. Revisa el código en el WhatsApp.` : "No hay órdenes con este filtro."}</li>}
          {filtradas.length >= 500 && <li className="px-5 py-4 text-sm text-texto-3">Mostrando las 500 más recientes. Usa los filtros de función y estado para ver las demás; los totales de arriba sí incluyen todas.</li>}
        </ul>
      </Card>
    </>
  );
}
