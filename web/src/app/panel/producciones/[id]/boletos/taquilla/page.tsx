import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { BeneficiosZona } from "@/components/BeneficiosZona";
import { listarBeneficios } from "@/lib/beneficios";
import { porZona, type Beneficio } from "@/lib/beneficios-rules";
import { boxOfficeData, generalAvailability, listPerformances } from "@/lib/boleteria";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { BoxOffice } from "./BoxOffice";
import { GeneralBoxOffice } from "./GeneralBoxOffice";
import { funcionDePuerta } from "../../puerta/door-rules";
import { getPromos } from "@/lib/promos";
import { conPromo, pctZona } from "@/lib/promo-rules";

export const metadata: Metadata = { title: "Taquilla" };

export default async function BoxOfficePage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/taquilla">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/taquilla`);
  if (!can(access, id, "ventas.operar")) redirect(salidaBoletos(access, id, "boletos/taquilla"));
  // 0088: solo funciones que no han pasado (hasta 3 h después de empezar, para quien llega tarde);
  // por omisión la de hoy o la siguiente, con la misma regla que Puerta.
  const ahora = new Date();
  const todas = (await listPerformances(id)).filter((f): f is typeof f & { starts_at: string } => !!f.starts_at && !f.cancelada_at);
  const funciones = todas.filter((f) => new Date(f.starts_at).getTime() > ahora.getTime() - 3 * 3600_000);
  const pasadas = todas.length - funciones.length;
  const pedida = typeof sp.funcion === "string" && funciones.some((f) => f.id === sp.funcion) ? sp.funcion : null;
  const funcion = pedida ?? funcionDePuerta(funciones, ahora) ?? undefined;
  const data = funcion ? await boxOfficeData(id, funcion) : null;
  // 0118: la taquilla también cobra con la promo de la función.
  const promos = funcion ? (await getPromos(id)).get(funcion) : undefined;
  const general = (funcion ? await generalAvailability(funcion) : []).map((z) => {
    const pct = pctZona(promos, z.price_category_id);
    return pct ? { ...z, precio: conPromo(z.precio, pct), antes: z.precio } : z;
  });
  const gen = new Set(general.map((z) => z.price_category_id));
  // 0122: qué incluye cada zona en esta función (para decirlo al vender).
  const benef = funcion ? porZona(await listarBeneficios(id), funcion) : new Map<string, Beneficio[]>();
  const zonasConBenef = [...general.map((z) => ({ id: z.price_category_id, nombre: z.nombre })), ...(data?.prices ?? []).filter((p) => !gen.has(p.categoryId)).map((p) => ({ id: p.categoryId, nombre: p.nombre }))]
    .filter((z) => benef.get(z.id)?.length);
  const numerados = (data?.prices ?? []).filter((p) => !gen.has(p.categoryId)).map((p) => {
    const pct = pctZona(promos, p.categoryId);
    return pct ? { ...p, price: conPromo(p.price, pct), antes: p.price } : p;
  });

  return (
    <>
      <div className="flex flex-wrap gap-2 text-sm">
        {funciones.map((f) => (
          <Link key={f.id} href={`?funcion=${f.id}`} className={`rounded-full border px-3 py-1.5 font-semibold ${f.id === funcion ? "border-texto" : "border-white/20"}`}>
            {formatPerformanceDate(f.starts_at)}{f.on_sale ? "" : " · sin venta en línea"}
          </Link>
        ))}
      </div>
      {pasadas > 0 && <p className="text-xs text-texto-3">{pasadas === 1 ? "1 función que ya pasó no aparece" : `${pasadas} funciones que ya pasaron no aparecen`}: ya no se puede vender para ellas.</p>}
      {!funcion && <Card>{todas.length ? "No hay funciones próximas para vender." : "Esta obra no tiene funciones con fecha. Créalas en Funciones y precios."}</Card>}
      {data?.error && <Card>No se pudo cargar el mapa: {data.error.message}</Card>}
      {data && !data.error && data.prices.length === 0 && <Card>Esta función no tiene precios. Agrégalos en Funciones y precios.</Card>}
      {zonasConBenef.length > 0 && (
        <Card className="grid gap-3 sm:grid-cols-2">
          {zonasConBenef.map((z) => (
            <div key={z.id}>
              <p className="mb-1 text-sm font-bold">{z.nombre} incluye</p>
              <BeneficiosZona beneficios={benef.get(z.id)} className="text-texto-2" />
            </div>
          ))}
        </Card>
      )}
      {funcion && general.length > 0 && <GeneralBoxOffice key={`g-${funcion}`} pid={id} performanceId={funcion} zones={general} />}
      {data && !data.error && numerados.length > 0 && funcion && (
        <BoxOffice key={funcion} pid={id} performanceId={funcion} formas={data.formas} seats={data.seats} taken={data.taken} prices={numerados} />
      )}
    </>
  );
}
