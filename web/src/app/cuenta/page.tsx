import type { Metadata } from "next";
import QRCode from "qrcode";
import { CopyLink } from "@/components/panel/CopyLink";
import { sellerPath, type MySale } from "@/lib/seller-rules";
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
import { AvatarUpload } from "./AvatarUpload";
import { EmailForm, PasswordForm, ProfileForm } from "./ProfileForm";
import { funcionPasada } from "@/lib/account-rules";
import { limiteTexto, recordatorio, tiempoRestante } from "@/lib/expiry-rules";

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
  expires_at: string | null;
  vencida_at: string | null;
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
  await supabase.rpc("expire_due_orders", { pid: null });
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_code, status, total, discount_amount, discount_codigo, buyer_telefono, created_at, expires_at, vencida_at, performances(starts_at, production_id, productions(nombre)), tickets(id, is_active, qr_token, checked_in_at, seats(seat_label))")
    .eq("buyer_user_id", session.userId)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as unknown as OrderRow[];

  // QR generados en el servidor solo para boletos activos de órdenes aprobadas.
  const qrs = new Map<string, string>();
  for (const o of orders) {
    if (o.status !== "aprobado" || funcionPasada(o.performances?.starts_at ?? null)) continue;
    for (const t of o.tickets) if (t.is_active) qrs.set(t.id, await QRCode.toDataURL(t.qr_token, { margin: 1, width: 240 }));
  }

  // Mis audiciones (0036): solo las propias; QR mientras no haya llegado.
  const [audiciones, invitaciones, ofertas, misObras, sinLeer, misVentas] = await Promise.all([
    listMyApplications(session.userId), listMyInvites(), listMyOffers(), supabase.rpc("my_productions"), supabase.rpc("my_unread_announcements"),
    supabase.rpc("my_seller"),
  ]);
  const ventas = (misVentas.data ?? []) as MySale[];
  const miCodigo = ventas[0]?.codigo ?? null;
  const obrasVenta = ventas.filter((v) => v.production_id);
  const avisosDe = (pid: string) => ((sinLeer.data ?? []) as { production_id: string; sin_leer: number }[]).find((x) => x.production_id === pid)?.sin_leer ?? 0;
  const producciones = (misObras.data ?? []) as { production_id: string; nombre: string; papeles: string[] }[];
  const ofertasPendientes = ofertas.filter((o) => o.estado === "enviada");
  const pendientes = invitaciones.filter((i) => !i.inscrito);
  const audQr = new Map<string, string>();
  for (const a of audiciones) {
    if (!a.checked_in_at && a.auditions?.estado !== "cancelada" && !["cancelado", "no_cumple"].includes(a.estado)) audQr.set(a.id, await QRCode.toDataURL(a.qr_token, { margin: 1, width: 200 }));
  }

  const fotoUrl = session.profile?.foto_path
    ? (await supabase.storage.from("avatares").createSignedUrl(session.profile.foto_path, 3600)).data?.signedUrl ?? null
    : null;
  const ahora = new Date();
  const recordatorios = orders.filter((o) => o.status === "aprobado" && o.tickets.some((t) => t.is_active) && recordatorio(o.performances?.starts_at ?? null));
  const proximas = orders.filter((o) => !funcionPasada(o.performances?.starts_at ?? null, ahora));
  const pasadas = orders.filter((o) => funcionPasada(o.performances?.starts_at ?? null, ahora));
  const renderOrder = (o: OrderRow) => {
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
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${STATUS[o.status].cls}`}>{o.vencida_at ? "Vencida" : STATUS[o.status].label}</span>
                  </div>
                  {o.vencida_at && <p className="text-sm text-texto-3">No se confirmó el pago a tiempo y los asientos se liberaron. Puedes volver a comprar si sigue habiendo lugares.</p>}
                  {o.status === "pendiente" && o.expires_at && tiempoRestante(o.expires_at) && (
                    <p className="text-sm text-[#fde68a]">Paga antes de <b>{limiteTexto(o.expires_at)}</b> (te quedan {tiempoRestante(o.expires_at)}). Si no, los asientos se liberan solos.</p>
                  )}
                  {o.status === "pendiente" && (
                    wa ? (
                      <a href={wa} className="self-start rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-[#062b16]">Pagar por WhatsApp</a>
                    ) : (
                      <p className="text-sm text-texto-3">Pago por WhatsApp: sin número configurado en este entorno.</p>
                    )
                  )}
                  {o.status === "aprobado" && o.tickets.some((t) => t.is_active) && !funcionPasada(o.performances?.starts_at ?? null) && (
                    <a href={`/cuenta/boletos/${encodeURIComponent(o.order_code)}/pdf`} className="self-start rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold hover:border-white/60">Descargar boletos (PDF)</a>
                  )}
                  {o.status === "aprobado" && (
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {o.tickets.filter((t) => t.is_active).map((t) => (
                        <li key={t.id} className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 text-sala">
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada (data URL) */}
                          {qrs.get(t.id) ? <img src={qrs.get(t.id)} alt={`Código QR del asiento ${t.seats?.seat_label ?? ""}`} width={160} height={160} /> : <p className="text-xs text-[#555]">Función pasada</p>}
                          <p className="text-sm font-bold">{t.seats?.seat_label ?? "Admisión general"}</p>
                          {t.checked_in_at && <p className="text-xs font-semibold text-[#8a1c2c]">Ya utilizado</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
  };

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
          {recordatorios.map((o) => (
            <p key={o.id} role="status" className="rounded-xl border border-[#c4b5fd]/40 bg-[#c4b5fd]/10 px-4 py-3">
              <b>{recordatorio(o.performances?.starts_at ?? null)}:</b> {o.performances?.productions?.nombre} ·{" "}
              <span className="capitalize">{formatPerformanceDate(o.performances?.starts_at ?? null)}</span>. Lleva tus códigos QR (abajo).
            </p>
          ))}
          {error && <p role="alert" className="text-[#ff8fa3]">No se pudieron cargar tus boletos.</p>}
          {!error && orders.length === 0 && <p className="rounded-2xl bg-telon p-6 text-texto-2">Todavía no tienes compras.</p>}
          {!error && orders.length > 0 && proximas.length === 0 && <p className="rounded-2xl bg-telon p-6 text-texto-2">No tienes funciones próximas.</p>}
          <ul className="flex flex-col gap-4">
            {proximas.map(renderOrder)}
          </ul>
          {pasadas.length > 0 && (
            <details className="rounded-2xl bg-telon/60 p-4">
              <summary className="cursor-pointer font-bold">Funciones pasadas ({pasadas.length})</summary>
              <ul className="mt-4 flex flex-col gap-4">{pasadas.map(renderOrder)}</ul>
            </details>
          )}
        </section>

        <aside className="flex flex-col gap-6 lg:col-span-4">
          <section aria-labelledby="perfil" className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
            <h2 id="perfil" className="text-lg font-bold">Perfil</h2>
            <AvatarUpload uid={session.userId} url={fotoUrl} inicial={(session.profile?.nombre || session.email).slice(0, 1).toUpperCase()} />
            <ProfileForm
              nombres={session.profile?.nombres ?? session.profile?.nombre ?? ""}
              apellidos={session.profile?.apellidos ?? ""}
              telefono={session.profile?.telefono ?? ""}
              fecha={session.profile?.fecha_nacimiento ?? ""}
            />
          </section>
          <details className="rounded-2xl bg-telon p-6">
            <summary className="cursor-pointer text-lg font-bold">Correo y contraseña</summary>
            <div className="mt-4 flex flex-col gap-6">
              <EmailForm email={session.email} />
              <PasswordForm />
            </div>
          </details>
          <form action={logout}>
            <button className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold">Cerrar sesión</button>
          </form>
        </aside>

        {miCodigo && (
          <section aria-labelledby="mis-ventas" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="mis-ventas" className="titular text-2xl">Mis ventas</h2>
            <div className="flex flex-col gap-3 rounded-2xl bg-telon p-5">
              <p className="text-sm text-texto-2">
                Tu código de vendedor: <b className="font-mono text-lg tracking-widest text-texto">{miCodigo}</b>. Funciona en las obras donde estás
                activo (tu elenco, o donde te active el equipo). Comparte tu link: quien compre desde ahí ya trae tu código.
              </p>
              {obrasVenta.length > 0 ? (
                <ul className="flex flex-col divide-y divide-white/10 text-sm">
                  {obrasVenta.map((v) => (
                    <li key={v.production_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>
                        <b>{v.obra}</b>
                        <span className="block text-xs text-texto-3">
                          {v.boletos} {v.boletos === 1 ? "boleto" : "boletos"} · {formatMoney(Number(v.monto))}{v.pendientes ? ` · ${v.pendientes} por aprobar` : ""}
                          {!v.activo && " · tu código ya no está activo aquí"}
                        </span>
                      </span>
                      {v.en_venta && <CopyLink path={sellerPath(v.production_id!, miCodigo)} />}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-texto-3">Aún no estás activo como vendedor en ninguna obra.</p>}
            </div>
          </section>
        )}

        {producciones.length > 0 && (
          <section aria-labelledby="mis-producciones" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="mis-producciones" className="titular text-2xl">Mis producciones</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {producciones.map((p) => (
                <li key={p.production_id}>
                  <Link href={`/cuenta/produccion/${p.production_id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
                    <p className="text-lg font-bold">{p.nombre}{avisosDe(p.production_id) > 0 && <span className="ml-2 rounded-full bg-[#be123c] px-2 py-0.5 text-xs text-white">{avisosDe(p.production_id)} {avisosDe(p.production_id) === 1 ? "aviso" : "avisos"}</span>}</p>
                    <p className="text-sm text-texto-2">{p.papeles.join(" · ") || "Integrante"}</p>
                    <span className="mt-2 inline-block text-sm font-bold text-violeta-claro">Avisos, ensayos, materiales y mi expediente →</span>
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
