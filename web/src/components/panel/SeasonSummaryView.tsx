import { TIPO_CREDITO } from "@/lib/casting-rules";
import { pesos } from "@/lib/member-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { ocupacion, pct, type SeasonSummary } from "@/lib/season-rules";
import { formatMoney } from "@/lib/tickets";

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-sala p-3 print:border print:border-black/20 print:bg-transparent">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-texto-3">{k}</p>
      <p className="mt-0.5 text-lg font-black">{v}</p>
    </div>
  );
}
const h3 = "mb-2 mt-2 font-bold";

// Resumen de temporada (0053): en vivo antes de cerrar o congelado al cerrar.
export function SeasonSummaryView({ s }: { s: SeasonSummary }) {
  const v = s.ventas;
  const ocup = ocupacion(v.boletos, s.asientos, s.funciones.length, s.capacidad);
  const asist = pct(v.asistieron, v.boletos);
  const ens = pct(s.ensayos.presentes, s.ensayos.presentes + s.ensayos.faltas);
  const elenco = Object.entries(s.elenco);
  return (
    <div className="flex flex-col gap-4 print:text-black">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Ingresos por boletos" v={formatMoney(Number(v.ingresos))} />
        <Stat k="Boletos vendidos" v={String(v.boletos)} />
        <Stat k="Asistieron" v={asist === null ? "—" : `${v.asistieron} (${asist} %)`} />
        <Stat k="Ocupación" v={ocup === null ? "—" : `${ocup} %`} />
        <Stat k="Funciones" v={String(s.funciones.length)} />
        <Stat k="Descuentos dados" v={formatMoney(Number(v.descuentos))} />
        <Stat k="Cobrado en taller" v={pesos(Number(s.taller.cobrado))} />
        <Stat k="Asistencia a ensayos" v={ens === null ? "—" : `${ens} %`} />
      </div>

      <div>
        <h3 className={h3}>Por función</h3>
        <ul className="flex flex-col divide-y divide-white/10 text-sm print:divide-black/10">
          {s.funciones.map((f, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span className="capitalize">{formatPerformanceDate(f.starts_at)}</span>
              <span>{f.boletos} boletos{f.capacidad ? ` de ${f.capacidad} (${pct(f.boletos, f.capacidad)} %)` : ""} · {f.asistieron} entraron · {formatMoney(Number(f.ingresos))}</span>
            </li>
          ))}
          {s.funciones.length === 0 && <li className="py-1.5 text-texto-3">Sin funciones.</li>}
        </ul>
      </div>

      {s.vendedores.length > 0 && (
        <div>
          <h3 className={h3}>Vendedores</h3>
          <ol className="flex flex-col divide-y divide-white/10 text-sm print:divide-black/10">
            {s.vendedores.map((x, i) => (
              <li key={x.codigo} className="flex justify-between gap-2 py-1.5">
                <span>{i + 1}. {x.nombre} <span className="text-texto-3">· {x.codigo}</span></span>
                <span>{x.ordenes} órdenes · {formatMoney(Number(x.monto))}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <h3 className={h3}>Elenco y equipos</h3>
          {elenco.length ? (
            <ul className="text-sm">{elenco.map(([t, n]) => <li key={t}>{TIPO_CREDITO[t] ?? t}: {n}</li>)}</ul>
          ) : <p className="text-sm text-texto-3">Sin créditos.</p>}
        </div>
        <div>
          <h3 className={h3}>Taller</h3>
          <p className="text-sm">{s.taller.integrantes} integrantes · {s.taller.activos} activos</p>
          <p className="text-sm">{s.ensayos.programados} ensayos</p>
        </div>
        <div>
          <h3 className={h3}>Audiciones</h3>
          <p className="text-sm">{s.audiciones.convocatorias} convocatorias · {s.audiciones.solicitudes} solicitudes</p>
        </div>
      </div>
    </div>
  );
}
