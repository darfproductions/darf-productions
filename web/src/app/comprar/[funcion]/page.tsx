import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { PasosBarra, PasosProvider } from "@/components/PasosCompra";
import { UnirseClub } from "@/components/fanzone/UnirseClub";
import { enPreventa, partesFuncion } from "@/lib/disponibilidad";
import { getCredencial } from "@/lib/fanzone";
import { getSession } from "@/lib/auth";
import { formatPerformanceDate, getPerformanceForSale, getTheme, themeStyle } from "@/lib/productions";
import { cleanSellerCode } from "@/lib/seller-rules";
import { createClient } from "@/lib/supabase/server";
import type { MapSeat } from "@/lib/tickets";
import { generalAvailability } from "@/lib/boleteria";
import { funcionVendible } from "@/lib/ventas-rules";
import { GeneralPicker } from "./GeneralPicker";
import { SeatPicker, type ZonePrice } from "./SeatPicker";
import { mensajeError } from "@/lib/errores";

export const metadata: Metadata = { title: "Comprar boletos" };

export default async function ComprarPage({ params, searchParams }: PageProps<"/comprar/[funcion]">) {
  const { funcion } = await params;
  const vendedor = cleanSellerCode((await searchParams).v);
  // El mapa se ve sin cuenta; para apartar se pide entrar (Bloque 2).
  const sp = await searchParams;
  const session = await getSession();
  const inicial = typeof sp.asientos === "string" ? sp.asientos.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20) : [];
  const data = await getPerformanceForSale(funcion);
  if (!data) notFound();
  const { performance: f, production: p } = data;
  const vendible = funcionVendible(f, p.concluded);
  const yaPaso = !!f.starts_at && !funcionVendible({ on_sale: true, starts_at: f.starts_at }, false);
  // Preventa del Club Fan (0076): quien no es socio puede unirse aquí mismo (la base lo exige igual).
  const preventa = vendible && enPreventa(f);
  const bloqueada = preventa && !(await getCredencial());
  const hasta = preventa && f.preventa_hasta ? partesFuncion(f.preventa_hasta) : null;

  const supabase = await createClient();
  // Antes de mostrar el mapa se liberan los asientos de órdenes vencidas (0054).
  if (vendible && session) await supabase.rpc("expire_due_orders", { pid: p.id });
  const [seatsRes, takenRes, pricesRes] = vendible
    ? await Promise.all([
        supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active").eq("production_id", p.id).limit(2000),
        supabase.rpc("get_taken_seats", { target_performance_id: f.id }),
        supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre, cupo, color)").eq("performance_id", f.id),
      ])
    : [null, null, null];

  const seats = ((seatsRes?.data ?? []) as (MapSeat & { is_active: boolean })[]).filter((s) => s.is_active);
  const taken = (takenRes?.data ?? []) as string[];
  // Zonas con asiento para el mapa; las de entrada general van aparte (0055).
  const general = vendible ? await generalAvailability(f.id) : [];
  const prices: ZonePrice[] = (pricesRes?.data ?? []).filter((r) => (r.price_categories as unknown as { cupo: number | null } | null)?.cupo == null).map((r) => ({
    categoryId: r.price_category_id as string,
    price: Number(r.price),
    nombre: (r.price_categories as unknown as { nombre: string } | null)?.nombre ?? "",
    color: (r.price_categories as unknown as { color: string | null } | null)?.color ?? null,
  }));
  // Link de vendedor: el código se revisa aquí para mostrar su nombre desde el inicio.
  const sellerRes = vendible && vendedor && session ? await supabase.rpc("preview_seller_code", { target_performance_id: f.id, target_code: vendedor }) : null;
  const sellerCheck = sellerRes && vendedor
    ? (sellerRes.error ? { ok: false, text: mensajeError(sellerRes.error), code: vendedor } : { ok: true, text: `Vendedor: ${sellerRes.data as string}`, code: vendedor })
    : null;
  const loadError = seatsRes?.error || takenRes?.error || pricesRes?.error;

  return (
    <main style={themeStyle(getTheme(p))} className="pb-10">
      <PageHeading eyebrow={`Comprar boletos · ${p.nombre}`} title={prices.length === 0 && general.length > 0 ? "Elige tus boletos" : "Elige tus asientos"}>
        <span className="capitalize">{formatPerformanceDate(f.starts_at)}</span> · {f.venue ?? p.venue}
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {!vendible ? (
          <div className="rounded-2xl bg-telon p-8">
            <p className="text-lg">{yaPaso ? "Esta función ya pasó." : "Esta función no está a la venta en este momento."}</p>
            <Link href={`/producciones/${p.id}`} className="mt-4 inline-block font-bold text-violeta-claro">← Volver a la obra</Link>
          </div>
        ) : bloqueada ? (
          <div className="flex max-w-2xl flex-col items-start gap-4 rounded-[22px] border border-oro/40 bg-[#120f17] p-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG del kit */}
            <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-8 w-auto" />
            <p className="text-2xl font-black uppercase tracking-[-0.02em]">Preventa para el <span className="txt-oro">Club Fan</span></p>
            <p className="text-texto-2">Esta función está en preventa{hasta ? ` hasta el ${hasta.dia} ${hasta.numero} ${hasta.mes}, ${hasta.hora}` : ""}. Únete gratis al Club Fan y compra antes que nadie; después se abre para todos.</p>
            {session ? <UnirseClub /> : (
              <Link href={`/entrar?next=${encodeURIComponent(`/comprar/${f.id}`)}`} className="fb fb-fz">Entra o crea tu cuenta para unirte</Link>
            )}
            <Link href={`/producciones/${p.id}`} className="text-sm font-bold text-texto-3 hover:text-texto">← Volver a la obra</Link>
          </div>
        ) : loadError ? (
          <p role="alert" className="rounded-2xl bg-telon p-8">No se pudo cargar el mapa de asientos. Recarga la página.</p>
        ) : prices.length === 0 && general.length === 0 ? (
          <p className="rounded-2xl bg-telon p-8">Esta función aún no tiene precios disponibles. Intenta más tarde.</p>
        ) : (
          <PasosProvider>
          <div className="flex flex-col gap-10">
          <PasosBarra />
          {general.length > 0 && (
            <GeneralPicker performanceId={f.id} productionName={p.nombre} zones={general}
              defaultPhone={session?.profile?.telefono ?? ""} defaultSeller={vendedor ?? ""} sinSesion={!session} />
          )}
          {prices.length > 0 && general.length > 0 && <h2 className="titular text-2xl">O elige asientos numerados</h2>}
          {prices.length > 0 && <SeatPicker
            performanceId={f.id}
            productionId={p.id}
            productionName={p.nombre}
            seats={seats}
            taken={taken}
            prices={prices}
            defaultPhone={session?.profile?.telefono ?? ""}
            defaultSeller={vendedor ?? ""}
            defaultSellerCheck={sellerCheck}
            sinSesion={!session}
            inicial={inicial}
          />}
          </div>
          </PasosProvider>
        )}
      </div>
    </main>
  );
}
