import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { getTransacciones } from "@/lib/historial";
import { formatPerformanceDate } from "@/lib/productions";
import { formatMoney } from "@/lib/tickets";

export const metadata: Metadata = { title: "Transacciones" };

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
const ESTADO: Record<string, { t: string; c: string }> = {
  aprobado: { t: "Pagada", c: "text-exito" },
  pendiente: { t: "Pendiente de pago", c: "text-aviso" },
  rechazado: { t: "Cancelada", c: "text-texto-3" },
};

// Transacciones (bloque 5): todas mis órdenes con su estado. El pago es por transferencia y se
// confirma en el panel; aquí solo se consulta.
export default async function Transacciones() {
  const session = await requireSession("/cuenta/transacciones");
  const lista = await getTransacciones(session.userId);
  const pagado = lista.filter((o) => o.status === "aprobado").reduce((n, o) => n + o.total, 0);
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Mi cuenta" title="Transacciones">
        Todas tus órdenes de boletos: pagadas, pendientes y canceladas.
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        <Link href="/cuenta" className="text-sm font-bold text-lila">← Mi cuenta</Link>
        {lista.length === 0 ? (
          <p className="tarjeta p-6 text-texto-2">Todavía no tienes compras. <Link href="/producciones?estado=cartelera" className="font-bold text-lila">Ver producciones →</Link></p>
        ) : (
          <>
            <p className="text-sm text-texto-2">{lista.length} {lista.length === 1 ? "orden" : "órdenes"} · Pagado en total <b className="num text-texto">{formatMoney(pagado)}</b></p>
            <ul className="flex flex-col gap-3">
              {lista.map((o) => (
                <li key={o.id} className="tarjeta grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-texto-3">{o.codigo} · {fecha(o.creada)}</p>
                    <p className="font-bold">{o.obra}</p>
                    <p className="text-sm capitalize text-texto-2">{formatPerformanceDate(o.funcion)} · {o.boletos} {o.boletos === 1 ? "boleto" : "boletos"}</p>
                    {o.codigoDescuento && <p className="text-xs text-texto-3">Código {o.codigoDescuento}: −{formatMoney(o.descuento)}</p>}
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <b className="num text-lg">{formatMoney(o.total)}</b>
                    <span className={`text-xs font-bold ${ESTADO[o.status]?.c ?? ""}`}>{o.status === "rechazado" && o.vencida ? "Venció sin pago" : ESTADO[o.status]?.t}</span>
                    {o.status !== "rechazado" && <Link href={`/cuenta?orden=${o.codigo}`} className="text-xs font-bold text-lila">Ver boletos →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
