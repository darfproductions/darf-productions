import type { Metadata } from "next";
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
import { cancelPerformance, createPerformance, deletePerformance, saveGeneralZone, setProductionOnSale, updatePerformance } from "../actions";

export const metadata: Metadata = { title: "Funciones y precios" };

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

// Funciones de la obra: fecha (o "por definir"), sede, precios por zona y venta.
export default async function PerformancesPage({ params }: PageProps<"/panel/producciones/[id]/boletos/funciones">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/funciones`);
  const gestionar = can(access, id, "funciones.gestionar");
  const ventas = can(access, id, "ventas.operar");
  if (!gestionar && !ventas) redirect(salidaBoletos(access, id, "boletos/funciones"));
  const [p, funciones, zonas] = await Promise.all([getPanelProduction(id), listPerformances(id), listZones(id)]);
  if (!p) redirect("/panel/producciones");
  // Funciones canceladas (0091): quién pagó y hay que reembolsar, con WhatsApp para avisarle.
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

      {gestionar && (
        <>
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
                  {f.preventa_hasta && <span className="rounded-full border border-oro/40 px-2 py-0.5 text-[11px] uppercase text-oro-claro">preventa</span>}
                  <span className="text-sm text-texto-3">{f.venue ? `${f.venue} · ` : ""}{precios.length ? `$${Math.min(...precios)}–$${Math.max(...precios)}` : "sin precios"}</span>
                </span>
                <span className="text-sm font-bold text-violeta-claro">Editar <span className="inline-block transition-transform group-open:rotate-180">▾</span></span>
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
                      {z.cupo != null && (
                        <input className={input} type="number" min={0} step="1" name={`cupo_${z.id}`} placeholder={`Cupo: ${z.cupo}`} title="Cupo en esta función (vacío = el de la zona)"
                          defaultValue={f.prices.find((x) => x.categoryId === z.id)?.cupo ?? ""} />
                      )}
                    </label>
                  ))}
                </fieldset>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="on_sale" defaultChecked={f.on_sale} /> Esta función está en venta en línea</label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Preventa Fan Zone hasta
                  <input className={input} type="datetime-local" name="preventa_hasta" defaultValue={isoToLocalMx(f.preventa_hasta)} />
                  <span className="text-xs font-normal text-texto-3">Opcional. Con la función en venta, hasta esta fecha solo compran los socios del Club Fan (a quienes activaron el recordatorio les avisamos). Después, venta para todos.</span>
                </label>
              </ActionForm>
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
          <AjustesSeccion id="zonas" titulo="⚙ Zonas de entrada general" resumen={`${zonas.filter((z) => z.cupo != null).length} zonas`}>
            <div>
              <p className="text-sm text-texto-2">Zonas sin asiento numerado (ej. Pista: 80 lugares). El cupo vale para todas las funciones; en cada función puedes poner otro. Luego ponle precio en cada función.</p>
            </div>
            {zonas.filter((z) => z.cupo != null).map((z) => (
              <ActionForm key={z.id} action={saveGeneralZone} hidden={{ pid: id, zid: z.id }} submit="Guardar zona" submitClass={ghost}>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre<input className={input} name="nombre" defaultValue={z.nombre} required maxLength={60} /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">Cupo<input className={input} name="cupo" type="number" min={1} step="1" defaultValue={z.cupo ?? ""} required /></label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Descripción (opcional)<input className={input} name="descripcion" defaultValue={z.descripcion ?? ""} maxLength={200} /></label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="hidden" name="activa" value="off" /><input type="checkbox" name="activa" value="on" defaultChecked={z.is_active} /> Activa (se vende)</label>
              </ActionForm>
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
