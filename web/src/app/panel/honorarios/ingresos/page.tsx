import type { Metadata } from "next";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle } from "@/components/panel/ui";
import { getAdeudos } from "@/lib/adeudos";
import { mayus } from "@/lib/dates";
import { getHonorarios } from "@/lib/honorarios";
import { requireCabeza } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ingresos" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const mesCorto = (p: string) => mayus(new Date(`${p.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "short", timeZone: "UTC" }));
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Honorarios · Ingresos (Diego 2026-11-20): atajo para ver, en cada taller con mensualidad, quién ya pagó y quién debe
// (el mismo cálculo de la pestaña Adeudos de la obra), con ligas a su tabla de cuotas y a sus adeudos.
export default async function Ingresos() {
  await requireCabeza("/panel/honorarios/ingresos");
  const h = await getHonorarios();
  const obras = h.obras.filter((o) => o.mensual);
  const datos = await Promise.all(obras.map(async (o) => ({ o, a: await getAdeudos(o.production_id) })));

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Ingresos">
        Quién ya pagó y quién debe en cada taller con mensualidad, a hoy. Para registrar pagos, entra a la tabla de cuotas de la obra.
      </PanelTitle>
      {obras.length === 0 && <Card className="text-texto-2">No hay obras con mensualidad en honorarios.</Card>}
      {datos.map(({ o, a }) => {
        const activos = a.filas.filter((f) => !f.baja);
        const deben = activos.filter((f) => f.adeudo.total > 0).sort((x, y) => y.adeudo.total - x.adeudo.total);
        const alCorriente = activos.filter((f) => f.adeudo.total === 0 && !f.beca);
        const becas = activos.filter((f) => f.beca);
        const total = deben.reduce((s, f) => s + f.adeudo.total, 0);
        return (
          <Card key={o.production_id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="titular text-xl">{o.nombre}</h2>
              <span className="flex flex-wrap gap-2">
                <Link href={`/panel/producciones/${o.production_id}/expedientes/cuotas`} className={chico}>Tabla de cuotas <Icono nombre="flecha-der" /></Link>
                <Link href={`/panel/producciones/${o.production_id}/expedientes/adeudos`} className={chico}>Adeudos <Icono nombre="flecha-der" /></Link>
              </span>
            </div>
            {!a.cobra ? (
              <p className="text-sm text-texto-3">Esta obra todavía no cobra mensualidad (se cambia en su página de Honorarios).</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-sala px-4 py-3"><p className="text-xs text-texto-3">Al corriente</p><p className="text-2xl font-black text-exito">{alCorriente.length}</p></div>
                  <div className="rounded-xl bg-sala px-4 py-3"><p className="text-xs text-texto-3">Deben</p><p className="text-2xl font-black text-[#ff8fa3]">{deben.length}</p></div>
                  <div className="rounded-xl bg-sala px-4 py-3"><p className="text-xs text-texto-3">Por cobrar</p><p className="text-2xl font-black">{pesos(total)}</p></div>
                  <div className="rounded-xl bg-sala px-4 py-3"><p className="text-xs text-texto-3">Becas</p><p className="text-2xl font-black">{becas.length}</p></div>
                </div>
                {deben.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-bold">Deben</p>
                    <ul className="flex flex-col text-sm">
                      {deben.map((f) => (
                        <li key={f.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-1.5">
                          <Link href={f.href} className="font-semibold hover:underline">{f.nombre}{f.sinCuenta && <span className="ml-1 text-xs font-normal text-texto-3">(sin cuenta)</span>}</Link>
                          <span className="text-texto-2">
                            {f.adeudo.meses.map((m) => `${mesCorto(m.periodo)}${m.vencido ? "" : " (aún a tiempo)"}`).join(", ")}{f.adeudo.inscripcion ? `${f.adeudo.meses.length ? " · " : ""}inscripción` : ""} · <b className="text-texto">{pesos(f.adeudo.total)}</b>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {alCorriente.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold">Al corriente ({alCorriente.length})</summary>
                    <p className="mt-1 text-sm text-texto-2">{alCorriente.map((f) => f.nombre).join(", ")}</p>
                  </details>
                )}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
