import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, whatsappPayUrl } from "@/lib/tickets";
import { logout } from "../entrar/actions";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Mi cuenta" };

type OrderRow = {
  id: string;
  order_code: string;
  status: "pendiente" | "aprobado" | "rechazado";
  total: number;
  discount_amount: number | null;
  discount_codigo: string | null;
  buyer_telefono: string;
  created_at: string;
  performances: { starts_at: string | null; production_id: string; productions: { nombre: string } | null } | null;
  tickets: { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; seats: { seat_label: string } | null }[];
};

const STATUS: Record<OrderRow["status"], { label: string; cls: string }> = {
  pendiente: { label: "Pendiente de pago", cls: "bg-[#fcefd4] text-[#7a4b00]" },
  aprobado: { label: "Aprobada", cls: "bg-[#ddf3e5] text-[#1c6b3c]" },
  rechazado: { label: "Rechazada", cls: "bg-[#fbe0e4] text-[#8a1c2c]" },
};

export default async function CuentaPage({ searchParams }: PageProps<"/cuenta">) {
  const session = await requireSession("/cuenta");
  const sp = await searchParams;
  const nueva = typeof sp.orden === "string" ? sp.orden : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_code, status, total, discount_amount, discount_codigo, buyer_telefono, created_at, performances(starts_at, production_id, productions(nombre)), tickets(id, is_active, qr_token, checked_in_at, seats(seat_label))")
    .eq("buyer_user_id", session.userId)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as unknown as OrderRow[];

  // QR generados en el servidor solo para boletos activos de órdenes aprobadas.
  const qrs = new Map<string, string>();
  for (const o of orders) {
    if (o.status !== "aprobado") continue;
    for (const t of o.tickets) if (t.is_active) qrs.set(t.id, await QRCode.toDataURL(t.qr_token, { margin: 1, width: 240 }));
  }

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title={`Hola, ${session.profile?.nombre || "fan DARF"}`} />
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        <section aria-labelledby="boletos" className="flex flex-col gap-4 lg:col-span-8">
          <h2 id="boletos" className="titular text-2xl">Mis boletos</h2>
          {nueva && (
            <p role="status" className="rounded-xl border border-[#7ee2a8]/40 bg-[#7ee2a8]/10 px-4 py-3">
              Tu solicitud <b>{nueva}</b> quedó guardada y tus asientos están apartados. Cuando confirmemos tu
              pago, tus boletos con QR aparecerán aquí.
            </p>
          )}
          {error && <p role="alert" className="text-[#ff8fa3]">No se pudieron cargar tus boletos.</p>}
          {!error && orders.length === 0 && <p className="rounded-2xl bg-telon p-6 text-texto-2">Todavía no tienes compras.</p>}
          <ul className="flex flex-col gap-4">
            {orders.map((o) => {
              const nombre = o.performances?.productions?.nombre ?? "Producción";
              const seats = o.tickets.filter((t) => t.is_active).map((t) => t.seats?.seat_label ?? "—");
              const wa = o.status === "pendiente"
                ? whatsappPayUrl(env.whatsapp, {
                    prodName: nombre, orderCode: o.order_code, seats, total: Number(o.total),
                    buyerPhone: o.buyer_telefono, discountCode: o.discount_codigo, discountAmount: Number(o.discount_amount ?? 0),
                  })
                : "";
              return (
                <li key={o.id} className="flex flex-col gap-4 rounded-2xl bg-telon p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">{nombre}</p>
                      <p className="text-sm capitalize text-texto-2">{formatPerformanceDate(o.performances?.starts_at ?? null)}</p>
                      <p className="mt-1 text-sm text-texto-3">Orden {o.order_code} · {formatMoney(Number(o.total))}{o.discount_codigo ? ` · código ${o.discount_codigo}` : ""}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                  </div>
                  {o.status === "pendiente" && (
                    wa ? (
                      <a href={wa} className="self-start rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-[#062b16]">Pagar por WhatsApp</a>
                    ) : (
                      <p className="text-sm text-texto-3">Pago por WhatsApp: sin número configurado en este entorno.</p>
                    )
                  )}
                  {o.status === "aprobado" && (
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {o.tickets.filter((t) => t.is_active).map((t) => (
                        <li key={t.id} className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 text-sala">
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada (data URL) */}
                          <img src={qrs.get(t.id)} alt={`Código QR del asiento ${t.seats?.seat_label ?? ""}`} width={160} height={160} />
                          <p className="text-sm font-bold">{t.seats?.seat_label ?? "Admisión general"}</p>
                          {t.checked_in_at && <p className="text-xs font-semibold text-[#8a1c2c]">Ya utilizado</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="flex flex-col gap-6 lg:col-span-4">
          <section aria-labelledby="perfil" className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
            <h2 id="perfil" className="text-lg font-bold">Perfil</h2>
            <ProfileForm nombre={session.profile?.nombre ?? ""} telefono={session.profile?.telefono ?? ""} email={session.email} />
          </section>
          <form action={logout}>
            <button className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold">Cerrar sesión</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
