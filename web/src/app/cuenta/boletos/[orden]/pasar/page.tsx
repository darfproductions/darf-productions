import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Icono } from "@/components/Icono";
import { requireSession } from "@/lib/auth";
import { formatPerformanceDate } from "@/lib/productions";
import { origenSitio } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";
import { boletosPasables, puedePasar } from "@/lib/traspaso-rules";
import { PasarForm } from "./PasarForm";

export const metadata: Metadata = { title: "Pasar boletos" };

type Row = {
  id: string; order_code: string; status: string;
  performances: { starts_at: string | null; venue: string | null; cancelada_at: string | null; productions: { nombre: string; venue: string | null } | null } | null;
  tickets: { id: string; is_active: boolean; checked_in_at: string | null; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[];
};

// Pasar boletos de una orden pagada a otra persona (0142).
export default async function PasarBoletos({ params }: PageProps<"/cuenta/boletos/[orden]/pasar">) {
  const { orden } = await params;
  const session = await requireSession(`/cuenta/boletos/${orden}/pasar`);
  const supabase = await createClient();
  const [{ data }, origen] = await Promise.all([
    supabase.from("orders").select("id, order_code, status, performances(starts_at, venue, cancelada_at, productions(nombre, venue)), tickets(id, is_active, checked_in_at, seats(seat_label), price_categories(nombre))")
      .eq("order_code", orden).eq("buyer_user_id", session.userId).maybeSingle(),
    origenSitio(),
  ]);
  if (!data) notFound();
  const o = data as unknown as Row;
  const obra = o.performances?.productions?.nombre ?? "Producción";
  const funcion = formatPerformanceDate(o.performances?.starts_at ?? null);
  const ok = puedePasar(o, o.performances?.starts_at ?? null, !!o.performances?.cancelada_at);
  const boletos = boletosPasables(o.tickets).map((t) => ({ id: t.id, etiqueta: t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : "Admisión general") }));
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mis boletos" title="Pasar boletos a otra persona">{obra} · {funcion} · Orden {o.order_code}</PageHeading>
      <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-5 md:px-16">
        <Link href={`/cuenta#o-${o.order_code}`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
        {ok ? <PasarForm order={o.id} boletos={boletos} obra={obra} funcion={funcion} origen={origen} />
          : <p className="rounded-2xl bg-telon p-5 text-sm text-texto-2">Estos boletos ya no se pueden pasar: solo se pasan boletos pagados, sin usar y antes de que empiece la función.</p>}
      </div>
    </main>
  );
}
