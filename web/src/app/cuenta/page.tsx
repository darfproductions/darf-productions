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
import { formatPerformanceDate, getTheme } from "@/lib/productions";
import type { KitColumns } from "@/lib/themes";
import { estiloDe, type BoletoVista } from "@/lib/ticket-design";
import { OrderTickets } from "@/components/tickets/OrderTickets";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, whatsappPayUrl } from "@/lib/tickets";
import { logout } from "../entrar/actions";
import Link from "next/link";
import { listNotifications, unreadCount } from "@/lib/notifications";
import { AvatarUpload } from "./AvatarUpload";
import { MiGafete } from "@/components/gafete/MiGafete";
import { getMiGafete } from "@/lib/gafete";
import { MiCredencialFan } from "@/components/fanzone/MiCredencialFan";
import { getMiCredencialFan } from "@/lib/fanzone";
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
  buyer_nombre: string;
  performances: { starts_at: string | null; venue: string | null; production_id: string; productions: (KitColumns & { nombre: string; venue: string | null }) | null } | null;
  tickets: { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[];
};

/** Asiento o "General · zona" (0055). */
const etiqueta = (t: { seats: { seat_label: string } | null; price_categories: { nombre: string } | null }) =>
  t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : "Admisión general");

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
    .select("id, order_code, status, total, discount_amount, discount_codigo, buyer_telefono, buyer_nombre, created_at, expires_at, vencida_at, performances(starts_at, venue, production_id, productions(nombre, venue, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase)), tickets(id, is_active, qr_token, checked_in_at, seats(seat_label), price_categories(nombre))")
    .eq("buyer_user_id", session.userId)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as unknown as OrderRow[];
  // Los boletos de una orden pendiente no se ven (ni su QR) hasta aprobarse; aquí solo sus asientos (0068).
  const asientosPendientes = new Map<string, string[]>();
  if (orders.some((o) => o.status === "pendiente")) {
    const { data: items } = await supabase.rpc("my_pending_order_items");
    for (const it of (items ?? []) as { order_id: string; etiqueta: string }[]) asientosPendientes.set(it.order_id, [...(asientosPendientes.get(it.order_id) ?? []), it.etiqueta]);
  }

  // QR generados en el servidor solo para boletos activos de órdenes aprobadas.
  const qrs = new Map<string, string>();
  for (const o of orders) {
    if (o.status !== "aprobado" || funcionPasada(o.performances?.starts_at ?? null)) continue;
    for (const t of o.tickets) if (t.is_active) qrs.set(t.id, await QRCode.toDataURL(t.qr_token, { margin: 1, width: 240 }));
  }

  // Mis audiciones (0036): solo las propias; QR mientras no haya llegado.
  const [audiciones, invitaciones, ofertas, misObras, sinLeer, misVentas, miEquipo, equipoPend, notis, notisNuevas, gafete, credencialFan] = await Promise.all([
    listMyApplications(session.userId), listMyInvites(), listMyOffers(), supabase.rpc("my_productions"), supabase.rpc("my_unread_announcements"),
    supabase.rpc("my_seller"), supabase.rpc("my_team_productions"), supabase.rpc("my_team_unread"),
    listNotifications({ limit: 3 }), unreadCount(), getMiGafete(), getMiCredencialFan(),
  ]);
  const equipos = (miEquipo.data ?? []) as { production_id: string | null; nombre: string; roles: string[] }[];
  const pendEquipo = new Map(((equipoPend.data ?? []) as { production_id: string | null; avisos: number; notas: number }[]).map((x) => [x.production_id ?? "general", x]));
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
              const activos = o.tickets.filter((t) => t.is_active);
              const seats = o.status === "pendiente" ? (asientosPendientes.get(o.id) ?? []) : activos.map((t) => etiqueta(t));
              const prod = o.performances?.productions ?? null;
              const estilo = estiloDe(prod ? getTheme(prod) : null);
              const boletos: BoletoVista[] = activos.map((t) => ({
                id: t.id,
                obra: nombre,
                funcion: formatPerformanceDate(o.performances?.starts_at ?? null),
                lugar: o.performances?.venue ?? prod?.venue ?? null,
                asiento: etiqueta(t),
                orden: o.order_code,
                comprador: o.buyer_nombre,
                qr: qrs.get(t.id) ?? null,
                usado: !!t.checked_in_at,
              }));
              const wa = o.status === "pendiente"
                ? whatsappPayUrl(env.whatsapp, {
                    prodName: nombre, orderCode: o.order_code, seats, total: Number(o.total),
                    buyerPhone: o.buyer_telefono, discountCode: o.discount_codigo, discountAmount: Number(o.discount_amount ?? 0),
                  })
                : "";
              return (
                <li key={o.id} className="flex flex-col overflow-hidden rounded-2xl bg-telon">
                  <div className="flex items-center gap-4 px-5 py-4" style={{ background: estilo.fondo, color: estilo.texto }}>
                    {estilo.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- logo de la obra
                      <img src={estilo.logo} alt="" className="h-14 w-24 shrink-0 object-contain" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold">{nombre}</p>
                      <p className="text-sm capitalize opacity-85">{formatPerformanceDate(o.performances?.starts_at ?? null)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${STATUS[o.status].cls}`}>{o.vencida_at ? "Vencida" : STATUS[o.status].label}</span>
                  </div>
                  <div className="flex flex-col gap-4 p-5">
                  <p className="text-sm text-texto-3">
                    Orden {o.order_code} · {seats.length} {seats.length === 1 ? "boleto" : "boletos"}{o.status === "pendiente" && seats.length ? ` (${seats.join(", ")})` : ""} · {formatMoney(Number(o.total))}{o.discount_codigo ? ` · código ${o.discount_codigo}` : ""}
                  </p>
                  {o.vencida_at && <p className="text-sm text-texto-3">No se confirmó el pago a tiempo y los asientos se liberaron. Puedes volver a comprar si sigue habiendo lugares.</p>}
                  {o.status === "pendiente" && o.expires_at && tiempoRestante(o.expires_at) && (
                    <p className="text-sm text-aviso">Paga antes de <b>{limiteTexto(o.expires_at)}</b> (te quedan {tiempoRestante(o.expires_at)}). Si no, los asientos se liberan solos.</p>
                  )}
                  {o.status === "pendiente" && (
                    wa ? (
                      <a href={wa} className="self-start rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-[#062b16]">Pagar por WhatsApp</a>
                    ) : (
                      <Link href="/contacto" className="self-start rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-[#062b16]">Escríbenos para pagar</Link>
                    )
                  )}
                  {o.status === "aprobado" && boletos.length > 0 && (
                    <OrderTickets
                      boletos={boletos}
                      estilo={estilo}
                      orden={o.order_code}
                      pdfServidor={funcionPasada(o.performances?.starts_at ?? null) ? null : `/cuenta/boletos/${encodeURIComponent(o.order_code)}/pdf`}
                    />
                  )}
                  </div>
                </li>
              );
  };

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title={`Hola, ${session.profile?.nombre || "fan DARF"}`} />
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        <section aria-labelledby="notificaciones" className="flex flex-col gap-3 rounded-2xl bg-telon p-5 lg:col-span-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="notificaciones" className="text-lg font-bold">
              Notificaciones{notisNuevas > 0 && <span className="ml-2 rounded-full bg-ciruela px-2 py-0.5 align-middle text-xs text-white">{notisNuevas} {notisNuevas === 1 ? "nueva" : "nuevas"}</span>}
            </h2>
            <span className="flex flex-wrap gap-4 text-sm font-bold">
              <Link href="/cuenta/notificaciones#telefono" className="text-violeta-claro">📱 Activar en mi teléfono</Link>
              {notis.length > 0 && <Link href="/cuenta/notificaciones" className="text-violeta-claro">Ver todas →</Link>}
            </span>
          </div>
          {notis.length === 0 ? <p className="text-sm text-texto-2">No tienes notificaciones. Aquí te avisamos cuando se aprueben tus boletos, antes de tu función y cuando respondan tus solicitudes.</p> : (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {notis.map((n) => (
                <li key={n.id}>
                  <Link href={n.href ?? "/cuenta/notificaciones"} className="flex items-start gap-3 py-2.5 hover:text-violeta-claro">
                    <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-[#a48bff]"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block wrap-anywhere ${n.read_at ? "text-texto-3" : "font-bold"}`}>{n.titulo}</span>
                      {n.detalle && <span className="block truncate text-texto-3">{n.detalle}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="boletos" className="flex flex-col gap-4 lg:col-span-8">
          <h2 id="boletos" className="titular text-2xl">Mis boletos</h2>
          {nueva && (
            <p role="status" className="rounded-xl border border-exito/40 bg-exito/10 px-4 py-3">
              Tu solicitud <b>{nueva}</b> quedó guardada y tus asientos están apartados. Cuando confirmemos tu
              pago, tus boletos con QR aparecerán aquí.
            </p>
          )}
          {recordatorios.map((o) => (
            <p key={o.id} role="status" className="rounded-xl border border-[#a48bff]/40 bg-[#a48bff]/10 px-4 py-3">
              <b>{recordatorio(o.performances?.starts_at ?? null)}:</b> {o.performances?.productions?.nombre} ·{" "}
              <span className="capitalize">{formatPerformanceDate(o.performances?.starts_at ?? null)}</span>. Toca «Ver boletos» para tener tus códigos QR a la mano.
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
          {gafete && <MiGafete g={gafete} />}
          {credencialFan && <MiCredencialFan c={credencialFan} />}
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
          <div className="grid grid-cols-2 gap-3">
            <a href="/cuenta/transacciones" className="flex flex-col gap-1 rounded-2xl bg-telon p-5 hover:bg-telon-2">
              <span className="font-bold">Transacciones →</span>
              <span className="text-xs text-texto-2">Todas tus órdenes y pagos.</span>
            </a>
            <a href="/cuenta/eventos" className="flex flex-col gap-1 rounded-2xl bg-telon p-5 hover:bg-telon-2">
              <span className="font-bold">Eventos asistidos →</span>
              <span className="text-xs text-texto-2">Las funciones a las que fuiste.</span>
            </a>
          </div>
          <a href="/cuenta/perfil-profesional" className="flex flex-col gap-1 rounded-2xl bg-telon p-6 hover:bg-telon-2">
            <span className="text-lg font-bold">Perfil profesional →</span>
            <span className="text-sm text-texto-2">Retrato, semblanza, trayectoria, habilidades y reel. Puedes hacerlo público.</span>
          </a>
          <details className="rounded-2xl bg-telon p-6">
            <summary className="cursor-pointer text-lg font-bold">Correo y contraseña</summary>
            <div className="mt-4 flex flex-col gap-6">
              <EmailForm email={session.email} />
              <PasswordForm />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-4">
            <form action={logout}>
              <button className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold">Cerrar sesión</button>
            </form>
            <a href="/cuenta/eliminar" className="text-sm font-semibold text-texto-3 underline hover:text-texto">Eliminar mi cuenta</a>
          </div>
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

        {equipos.length > 0 && (
          <section aria-labelledby="mi-equipo" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="mi-equipo" className="titular text-2xl">Mi equipo</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {equipos.map((e) => {
                const k = e.production_id ?? "general";
                const pe = pendEquipo.get(k);
                return (
                  <li key={k}>
                    <Link href={`/cuenta/equipo/${k}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
                      <p className="text-lg font-bold">{e.nombre}
                        {pe?.notas ? <span className="ml-2 rounded-full bg-[#be123c] px-2 py-0.5 text-xs text-white">{pe.notas} {pe.notas === 1 ? "nota" : "notas"}</span> : null}
                        {pe?.avisos ? <span className="ml-2 rounded-full bg-ciruela px-2 py-0.5 text-xs text-white">{pe.avisos} {pe.avisos === 1 ? "aviso" : "avisos"}</span> : null}
                      </p>
                      <p className="text-sm text-texto-2">{e.roles.join(" · ") || "Equipo DARF"}</p>
                      <span className="mt-2 inline-block text-sm font-bold text-violeta-claro">Notas, juntas, avisos y materiales →</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {ofertasPendientes.length > 0 && (
          <section aria-labelledby="ofertas" className="flex flex-col gap-3 lg:col-span-8">
            <h2 id="ofertas" className="titular text-2xl">Tienes {ofertasPendientes.length === 1 ? "una oferta" : `${ofertasPendientes.length} ofertas`} de papel</h2>
            <ul className="flex flex-col gap-3">
              {ofertasPendientes.map((o) => (
                <li key={o.id} className="flex flex-col gap-3 rounded-2xl border border-exito/40 bg-exito/10 p-5">
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
                <li key={i.audition_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#a48bff]/40 bg-telon p-5">
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
