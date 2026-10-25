import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { Card, input } from "@/components/panel/ui";
import { listOrders, listPerformances, listZones } from "@/lib/boleteria";
import { isoToLocalMx } from "@/lib/dates";
import { getPanelProduction } from "@/lib/panel-data";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { ligaWhatsApp } from "@/lib/pago-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { formatMoney } from "@/lib/tickets";
import { cancelPerformance, createPerformance, deletePerformance, saveGeneralZone, savePreventaObra, setProductionOnSale, updatePerformance } from "../actions";
import { ZonaAcciones } from "../ZonaAcciones";
import { VentaAjustes } from "../VentaAjustes";
import { ingresoPotencial } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { Icono } from "@/components/Icono";
import { getLlamados, getLogistica } from "@/lib/logistica";
import { hora, horario, horasLlamados, lineaHorario } from "@/lib/logistica-rules";
import { saveHorarioFuncion } from "./actions";
import { LlamadosObra, LogisticaObra } from "./Logistica";

export const metadata: Metadata = { title: "Funciones y horarios" };

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

// Funciones de la obra: fecha (o "por definir"), sede, precios por zona y venta.
export default async function PerformancesPage({ params }: PageProps<"/panel/producciones/[id]/boletos/funciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/funciones`);
  const gestionar = can(access, id, "funciones.gestionar");
  const ventas = can(access, id, "ventas.operar");
  if (!gestionar && !ventas) redirect(salidaBoletos(access, id, "boletos/funciones"));
  const [p, funciones, zonas, logistica, llamados] = await Promise.all([getPanelProduction(id), listPerformances(id), listZones(id), getLogistica(id), gestionar ? getLlamados(id) : Promise.resolve([])]);
  if (!p) redirect("/panel/producciones");
  // Funciones canceladas (0091): quién pagó y hay que reembolsar, con WhatsApp para avisarle.
  // 0117: cuánto deja cada función si se vende todo, y lo vendido (aprobado) hasta hoy.
  const supabase = await createClient();
  // 0118: fechas de preventa de la obra (las funciones que no tienen fechas propias las siguen).
  const { data: obraPre } = await supabase.from("productions").select("preventa_desde, preventa_hasta, funciones_publicadas, modo_venta, mostrar_precios, mostrar_total").eq("id", id).maybeSingle();
  // 0123: preventa privada (con código) de la obra y de cada función.
  const [{ data: privObra }, { data: privFn }] = await Promise.all([
    supabase.from("preventa_privada_obras").select("desde, max_por_persona").eq("production_id", id).maybeSingle(),
    funciones.length ? supabase.from("preventa_privada_funciones").select("performance_id, desde").in("performance_id", funciones.map((x) => x.id)) : Promise.resolve({ data: [] }),
  ]);
  const privadaDe = new Map(((privFn ?? []) as { performance_id: string; desde: string }[]).map((r) => [r.performance_id, r.desde]));
  const [asientosRes, vendidoRes] = gestionar ? await Promise.all([
    todasLasFilas((a, b) => supabase.from("seats").select("price_category_id").eq("production_id", id).eq("is_active", true).order("id").range(a, b)),
    funciones.length ? supabase.from("orders").select("performance_id, total").eq("status", "aprobado").in("performance_id", funciones.map((f) => f.id)) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const asientosPorZona = new Map<string, number>();
  for (const r of (asientosRes.data ?? []) as { price_category_id: string | null }[]) if (r.price_category_id) asientosPorZona.set(r.price_category_id, (asientosPorZona.get(r.price_category_id) ?? 0) + 1);
  const vendido = new Map<string, number>();
  for (const o of (vendidoRes.data ?? []) as { performance_id: string; total: number }[]) vendido.set(o.performance_id, (vendido.get(o.performance_id) ?? 0) + Number(o.total));
  const activas = funciones.filter((f) => !f.cancelada_at);
  const potencial = new Map(activas.map((f) => [f.id, ingresoPotencial(asientosPorZona, f.prices, zonas)]));
  const totalPotencial = [...potencial.values()].reduce((n, x) => n + x.total, 0);
  const totalVendido = activas.reduce((n, f) => n + (vendido.get(f.id) ?? 0), 0);
  const porReembolsar = new Map(await Promise.all(funciones.filter((f) => f.cancelada_at).map(async (f) => [f.id, await listOrders(id, { funcion: f.id, estado: "aprobado" })] as const)));

  return (
    <>
      {ventas && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">Venta de la obra: {p.on_sale ? "abierta" : "cerrada"}</p>
            <p className="text-sm text-texto-2">Interruptor general (el mismo de la versión actual). Cada función además tiene su propia venta.</p>
          </div>
          <ActionForm
            inline
            action={setProductionOnSale}
            hidden={{ pid: id, on_sale: String(!p.on_sale) }}
            confirm={p.on_sale ? "¿Cerrar la venta de toda la obra?" : "¿Abrir la venta de la obra?"}
            submit={p.on_sale ? "Cerrar venta" : "Abrir venta"}
          />
        </Card>
      )}

      {gestionar && <VentaAjustes pid={id} v={obraPre} />}

      {gestionar && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Preventas</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
              <span className="rounded-full bg-white/10 px-2.5 py-1">1 · Privada (con código)</span><Icono nombre="flecha-der" />
              <span className="rounded-full bg-oro/20 px-2.5 py-1 text-oro-claro">2 · Club Fan</span><Icono nombre="flecha-der" />
              <span className="rounded-full bg-exito/20 px-2.5 py-1">3 · Venta general</span>
            </p>
            <p className="text-sm text-texto-2">
              <b>Preventa privada</b> (opcional): desde esa fecha y hasta el inicio de la del Club Fan solo compran quienes usaron un código de <Link href={`/panel/producciones/${id}/boletos/preventa`} className="font-bold text-violeta-claro underline">Preventa privada</Link>; el público solo ve &quot;La venta abre el…&quot;.
              Antes del <b>inicio</b> nadie más puede comprar en línea; entre el inicio y el <b>fin</b> compran los socios del Club Fan (y quien tiene código); después, todos.
              Se pone en todas las funciones que no tengan fechas propias (en cada función puedes cambiarlas). Deja el fin vacío si no hay preventa: el inicio queda como apertura de la venta.
            </p>
          </div>
          <ActionForm action={savePreventaObra} hidden={{ pid: id }} submit="Guardar preventa" submitClass={ghost}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Inicio (CDMX)<input className={input} type="datetime-local" name="desde" defaultValue={isoToLocalMx((obraPre?.preventa_desde as string | null) ?? null)} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Fin: abre para todos (CDMX)<input className={input} type="datetime-local" name="hasta" defaultValue={isoToLocalMx((obraPre?.preventa_hasta as string | null) ?? null)} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Preventa privada desde (CDMX, opcional)<input className={input} type="datetime-local" name="privada" defaultValue={isoToLocalMx((privObra?.desde as string | null) ?? null)} /></label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Máx. boletos por persona en la privada (vacío = sin límite)<input className={input} type="number" min={1} max={50} name="privada_max" defaultValue={(privObra?.max_por_persona as number | null) ?? ""} /></label>
            </div>
          </ActionForm>
        </Card>
      )}

      {gestionar && activas.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Si se vende todo</h2>
            <p className="text-sm text-texto-2">Cuánto deja cada función llena con los precios que tiene hoy (sin descuentos ni cortesías) y cuánto llevas vendido.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-texto-3">
                <tr><th className="py-2 pr-3 font-semibold">Función</th><th className="py-2 pr-3 text-right font-semibold">Lugares</th><th className="py-2 pr-3 text-right font-semibold">Llena</th><th className="py-2 text-right font-semibold">Vendido</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {activas.map((f) => {
                  const x = potencial.get(f.id)!;
                  return (
                    <tr key={f.id}>
                      <td className="py-2 pr-3">{formatPerformanceDate(f.starts_at)}{x.sinPrecio > 0 && <span className="block text-xs text-aviso">{x.sinPrecio} asientos sin precio en esta función</span>}</td>
                      <td className="num py-2 pr-3 text-right">{x.lugares}</td>
                      <td className="num py-2 pr-3 text-right font-bold">{formatMoney(x.total)}</td>
                      <td className="num py-2 text-right text-texto-2">{formatMoney(vendido.get(f.id) ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/20 font-black">
                  <td className="py-2 pr-3">Todas las funciones ({activas.length})</td>
                  <td className="num py-2 pr-3 text-right">{activas.reduce((n, f) => n + potencial.get(f.id)!.lugares, 0)}</td>
                  <td className="num py-2 pr-3 text-right text-exito">{formatMoney(totalPotencial)}</td>
                  <td className="num py-2 text-right">{formatMoney(totalVendido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {gestionar && (
        <>
          {/* 0127: horarios de la obra y llamados (se crean solos en cada función). */}
          <LogisticaObra pid={id} l={logistica} />
          <LlamadosObra pid={id} llamados={llamados} />
          {/* 0085: cada función es un renglón compacto; "Editar" despliega su formulario. */}
          {funciones.map((f) => {
            const precios = f.prices.map((x) => x.price);
            if (f.cancelada_at) {
              const pagadas = porReembolsar.get(f.id) ?? [];
              return (
                <details key={f.id} id={`f-${f.id}`} className="rounded-[22px] border border-[#5a1a22] bg-telon">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-5 py-4">
                    <b className="line-through opacity-70">{formatPerformanceDate(f.starts_at)}</b>
                    <span className="rounded-full bg-[#5a1a22] px-2 py-0.5 text-[11px] uppercase text-[#fecdd3]">cancelada</span>
                    <span className="text-sm text-texto-3">{f.cancelada_motivo}</span>
                    {pagadas.length > 0 && <span className="text-sm font-bold text-aviso">{pagadas.length} por reembolsar</span>}
                  </summary>
                  <div className="border-t border-linea p-5 text-sm">
                    {pagadas.length === 0 ? <p className="text-texto-2">Nadie tenía boletos pagados.</p> : (
                      <ul className="flex flex-col divide-y divide-white/10">
                        {pagadas.map((o) => {
                          const wa = ligaWhatsApp(o.buyer_telefono, `¡Hola ${o.buyer_nombre.split(" ")[0]}! Te escribimos de DARF Productions: se canceló la función de ${p.nombre} (${formatPerformanceDate(f.starts_at)}). ${f.cancelada_motivo ?? ""} Queremos devolverte ${formatMoney(o.total)} de tu orden ${o.order_code}. ¿A qué cuenta te lo depositamos?`);
                          return (
                            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span><b>{o.buyer_nombre}</b> · {o.order_code} · {formatMoney(o.total)}{o.created_by_staff_id ? " · taquilla" : ""}</span>
                              {wa ? <a href={wa} target="_blank" rel="noreferrer" className={ghost}>WhatsApp</a> : <a href={`tel:${o.buyer_telefono}`} className="underline">{o.buyer_telefono}</a>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </details>
              );
            }
            return (
            <details key={f.id} id={`f-${f.id}`} open={funciones.length === 1} className="group scroll-mt-24 rounded-[22px] border border-linea bg-telon">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
                <span className="flex flex-wrap items-center gap-2">
                  <b>{formatPerformanceDate(f.starts_at)}</b>
                  {f.on_sale ? <span className="rounded-full bg-[#14532d] px-2 py-0.5 text-[11px] uppercase text-[#bbf7d0]">en venta</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase text-texto-3">sin venta</span>}
                  {privadaDe.has(f.id) && f.preventa_desde && f.preventa_desde > new Date().toISOString() && <span className="rounded-full border border-white/25 px-2 py-0.5 text-[11px] uppercase text-texto-2">privada desde {formatPerformanceDate(privadaDe.get(f.id)!).replace(/^\S+ /, "")}</span>}
                  {f.preventa_hasta && <span className="rounded-full border border-oro/40 px-2 py-0.5 text-[11px] uppercase text-oro-claro">preventa</span>}
                  {f.preventa_desde && f.preventa_desde > new Date().toISOString() && <span className="rounded-full border border-white/25 px-2 py-0.5 text-[11px] uppercase text-texto-2">abre {formatPerformanceDate(f.preventa_desde).replace(/^\S+ /, "")}</span>}
                  {f.prices.some((x) => x.propio) && <span className="rounded-full border border-violeta-claro/50 px-2 py-0.5 text-[11px] uppercase text-violeta-claro">precio propio</span>}
                  {f.starts_at && <span className="w-full text-xs text-texto-2">{lineaHorario(horario({ ...f, starts_at: f.starts_at }, logistica))}{f.puertas_at || f.termina_at ? " (propio)" : ""}</span>}
                  <span className="text-sm text-texto-3">{f.venue ? `${f.venue} · ` : ""}{precios.length ? `$${Math.min(...precios)}–$${Math.max(...precios)} · llena ${formatMoney(potencial.get(f.id)?.total ?? 0)}` : "sin precios"}</span>
                </span>
                <span className="text-sm font-bold text-violeta-claro">Editar <span className="inline-block transition-transform group-open:rotate-180"><Icono nombre="chevron-abajo" /></span></span>
              </summary>
              <div className="border-t border-linea p-5">
              <ActionForm action={updatePerformance} hidden={{ pid: id, perf: f.id }} submit="Guardar función">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">Fecha y hora (CDMX)
                    <input className={input} type="datetime-local" name="fecha" defaultValue={isoToLocalMx(f.starts_at)} />
                    <span className="text-xs font-normal text-texto-3">Vacía = por definir (no se puede vender).</span>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Sede (si es distinta a la de la obra)
                    <input className={input} name="venue" defaultValue={f.venue ?? ""} />
                  </label>
                </div>
                <fieldset className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <legend className="mb-1 text-sm font-semibold">Precio por zona (MXN)</legend>
                  {zonas.map((z) => (
                    <label key={z.id} className="flex flex-col gap-1 text-xs font-semibold">{z.nombre}{z.cupo != null && <span className="font-normal text-texto-3">Entrada general</span>}
                      <input className={input} type="number" min={0} step="1" name={`precio_${z.id}`} defaultValue={f.prices.find((x) => x.categoryId === z.id)?.price ?? ""} />
                      {f.prices.find((x) => x.categoryId === z.id)?.propio && <span className="font-normal text-violeta-claro" title="Poner el precio en todas las funciones no lo cambia. Escribe el precio de la zona para que vuelva a seguirla.">Precio propio{z.precio_base != null ? ` (zona: $${z.precio_base})` : ""}</span>}
                      {z.cupo != null && (
                        <input className={input} type="number" min={0} step="1" name={`cupo_${z.id}`} placeholder={`Cupo: ${z.cupo}`} title="Cupo en esta función (vacío = el de la zona)"
                          defaultValue={f.prices.find((x) => x.categoryId === z.id)?.cupo ?? ""} />
                      )}
                    </label>
                  ))}
                </fieldset>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="on_sale" defaultChecked={f.on_sale} /> Esta función está en venta en línea</label>
                <fieldset className="flex flex-col gap-2 rounded-lg bg-sala p-3">
                  <legend className="px-1 text-sm font-semibold">Preventa del Club Fan</legend>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="preventa_obra" defaultChecked={!f.preventa_propia} /> Usar las fechas de la obra (las de arriba)</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold">Inicio (nadie compra antes)
                      <input className={input} type="datetime-local" name="preventa_desde" defaultValue={isoToLocalMx(f.preventa_desde)} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold">Fin (después compran todos)
                      <input className={input} type="datetime-local" name="preventa_hasta" defaultValue={isoToLocalMx(f.preventa_hasta)} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Preventa privada desde (con código; antes del inicio)
                      <input className={input} type="datetime-local" name="preventa_privada" defaultValue={isoToLocalMx(privadaDe.get(f.id) ?? null)} />
                    </label>
                  </div>
                  <span className="text-xs text-texto-3">Para fechas solo de esta función, quita la palomita. Entre inicio y fin solo compran los socios (a quienes activaron el recordatorio les avisamos al abrir).</span>
                </fieldset>
              </ActionForm>
              {f.starts_at && (() => {
                const h = horario({ ...f, starts_at: f.starts_at }, logistica);
                const ls = horasLlamados({ starts_at: f.starts_at }, llamados);
                return (
                  <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
                    <p className="text-sm font-semibold">Horario de esta función</p>
                    {ls.length > 0 && <p className="text-xs text-texto-2">Llamados: {ls.map((x) => `${x.nombre} ${hora(x.hora)}`).join(" · ")}</p>}
                    <ActionForm action={saveHorarioFuncion} hidden={{ pid: id, perf: f.id }} submit="Guardar horario" submitClass={ghost}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-sm font-semibold">Puertas abren (CDMX)
                          <input className={input} type="datetime-local" name="puertas_at" defaultValue={isoToLocalMx(f.puertas_at ?? null)} />
                          <span className="text-xs font-normal text-texto-3">Vacío = la de la obra ({hora(h.puertas)}).</span>
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm font-semibold">Termina aprox. (CDMX)
                          <input className={input} type="datetime-local" name="termina_at" defaultValue={isoToLocalMx(f.termina_at ?? null)} />
                          <span className="text-xs font-normal text-texto-3">Vacío = con la duración de la obra ({hora(h.termina)}).</span>
                        </label>
                      </div>
                    </ActionForm>
                  </div>
                );
              })()}
              <div className="mt-3 border-t border-white/10 pt-3">
                <ActionForm inline action={deletePerformance} hidden={{ pid: id, perf: f.id }} confirm="¿Eliminar esta función? Solo se puede si no tiene boletos activos." submit="Eliminar función" submitClass={ghost} />
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold text-[#ff8fa3]">Cancelar función (lluvia, fuerza mayor…)</summary>
                  <div className="mt-2 max-w-md">
                    <ActionForm action={cancelPerformance} hidden={{ pid: id, perf: f.id }} confirm="¿Cancelar esta función? Ya no se vende, los apartados se cancelan y a quien pagó le avisamos que se le reembolsará. No se puede deshacer." submit="Cancelar función" submitClass={ghost}>
                      <label className="flex flex-col gap-1.5 text-sm font-semibold">Motivo (lo ve quien compró)
                        <input className={input} name="motivo" required maxLength={300} placeholder="Ej. Suspensión por lluvia" />
                      </label>
                    </ActionForm>
                  </div>
                </details>
              </div>
              </div>
            </details>
            );
          })}
          <details className="rounded-[22px] border border-linea bg-telon" open={funciones.length === 0}>
            <summary className="cursor-pointer list-none px-5 py-4 font-bold text-violeta-claro">+ Nueva función</summary>
            <div className="border-t border-linea p-5">
            <ActionForm action={createPerformance} hidden={{ pid: id }} submit="Crear función">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Fecha y hora (CDMX)
                  <input className={input} type="datetime-local" name="fecha" />
                  <span className="text-xs font-normal text-texto-3">Déjala vacía si aún no hay fecha.</span>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Sede (opcional)
                  <input className={input} name="venue" />
                </label>
              </div>
              <p className="text-xs text-texto-3">Los precios se copian de la función más reciente; ajústalos después.</p>
            </ActionForm>
            </div>
          </details>
          <AjustesSeccion id="zonas" titulo="Zonas de entrada general" resumen={`${zonas.filter((z) => z.cupo != null).length} zonas`}>
            <div>
              <p className="text-sm text-texto-2">Zonas sin asiento numerado (ej. Pista: 80 lugares). El cupo vale para todas las funciones; en cada función puedes poner otro. El precio que pongas aquí va a todas las funciones que aún no pasan.</p>
            </div>
            {zonas.filter((z) => z.cupo != null).map((z, i, gz) => (
              <div key={z.id} className="flex flex-col gap-2 border-b border-white/10 pb-3 last:border-0">
              <ActionForm action={saveGeneralZone} hidden={{ pid: id, zid: z.id }} submit="Guardar zona" submitClass={ghost}>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre<input className={input} name="nombre" defaultValue={z.nombre} required maxLength={60} /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">Cupo<input className={input} name="cupo" type="number" min={1} step="1" defaultValue={z.cupo ?? ""} required /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Descripción (opcional)<input className={input} name="descripcion" defaultValue={z.descripcion ?? ""} maxLength={200} /></label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="hidden" name="activa" value="off" /><input type="checkbox" name="activa" value="on" defaultChecked={z.is_active} /> Activa (se vende)</label>
              </ActionForm>
              <ZonaAcciones pid={id} zona={{ ...z, precio_base: z.precio_base ?? activas.find((f) => f.starts_at && f.starts_at > new Date().toISOString())?.prices.find((x) => x.categoryId === z.id)?.price ?? null }} primera={i === 0} ultima={i === gz.length - 1} asientos={0} otras={[]} />
              </div>
            ))}
            <ActionForm action={saveGeneralZone} hidden={{ pid: id }} submit="Crear zona">
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre<input className={input} name="nombre" required maxLength={60} placeholder="Pista" /></label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Cupo<input className={input} name="cupo" type="number" min={1} step="1" required placeholder="80" /></label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Descripción (opcional)<input className={input} name="descripcion" maxLength={200} placeholder="De pie, frente al escenario" /></label>
              </div>
            </ActionForm>
          </AjustesSeccion>
          {zonas.length === 0 && <Card>Esta obra no tiene zonas de precio todavía. Puedes crear zonas de entrada general arriba; un mapa de asientos nuevo se carga aparte.</Card>}
        </>
      )}
    </>
  );
}
