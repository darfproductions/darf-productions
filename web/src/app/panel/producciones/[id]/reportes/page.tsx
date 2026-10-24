import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { listOrders, listPerformances, listZones, salesSummary, seatCount } from "@/lib/boleteria";
import { mesNombre, pesos, recaudacion } from "@/lib/member-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { porcentaje } from "@/lib/rehearsal-rules";
import { asistenciaTotal, conteo, descuentosUsados, ventasPorCanal, type Asistencia } from "@/lib/report-rules";
import { capacidadFuncion, occupancy, summarizeSales } from "@/lib/sales";
import { TIPO_VENDEDOR, type SellerRow, podio, rankingVendedores } from "@/lib/seller-rules";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";
import { mayus } from "@/lib/dates";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { AjustesSeccion } from "@/components/panel/AjustesSeccion";
import { PrintButton } from "@/components/PrintButton";
import { SeasonSummaryView } from "@/components/panel/SeasonSummaryView";
import type { SeasonSummary } from "@/lib/season-rules";

export const metadata: Metadata = { title: "Reportes" };

const ESTADOS_AUD: [string, string][] = [
  ["inscrito", "Inscritos"], ["convocado", "Convocados"], ["callback", "Callback"], ["seleccionado", "Seleccionados"],
  ["no_seleccionado", "No seleccionados"], ["en_espera", "En espera"], ["no_cumple", "No cumple"], ["cancelado", "Cancelados"],
];

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-sala p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-texto-3">{k}</p>
      <p className="mt-0.5 text-lg font-black">{v}</p>
    </div>
  );
}

