import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { formatPerformanceDate, getPerformanceForSale, getTheme, themeStyle } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import type { MapSeat } from "@/lib/tickets";
import { SeatPicker, type ZonePrice } from "./SeatPicker";

export const metadata: Metadata = { title: "Comprar boletos" };

export default async function ComprarPage({ params }: PageProps<"/comprar/[funcion]">) {
  const { funcion } = await params;
  const session = await requireSession(`/comprar/${funcion}`);
  const data = await getPerformanceForSale(funcion);
  if (!data) notFound();
  const { performance: f, production: p } = data;
  const vendible = f.on_sale && !!f.starts_at && !p.concluded;

  const supabase = await createClient();
  const [seatsRes, takenRes, pricesRes] = vendible
    ? await Promise.all([
        supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active").eq("production_id", p.id).limit(2000),
        supabase.rpc("get_taken_seats", { target_performance_id: f.id }),
        supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre)").eq("performance_id", f.id),
      ])
    : [null, null, null];

  const seats = ((seatsRes?.data ?? []) as (MapSeat & { is_active: boolean })[]).filter((s) => s.is_active);
  const taken = (takenRes?.data ?? []) as string[];
  const prices: ZonePrice[] = (pricesRes?.data ?? []).map((r) => ({
    categoryId: r.price_category_id as string,
    price: Number(r.price),
    nombre: (r.price_categories as unknown as { nombre: string } | null)?.nombre ?? "",
  }));
  const loadError = seatsRes?.error || takenRes?.error || pricesRes?.error;

  return (
    <main style={themeStyle(getTheme(p))} className="pb-10">
      <PageHeading eyebrow={`Comprar boletos · ${p.nombre}`} title="Elige tus asientos">
        <span className="capitalize">{formatPerformanceDate(f.starts_at)}</span> · {f.venue ?? p.venue}
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {!vendible ? (
          <div className="rounded-2xl bg-telon p-8">
            <p className="text-lg">Esta función no está a la venta en este momento.</p>
            <Link href={`/producciones/${p.id}`} className="mt-4 inline-block font-bold text-violeta-claro">← Volver a la obra</Link>
          </div>
        ) : loadError ? (
          <p role="alert" className="rounded-2xl bg-telon p-8">No se pudo cargar el mapa de asientos. Recarga la página.</p>
        ) : prices.length === 0 ? (
          <p className="rounded-2xl bg-telon p-8">Esta función aún no tiene precios disponibles. Intenta más tarde.</p>
        ) : (
          <SeatPicker
            performanceId={f.id}
            productionName={p.nombre}
            seats={seats}
            taken={taken}
            prices={prices}
            defaultPhone={session.profile?.telefono ?? ""}
          />
        )}
      </div>
    </main>
  );
}
