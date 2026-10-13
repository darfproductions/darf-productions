import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { boxOfficeData, generalAvailability, listPerformances } from "@/lib/boleteria";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { BoxOffice } from "./BoxOffice";
import { GeneralBoxOffice } from "./GeneralBoxOffice";
import { funcionDePuerta } from "../../puerta/door-rules";

export const metadata: Metadata = { title: "Taquilla" };

export default async function BoxOfficePage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/taquilla">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/taquilla`);
  if (!can(access, id, "ventas.operar")) redirect(`/panel/producciones/${id}/boletos`);
  // 0088: solo funciones que no han pasado (hasta 3 h después de empezar, para quien llega tarde);
  // por omisión la de hoy o la siguiente, con la misma regla que Puerta.
  const ahora = new Date();
  const todas = (await listPerformances(id)).filter((f): f is typeof f & { starts_at: string } => !!f.starts_at);
  const funciones = todas.filter((f) => new Date(f.starts_at).getTime() > ahora.getTime() - 3 * 3600_000);
  const pasadas = todas.length - funciones.length;
  const pedida = typeof sp.funcion === "string" && funciones.some((f) => f.id === sp.funcion) ? sp.funcion : null;
  const funcion = pedida ?? funcionDePuerta(funciones, ahora) ?? undefined;
  const data = funcion ? await boxOfficeData(id, funcion) : null;
  const general = funcion ? await generalAvailability(funcion) : [];
  const gen = new Set(general.map((z) => z.price_category_id));
  const numerados = (data?.prices ?? []).filter((p) => !gen.has(p.categoryId));

  return (
    <>
      <div className="flex flex-wrap gap-2 text-sm">
        {funciones.map((f) => (
          <Link key={f.id} href={`?funcion=${f.id}`} className={`rounded-full border px-3 py-1.5 font-semibold capitalize ${f.id === funcion ? "border-texto" : "border-white/20"}`}>
            {formatPerformanceDate(f.starts_at)}{f.on_sale ? "" : " · sin venta en línea"}
          </Link>
        ))}
      </div>
      {pasadas > 0 && <p className="text-xs text-texto-3">{pasadas === 1 ? "1 función que ya pasó no aparece" : `${pasadas} funciones que ya pasaron no aparecen`}: ya no se puede vender para ellas.</p>}
      {!funcion && <Card>{todas.length ? "No hay funciones próximas para vender." : "Esta obra no tiene funciones con fecha. Créalas en Funciones y precios."}</Card>}
      {data?.error && <Card>No se pudo cargar el mapa: {data.error.message}</Card>}
      {data && !data.error && data.prices.length === 0 && <Card>Esta función no tiene precios. Agrégalos en Funciones y precios.</Card>}
      {funcion && general.length > 0 && <GeneralBoxOffice key={`g-${funcion}`} pid={id} performanceId={funcion} zones={general} />}
      {data && !data.error && numerados.length > 0 && funcion && (
        <BoxOffice key={funcion} pid={id} performanceId={funcion} seats={data.seats} taken={data.taken} prices={numerados} />
      )}
    </>
  );
}
