import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { pesos } from "@/lib/member-rules";
import { requireDirector } from "@/lib/permissions";
import { ocupacion, pct, totales, type OverviewRow } from "@/lib/season-rules";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";

export const metadata: Metadata = { title: "Reporte general" };

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <Card className="p-4 md:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-texto-3">{k}</p>
      <p className="mt-1 text-xl font-black">{v}</p>
    </Card>
  );
}

// Reporte general (solo el Director): todas las obras juntas y los vendedores de todas.
export default async function ReporteGeneral({ searchParams }: PageProps<"/panel/reportes">) {
  await requireDirector("/panel/reportes");
  const sp = await searchParams;
  const filtro = typeof sp.estado === "string" ? sp.estado : "";
  const supabase = await createClient();
  const [ov, sel, cap] = await Promise.all([supabase.rpc("director_overview"), supabase.rpc("director_sellers"), supabase.rpc("director_capacity")]);
  const capacidad = new Map(((cap.data ?? []) as { production_id: string; capacidad: number }[]).map((c) => [c.production_id, c.capacidad]));
  const todas = ((ov.data ?? []) as OverviewRow[]).map((r) => ({ ...r, capacidad: capacidad.get(r.production_id) }));
  const rows = filtro ? todas.filter((r) => r.estado === filtro) : todas;
  const t = totales(rows);
  const vendedores = (sel.data ?? []) as { nombre: string; codigo: string; tipo: string; obras: number; ordenes: number; monto: number }[];
  const asist = pct(t.asistieron, t.boletos);

  return (
    <>
      <PanelTitle eyebrow="Director" title="Reporte general">Todas las obras juntas: boletos, talleres, elenco y audiciones.</PanelTitle>
      {ov.error && <p className="text-[#ff8fa3]">{ov.error.message}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        {[["", "Todas"], ["publicada", "Publicadas"], ["borrador", "Borradores"], ["archivada", "Archivadas"]].map(([v, l]) => (
          <Link key={v} href={v ? `/panel/reportes?estado=${v}` : "/panel/reportes"} className={`rounded-full border px-3 py-1.5 font-semibold ${filtro === v ? "border-texto" : "border-white/20"}`}>{l}</Link>
        ))}
        <span className="ml-auto"><PrintButton /></span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Ingresos por boletos" v={formatMoney(t.ingresos)} />
        <Stat k="Boletos vendidos" v={String(t.boletos)} />
        <Stat k="Asistieron" v={asist === null ? "—" : `${t.asistieron} (${asist} %)`} />
        <Stat k="Cobrado en talleres" v={pesos(t.cobrado_taller)} />
        <Stat k="Funciones" v={String(t.funciones)} />
        <Stat k="Órdenes por aprobar" v={String(t.pendientes)} />
        <Stat k="Integrantes activos" v={String(t.integrantes_activos)} />
        <Stat k="Solicitudes de audición" v={String(t.solicitudes)} />
      </div>

      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-texto-3">
            <tr className="border-b border-white/10">
              {["Obra", "Funciones", "Boletos", "Ocupación", "Asistencia", "Ingresos", "Taller", "Integrantes", "Audiciones"].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => {
              const oc = ocupacion(r.boletos, r.asientos, r.funciones, r.capacidad);
              const as = pct(r.asistieron, r.boletos);
              return (
                <tr key={r.production_id}>
                  <td className="px-4 py-3">
                    <Link href={`/panel/producciones/${r.production_id}/reportes`} className="font-bold hover:text-violeta-claro">{r.nombre}</Link>
                    <span className="ml-2 inline-block align-middle"><EstadoChip estado={r.estado} /></span>
                    {r.cerrado_at && <Link href={`/panel/producciones/${r.production_id}/cierre`} className="block text-xs text-texto-3 underline">Resumen de cierre</Link>}
                    {r.pendientes > 0 && <span className="block text-xs text-[#fde68a]">{r.pendientes} órdenes por aprobar</span>}
                  </td>
                  <td className="px-4 py-3">{r.funciones}{r.funciones_futuras ? <span className="text-texto-3"> ({r.funciones_futuras} próximas)</span> : ""}</td>
                  <td className="px-4 py-3">{r.boletos}</td>
                  <td className="px-4 py-3">{oc === null ? "—" : `${oc} %`}</td>
                  <td className="px-4 py-3">{as === null ? "—" : `${as} %`}</td>
                  <td className="px-4 py-3">{formatMoney(Number(r.ingresos))}</td>
                  <td className="px-4 py-3">{Number(r.cobrado_taller) ? pesos(Number(r.cobrado_taller)) : "—"}</td>
                  <td className="px-4 py-3">{r.integrantes_activos || "—"}</td>
                  <td className="px-4 py-3">{r.solicitudes || "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-3 text-texto-3">No hay obras con ese estado.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="titular mb-3 text-xl">Vendedores (todas las obras)</h2>
        {vendedores.length ? (
          <ol className="flex flex-col divide-y divide-white/10 text-sm">
            {vendedores.map((v, i) => (
              <li key={v.codigo} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{i + 1}. <b>{v.nombre}</b> <span className="text-texto-3">· {v.codigo} · {v.tipo === "externo" ? "externo" : "cuenta"} · {v.obras} {v.obras === 1 ? "obra" : "obras"}</span></span>
                <span className="text-texto-2">{v.ordenes} órdenes · {formatMoney(Number(v.monto))}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-texto-3">Nadie ha vendido con código todavía.</p>}
      </Card>
    </>
  );
}
