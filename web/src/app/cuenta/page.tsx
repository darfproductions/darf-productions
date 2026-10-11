import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageHeading } from "@/components/PageHeading";
import { requireSession } from "@/lib/auth";
import { ESTADO_SOLICITUD } from "@/lib/audition-rules";
import { formatSlot, listMyApplications, listMyInvites } from "@/lib/auditions";
import { listMyOffers, offerLabel } from "@/lib/casting";
import { OfferReplyForm } from "./OfferReplyForm";
import { env } from "@/lib/env";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, whatsappPayUrl } from "@/lib/tickets";
import { logout } from "../entrar/actions";
import Link from "next/link";
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

  // Mis audiciones (0036): solo las propias; QR mientras no haya llegado.
  const [audiciones, invitaciones, ofertas, misObras] = await Promise.all([
    listMyApplications(session.userId), listMyInvites(), listMyOffers(), supabase.rpc("my_productions"),
  ]);
  const producciones = (misObras.data ?? []) as { production_id: string; nombre: string; papeles: string[] }[];
  const ofertasPendientes = ofertas.filter((o) => o.estado === "enviada");
  const pendientes = invitaciones.filter((i) => !i.inscrito);
  const audQr = new Map<string, string>();
  for (const a of audiciones) {
    if (!a.checked_in_at && a.auditions?.estado !== "cancelada" && !["cancelado", "no_cumple"].includes(a.estado)) audQr.set(a.id, await QRCode.toDataURL(a.qr_token, { margin: 1, width: 200 }));
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

        {producciones.length > 0 && (
          <section aria-labelledby="mis-producciones" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="mis-producciones" className="titular text-2xl">Mis producciones</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {producciones.map((p) => (
                <li key={p.production_id}>
                  <Link href={`/cuenta/produccion/${p.production_id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
                    <p className="text-lg font-bold">{p.nombre}</p>
                    <p className="text-sm text-texto-2">{p.papeles.join(" · ") || "Integrante"}</p>
                    <span className="mt-2 inline-block text-sm font-bold text-violeta-claro">Mi expediente y mensualidades →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {ofertasPendientes.length > 0 && (
          <section aria-labelledby="ofertas" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="ofertas" className="titular text-2xl">Tienes {ofertasPendientes.length === 1 ? "una oferta" : `${ofertasPendientes.length} ofertas`} de papel</h2>
            <ul className="flex flex-col gap-3">
              {ofertasPendientes.map((o) => (
                <li key={o.id} className="flex flex-col gap-3 rounded-2xl border border-[#7ee2a8]/40 bg-[#7ee2a8]/10 p-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{o.obra}</p>
                    <p className="text-xl font-bold">{offerLabel(o)}</p>
                    {o.mensaje && <p className="mt-1 whitespace-pre-line text-texto-2">{o.mensaje}</p>}
                    {o.responder_antes && <p className="mt-1 text-sm capitalize text-texto-2">Responde antes del {formatSlot(o.responder_antes)}</p>}
                  </div>
                  <OfferReplyForm id={o.id} label={`${offerLabel(o)} en ${o.obra}`} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendientes.length > 0 && (
          <section aria-labelledby="invitaciones" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="invitaciones" className="titular text-2xl">Te invitaron a audicionar</h2>
            <ul className="flex flex-col gap-3">
              {pendientes.map((i) => (
                <li key={i.audition_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c4b5fd]/40 bg-telon p-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{i.obra ?? "Convocatoria DARF"}</p>
                    <p className="text-lg font-bold">{i.titulo}</p>
                    {i.inscripcion_cierra && <p className="text-sm capitalize text-texto-2">Inscripción hasta {formatSlot(i.inscripcion_cierra)}</p>}
                  </div>
                  <Link href={`/audiciones/${i.audition_id}`} className="boton-compra rounded-full px-5 py-2.5 text-sm font-bold">Inscribirme</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {audiciones.length > 0 && (
          <section aria-labelledby="mis-audiciones" className="flex flex-col gap-4 lg:col-span-8">
            <h2 id="mis-audiciones" className="titular text-2xl">Mis audiciones</h2>
            <ul className="flex flex-col gap-4">
              {audiciones.map((a) => (
                <li key={a.id} className="flex flex-col gap-4 rounded-2xl bg-telon p-5 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR generado (data URL) */}
                  {audQr.get(a.id) && <img src={audQr.get(a.id)} alt="QR de la audición" width={120} height={120} className="rounded-lg bg-white p-1.5" />}
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-lg font-bold">{a.auditions?.titulo ?? "Audición"}</p>
                    {a.audition_slots && <p className="text-sm capitalize text-texto-2">{formatSlot(a.audition_slots.inicia)}{a.audition_slots.sala ? ` · ${a.audition_slots.sala}` : ""}</p>}
                    <p className="text-sm">
                      {a.auditions?.estado === "cancelada"
                        ? <span className="rounded-full bg-[#5a1a22] px-2.5 py-1 text-xs font-bold text-[#fecdd3]">Convocatoria cancelada</span>
                        : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO_SOLICITUD[a.estado]?.cls ?? ""}`}>{ESTADO_SOLICITUD[a.estado]?.label ?? a.estado}</span>}
                      {a.numero && <span className="ml-2">Número {a.numero}</span>}
                    </p>
                    <Link href={`/audiciones/${a.audition_id}`} className="mt-1 text-sm font-bold text-violeta-claro">Ver convocatoria →</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