// Reportes de la obra: cada sección aparece solo si quien entra tiene el permiso de esa área.
export default async function Reportes({ params }: PageProps<"/panel/producciones/[id]/reportes">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/reportes`);
  if (!can(access, id, "reportes.ver")) redirect(`/panel/producciones/${id}`);
  const verVentas = can(access, id, "ventas.ver");
  const verTaller = can(access, id, "mensualidades.gestionar");
  const verAsist = can(access, id, "ensayos.gestionar") || can(access, id, "expedientes.ver");
  const verAud = can(access, id, "audiciones.gestionar");
  const supabase = await createClient();
  const temporada = ((await supabase.rpc("season_summary", { pid: id })).data ?? null) as SeasonSummary | null;
  const none = Promise.resolve({ data: [] });

  const [funciones, orders, resumen, asientos, pagos, asist, roster, auds, vend, zonas] = await Promise.all([
    verVentas ? listPerformances(id) : Promise.resolve([]),
    verVentas ? listOrders(id, { todas: true }) : Promise.resolve([]),
    verVentas ? salesSummary(id) : Promise.resolve(null),
    verVentas ? seatCount(id) : Promise.resolve(0),
    verTaller ? todasLasFilas((a, b) => supabase.from("member_payments").select("monto, concepto, registrado_at").eq("production_id", id).is("anulado_at", null).order("id").range(a, b)) : none,
    verAsist ? supabase.rpc("attendance_summary", { pid: id }) : none,
    verAsist ? supabase.rpc("cast_roster", { pid: id }) : none,
    verAud ? supabase.from("auditions").select("id, titulo, estado, audition_applications!audition_applications_audition_id_fkey(estado)").eq("production_id", id).order("created_at", { ascending: false }) : none,
    verVentas ? supabase.rpc("seller_list", { pid: id }) : none,
    verVentas ? listZones(id) : Promise.resolve([]),
  ]);
  const vendedores = rankingVendedores(((vend.data ?? []) as SellerRow[]).filter((v) => v.ordenes > 0 || v.pendientes > 0));

  const s = resumen ?? summarizeSales([]);
  const canal = ventasPorCanal(orders);
  const descuentos = descuentosUsados(orders);
  const rec = recaudacion((pagos.data ?? []) as { monto: number; concepto?: string; registrado_at: string }[]);
  const filas = (asist.data ?? []) as (Asistencia & { user_id: string })[];
  const total = asistenciaTotal(filas);
  const nombres = new Map(((roster.data ?? []) as { user_id: string; nombre: string }[]).map((r) => [r.user_id, r.nombre]));
  const bajas = filas
    .map((f) => ({ ...f, pct: porcentaje(f) }))
    .filter((f) => f.pct !== null && f.pct < 80)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const audiciones = (auds.data ?? []) as { id: string; titulo: string; estado: string; audition_applications: { estado: string }[] }[];
  const nada = !verVentas && !verTaller && !verAsist && !verAud;

  return (
    <div className="flex flex-col gap-4">
      {nada && <Card>Tu rol puede ver reportes, pero no tiene acceso a ventas, taller, ensayos ni audiciones de esta obra.</Card>}

      {verVentas && (
        <Card className="flex flex-col gap-4">
          <h2 className="titular text-xl">Boletos</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat k="Ingresos aprobados" v={formatMoney(s.ingresos)} />
            <Stat k="Boletos vendidos" v={String(s.vendidos)} />
            <Stat k="Asistieron" v={s.vendidos ? `${s.validados} (${Math.round((s.validados / s.vendidos) * 100)} %)` : "0"} />
            <Stat k="Por aprobar" v={`${s.ordenesPendientes} · ${formatMoney(s.pendiente)}`} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Stat k="En línea" v={`${canal.web.boletos} boletos · ${formatMoney(canal.web.ingresos)}`} />
            <Stat k="Taquilla" v={`${canal.taquilla.boletos} boletos · ${formatMoney(canal.taquilla.ingresos)}`} />
          </div>
          <div>
            <h3 className="mb-2 font-bold">Por función</h3>
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {funciones.map((f) => {
                const v = s.porFuncion.get(f.id);
                return (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-semibold">{formatPerformanceDate(f.starts_at)}</span>
                    <span className="text-texto-2">
                      Ocupación {occupancy(v?.vendidos ?? 0, capacidadFuncion(asientos, f.prices, zonas))} · asistieron {v?.validados ?? 0} · {formatMoney(v?.ingresos ?? 0)}
                    </span>
                  </li>
                );
              })}
              {funciones.length === 0 && <li className="py-2 text-texto-3">Esta obra no tiene funciones.</li>}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-bold">Códigos de descuento usados</h3>
            {descuentos.length ? (
              <ul className="flex flex-col divide-y divide-white/10 text-sm">
                {descuentos.map((d) => (
                  <li key={d.codigo} className="flex flex-wrap justify-between gap-2 py-2">
                    <b>{d.codigo}</b>
                    <span className="text-texto-2">{d.usos} {d.usos === 1 ? "orden" : "órdenes"} · descontado {formatMoney(d.descontado)} · cobrado {formatMoney(d.ingresos)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-texto-3">Nadie ha usado códigos todavía.</p>}
          </div>
          <div>
            <h3 className="mb-2 font-bold">Ranking de vendedores</h3>
            {vendedores.length ? (
              <ol className="flex flex-col divide-y divide-white/10 text-sm">
                {vendedores.map((v, i) => (
                  <li key={v.seller_id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="flex items-center gap-2"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${podio(i)}`}>{i + 1}</span><span><b>{v.nombre}</b> <span className="text-texto-3">· {TIPO_VENDEDOR[v.tipo]} · {v.codigo}</span></span></span>
                    <span className="text-texto-2">{v.boletos} boletos · {formatMoney(Number(v.monto))}{v.pendientes ? ` · ${v.pendientes} por aprobar` : ""}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-texto-3">Nadie ha vendido con código todavía.</p>}
          </div>
        </Card>
      )}

      {verTaller && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Taller: lo cobrado</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat k="Total" v={pesos(rec.total)} />
            <Stat k="Mensualidades" v={pesos(rec.mensualidades)} />
            <Stat k="Inscripciones" v={pesos(rec.inscripciones)} />
          </div>
          {rec.meses.length > 0 && (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {rec.meses.map((m) => (
                <li key={m.mes} className="flex justify-between gap-2 py-2">
                  <span>{mayus(mesNombre(m.mes))}</span>
                  <span className="text-texto-2">{pesos(m.total)}{m.inscripciones ? ` (inscripciones ${pesos(m.inscripciones)})` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {verAsist && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Asistencia a ensayos</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Stat k="Asistencia" v={porcentaje(total) === null ? "—" : `${porcentaje(total)} %`} />
            <Stat k="Presentes" v={String(total.presentes)} />
            <Stat k="Retardos" v={String(total.retardos)} />
            <Stat k="Faltas" v={String(total.faltas)} />
            <Stat k="Justificadas" v={String(total.justificadas)} />
          </div>
          <h3 className="font-bold">Por debajo de 80 %</h3>
          {bajas.length ? (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {bajas.map((b) => (
                <li key={b.user_id} className="flex justify-between gap-2 py-2">
                  <span>{nombres.get(b.user_id) ?? "Integrante"}</span>
                  <span className="text-texto-2">{b.pct} % · {b.faltas} faltas · {b.retardos} retardos</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-texto-3">Nadie está por debajo de 80 %.</p>}
        </Card>
      )}

      {verAud && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Audiciones</h2>
          {audiciones.map((a) => {
            const c = conteo(a.audition_applications);
            return (
              <div key={a.id} className="rounded-lg bg-sala p-3 text-sm">
                <p className="font-bold">{a.titulo} <span className="font-normal text-texto-3">· {a.estado} · {a.audition_applications.length} solicitudes</span></p>
                <p className="mt-1 text-texto-2">
                  {ESTADOS_AUD.filter(([e]) => c.get(e)).map(([e, l]) => `${l}: ${c.get(e)}`).join(" · ") || "Sin solicitudes."}
                </p>
              </div>
            );
          })}
          {audiciones.length === 0 && <p className="text-sm text-texto-3">Esta obra no tiene audiciones.</p>}
        </Card>
      )}
      {/* Resumen de la temporada (el mismo que se congela al cerrar), para imprimir o guardar en PDF. */}
      <AjustesSeccion id="temporada" titulo="Resumen de la temporada" resumen="Así quedará el resumen si cierras hoy · se puede imprimir">
        <div className="flex justify-end"><PrintButton /></div>
        {temporada ? <SeasonSummaryView s={temporada} verTaller={verTaller || can(access, id, "obra.publicar")} /> : <p className="text-sm text-texto-3">No se pudo calcular.</p>}
      </AjustesSeccion>
    </div>
  );
}
