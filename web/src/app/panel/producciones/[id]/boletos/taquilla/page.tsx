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

export const metadata: Metadata = { title: "Taquilla" };

export default async function BoxOfficePage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/taquilla">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/taquilla`);
  if (!can(access, id, "ventas.operar")) redirect(`/panel/producciones/${id}/boletos`);
  const funciones = (await listPerformances(id)).filter((f) => f.starts_at);
  const funcion = typeof sp.funcion === "string" ? sp.funcion : funciones[0]?.id;
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
      {!funcion && <Card>Esta obra no tiene funciones con fecha. Créalas en Funciones y precios.</Card>}
      {data?.error && <Card>No se pudo cargar el mapa: {data.error.message}</Card>}
      {data && !data.error && data.prices.length === 0 && <Card>Esta función no tiene precios. Agrégalos en Funciones y precios.</Card>}
      {funcion && general.length > 0 && <GeneralBoxOffice key={`g-${funcion}`} pid={id} performanceId={funcion} zones={general} />}
      {data && !data.error && numerados.length > 0 && funcion && (
        <BoxOffice key={funcion} pid={id} performanceId={funcion} seats={data.seats} taken={data.taken} prices={numerados} />
      )}
    </>
  );
}
