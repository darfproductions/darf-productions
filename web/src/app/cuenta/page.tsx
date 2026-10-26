import { lineasDesdeBoletos, textosBoleto, type BeneficioBoleto } from "@/lib/beneficios-rules";
import { textoAvance, type ComisionRow } from "@/lib/comision-rules";
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
import { assetUrl, formatPerformanceDate, getTheme, posterUrl } from "@/lib/productions";
import { origenSitio } from "@/lib/site-origin";
import { POSTER_COLUMNS, type PosterColumns } from "@/lib/poster";
import type { KitColumns } from "@/lib/themes";
import { estiloDe, type BoletoVista } from "@/lib/ticket-design";
import { OrderTickets } from "@/components/tickets/OrderTickets";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, whatsappPayUrl } from "@/lib/tickets";
import { logout } from "../entrar/actions";
import { cancelMyOrder } from "./actions";
import Link from "next/link";
import { listNotifications, unreadCount } from "@/lib/notifications";
import { AvatarUpload } from "./AvatarUpload";
import { MiCredencial } from "@/components/credencial/MiCredencial";
import { BarraLealtad } from "@/components/credencial/BarraLealtad";
import { ActionForm } from "@/components/panel/ActionForm";
import { getMiCredencial } from "@/lib/credencial";
import { paseCredencial } from "@/lib/credencial-rules";
import { avatarUrl } from "@/lib/avatar";
import { GuardarSinConexion } from "@/components/pwa/SinConexion";
import { GOOGLE_WALLET_PUBLICO, walletAppleActivo, walletGoogleActivo } from "@/lib/wallet-env";
import { SalirClub } from "@/components/fanzone/SalirClub";
import { numeroSocio } from "@/lib/fanzone-rules";
import { EmailForm, PasswordForm, ProfileForm } from "./ProfileForm";
import { funcionPasada } from "@/lib/account-rules";
import { limiteTexto, recordatorio, tiempoRestante } from "@/lib/expiry-rules";
import { estadoOrden } from "@/lib/ventas-rules";
import { AgregarCalendario } from "@/components/AgregarCalendario";
import { VoyAIr } from "@/components/tickets/VoyAIr";
import { isoMx } from "@/lib/dates";
import { Icono } from "@/components/Icono";
import { MisEnsayosEquipo, type MiEnsayoEquipo } from "@/components/ensayos/MisEnsayosEquipo";
import { getLogistica } from "@/lib/logistica";
import { hora, horario, ligaMaps, textoPuertas } from "@/lib/logistica-rules";

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
  motivo: string | null;
  cancelada_por_comprador_at: string | null;
  buyer_nombre: string;
  performances: { starts_at: string | null; venue: string | null; production_id: string; puertas_at?: string | null; termina_at?: string | null; cancelada_at?: string | null; cancelada_motivo?: string | null; productions: (KitColumns & PosterColumns & { nombre: string; venue: string | null; estado?: string }) | null } | null;
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
  // Google Wallet: publicado (2026-10-15) para todos; con GOOGLE_WALLET_PUBLICO en false solo lo vería el equipo.
  const equipo = session.profile?.rol === "admin" || session.profile?.rol === "staff";
  const wallet = { apple: walletAppleActivo(), google: walletGoogleActivo() && (GOOGLE_WALLET_PUBLICO || equipo) };
  const sp = await searchParams;
  const nueva = typeof sp.orden === "string" ? sp.orden : null;

  const supabase = await createClient();
  const sitio = await origenSitio();
  // Lo que no depende de las órdenes se pide desde ya, junto con ellas (la página tarda lo de la consulta más lenta).
  const resto = Promise.all([
    listMyApplications(session.userId), listMyInvites(), listMyOffers(), supabase.rpc("my_productions"), supabase.rpc("my_unread_announcements"),
    supabase.rpc("my_seller"), supabase.rpc("my_team_productions"), supabase.rpc("my_team_unread"),
    listNotifications({ limit: 3 }), unreadCount(), getMiCredencial(), supabase.rpc("mis_ensayos_equipo"),
    supabase.rpc("mi_comision"),
  ]);
  const { data, error } = await supabase
    .from("orders")
    .select(`id, order_code, status, total, discount_amount, discount_codigo, buyer_telefono, buyer_nombre, created_at, expires_at, vencida_at, motivo, cancelada_por_comprador_at, performances(starts_at, venue, production_id, puertas_at, termina_at, cancelada_at, cancelada_motivo, productions(nombre, venue, estado, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase, ${POSTER_COLUMNS})), tickets(id, is_active, qr_token, checked_in_at, seats(seat_label), price_categories(nombre))`)
    .eq("buyer_user_id", session.userId)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as unknown as OrderRow[];
  // 0127: logística de las obras con funciones por venir (puertas, fin y dirección).
  const obrasProximas = [...new Set(orders.filter((o) => !funcionPasada(o.performances?.starts_at ?? null)).map((o) => o.performances?.production_id).filter((x): x is string => !!x))];
  const logisticas = new Map(await Promise.all(obrasProximas.map(async (pid) => [pid, await getLogistica(pid)] as const)));
  const horarioDe = (o: OrderRow) => {
    const f = o.performances;
    const l = f ? logisticas.get(f.production_id) ?? null : null;
    return f?.starts_at && (l || f.puertas_at || f.termina_at) ? { h: horario({ ...f, starts_at: f.starts_at }, l), l } : null;
  };
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

  // 0122: lo que incluye la zona de cada boleto (órdenes que siguen vigentes). 0125: también las pagadas de funciones
  // que ya pasaron, porque hay beneficios que se entregan después (y se ve "Entregado el …").
  const vigentes = orders.filter((o) => o.status !== "rechazado" && (o.status === "aprobado" || !funcionPasada(o.performances?.starts_at ?? null))).flatMap((o) => o.tickets.filter((t) => t.is_active).map((t) => t.id));
  const { data: benefRows } = vigentes.length ? await supabase.rpc("beneficios_boletos", { p_tickets: vigentes }) : { data: [] };
  const benef = new Map(((benefRows ?? []) as { ticket_id: string; beneficios: BeneficioBoleto[] }[]).map((r) => [r.ticket_id, r.beneficios]));

  // Mis audiciones (0036): solo las propias; QR mientras no haya llegado.
  const [audiciones, invitaciones, ofertas, misObras, sinLeer, misVentas, miEquipo, equipoPend, notis, notisNuevas, credencial, ensayosEq, miComision] = await resto;
  const misEnsayosEquipo = (ensayosEq.data ?? []) as MiEnsayoEquipo[];
  // 0114: regalo de cumpleaños del Club Fan (solo el del mes en curso y si aún no se usó).
  const mesMx = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const anioMx = Number(mesMx.find((x) => x.type === "year")?.value);
  const numMesMx = Number(mesMx.find((x) => x.type === "month")?.value);
  const regaloRow = credencial?.socio
    ? (await supabase.from("regalos_cumple").select("codigo").eq("user_id", session.userId).eq("anio", anioMx).eq("mes", numMesMx).maybeSingle()).data
    : null;
  const regalo = regaloRow && !orders.some((o) => o.discount_codigo === regaloRow.codigo && o.status !== "rechazado") ? (regaloRow.codigo as string) : null;
  const nombreMes = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", month: "long" }).format(new Date());
  const equipos = (miEquipo.data ?? []) as { production_id: string | null; nombre: string; roles: string[] }[];
  const pendEquipo = new Map(((equipoPend.data ?? []) as { production_id: string | null; avisos: number; notas: number }[]).map((x) => [x.production_id ?? "general", x]));
  const ventas = (misVentas.data ?? []) as MySale[];
  const miCodigo = ventas[0]?.codigo ?? null;
  const obrasVenta = ventas.filter((v) => v.production_id);
  // 0129: mi comisión por obra (solo obras con tabla de comisiones).
  const comisionObra = new Map(((miComision.data ?? []) as (ComisionRow & { production_id: string })[]).map((c) => [c.production_id, c]));
  const avisosDe = (pid: string) => ((sinLeer.data ?? []) as { production_id: string; sin_leer: number }[]).find((x) => x.production_id === pid)?.sin_leer ?? 0;
  const producciones = (misObras.data ?? []) as { production_id: string; nombre: string; papeles: string[] }[];
  const ofertasPendientes = ofertas.filter((o) => o.estado === "enviada");
  const pendientes = invitaciones.filter((i) => !i.inscrito);
  const audQr = new Map<string, string>();
  for (const a of audiciones) {
    if (!a.checked_in_at && a.auditions?.estado !== "cancelada" && !["cancelado", "no_cumple"].includes(a.estado)) audQr.set(a.id, await QRCode.toDataURL(a.qr_token, { margin: 1, width: 200 }));
  }

  const fotoUrl = await avatarUrl(session.profile?.foto_path);
  const ahora = new Date();
  const recordatorios = orders.filter((o) => o.status === "aprobado" && o.tickets.some((t) => t.is_active) && recordatorio(o.performances?.starts_at ?? null));
  const proximas = orders.filter((o) => !funcionPasada(o.performances?.starts_at ?? null, ahora));
  // "Hoy es la función" (Bloque 4B): el día de la función, el boleto arriba de todo.
  const hoyMx = isoMx(ahora);
  const deHoy = orders.filter((o) => o.status === "aprobado" && o.tickets.some((t) => t.is_active) && o.performances?.starts_at && !o.performances.cancelada_at
    && isoMx(new Date(o.performances.starts_at)) === hoyMx && !funcionPasada(o.performances.starts_at, ahora));
  const pasadas = orders.filter((o) => funcionPasada(o.performances?.starts_at ?? null, ahora));
  const renderOrder = (o: OrderRow) => {
              const nombre = o.performances?.productions?.nombre ?? "Producción";
              const activos = o.tickets.filter((t) => t.is_active);
              const seats = o.status === "pendiente" ? (asientosPendientes.get(o.id) ?? []) : activos.map((t) => etiqueta(t));
              const prod = o.performances?.productions ?? null;
              const tema = prod ? getTheme(prod) : null;
              const estilo = estiloDe(tema, posterUrl(prod, "boleto")?.url ?? null);
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
                ...textosBoleto(benef.get(t.id) ?? [], o.performances?.starts_at),
              }));
              const wa = o.status === "pendiente"
                ? whatsappPayUrl(env.whatsapp, {
                    prodName: nombre, orderCode: o.order_code, seats, total: Number(o.total),
                    buyerPhone: o.buyer_telefono, discountCode: o.discount_codigo, discountAmount: Number(o.discount_amount ?? 0),
                    incluye: lineasDesdeBoletos(activos.flatMap((t) => benef.get(t.id) ?? [])),
                  })
                : "";
              return (
                <li key={o.id} id={`o-${o.order_code}`} className="flex scroll-mt-24 flex-col overflow-hidden rounded-2xl bg-telon">
                  <div className="flex items-center gap-4 px-5 py-4" style={{ background: estilo.fondo, color: estilo.texto }}>
                    {estilo.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- logo de la obra
                      <img src={estilo.logo} alt="" className="h-14 w-24 shrink-0 object-contain" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold">{nombre}</p>
                      <p className="text-sm opacity-85">{formatPerformanceDate(o.performances?.starts_at ?? null)}{(() => { const x = !funcionPasada(o.performances?.starts_at ?? null) && horarioDe(o); return x ? ` · Puertas ${hora(x.h.puertas)}` : ""; })()}</p>
                      {o.performances?.cancelada_at && <p className="text-sm font-bold">Función cancelada{o.performances.cancelada_motivo ? `: ${o.performances.cancelada_motivo}` : ""}{o.status === "aprobado" ? " · te contactamos para tu reembolso" : ""}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${STATUS[o.status].cls}`}>{estadoOrden(o, "comprador")}</span>
                  </div>
                  <div className="flex flex-col gap-4 p-5">
                  <p className="text-sm text-texto-3">
                    Orden {o.order_code} · {seats.length} {seats.length === 1 ? "boleto" : "boletos"}{o.status === "pendiente" && seats.length ? ` (${seats.join(", ")})` : ""} · {formatMoney(Number(o.total))}{o.discount_codigo ? ` · código ${o.discount_codigo}` : ""}
                  </p>
                  {o.vencida_at && <p className="text-sm text-texto-3">No se confirmó el pago a tiempo y los asientos se liberaron. Puedes volver a comprar si sigue habiendo lugares.</p>}
                  {o.status === "rechazado" && !o.vencida_at && !o.cancelada_por_comprador_at && (
                    <p className="text-sm text-texto-2">{o.motivo ? <>Motivo: {o.motivo}. </> : null}Si tienes dudas, <Link href="/contacto" className="font-bold text-lila">escríbenos</Link>.</p>
                  )}
                  {o.status === "pendiente" && !o.expires_at && (
                    <p className="text-sm text-texto-2">Tus lugares siguen apartados a tu nombre hasta que se confirme tu pago.</p>
                  )}
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
                  {o.status === "pendiente" && (
                    <ActionForm inline action={cancelMyOrder} hidden={{ order: o.id }} confirm={`¿Cancelar tu apartado ${o.order_code}? Los lugares quedan libres para alguien más.`} submit="Cancelar mi apartado" submitClass="text-sm font-bold text-texto-3 underline underline-offset-4 hover:text-texto disabled:opacity-60" />
                  )}
                  {o.status === "aprobado" && boletos.length > 0 && (
                    <OrderTickets
                      boletos={boletos}
                      estilo={estilo}
                      orden={o.order_code}
                      pdfServidor={funcionPasada(o.performances?.starts_at ?? null) ? null : `/cuenta/boletos/${encodeURIComponent(o.order_code)}/pdf`}
                      wallet={wallet}
                    />
                  )}
                  {o.status === "aprobado" && boletos.length > 0 && o.performances?.starts_at && !o.performances.cancelada_at && !funcionPasada(o.performances.starts_at) && (
                    <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                      <AgregarCalendario ics={`/calendario/boleto/${encodeURIComponent(o.order_code)}`}
                        evento={{ uid: `orden-${o.order_code}`, titulo: `${nombre} · DARF Productions`, inicia: o.performances.starts_at, termina: horarioDe(o)?.h.termina ?? null, lugar: o.performances.venue ?? prod?.venue ?? null, detalle: `${(() => { const x = horarioDe(o); return x ? `${textoPuertas(x.h)} ` : ""; })()}Orden ${o.order_code}` }} />
                      <VoyAIr obra={nombre} funcion={formatPerformanceDate(o.performances.starts_at)} lugar={o.performances.venue ?? prod?.venue ?? null}
                        ambiente={tema?.ambiente ?? (prod?.ambiente_path ? assetUrl(prod.ambiente_path) : null)} poster={posterUrl(prod, "voy")?.url ?? null}
                        logo={tema?.logo ?? (prod?.logo_path ? assetUrl(prod.logo_path) : null)}
                        fondo={prod?.color_fondo ?? estilo.fondo} superficie={prod?.color_superficie ?? estilo.superficie}
                        texto={prod?.color_texto ?? estilo.texto} acento={prod?.color_acento ?? estilo.acento}
                        liga={prod && ["publicada", "archivada"].includes(prod.estado ?? "") ? `${sitio}/producciones/${o.performances.production_id}` : sitio} />
                    </div>
                  )}
                  </div>
                </li>
              );
  };

  // Sin internet en la fila del teatro: la credencial y los boletos que vienen quedan guardados en este teléfono.
  const sinConexion = {
    nombre: session.profile?.nombre ?? "",
    credencial: credencial ? { titulo: paseCredencial(credencial).titulo, codigo: credencial.codigo, qr: credencial.qr } : null,
    boletos: proximas.filter((o) => o.status === "aprobado").flatMap((o) => o.tickets.filter((t) => qrs.has(t.id) && !t.checked_in_at).map((t) => ({
      obra: o.performances?.productions?.nombre ?? "Producción", funcion: formatPerformanceDate(o.performances?.starts_at ?? null),
      lugar: o.performances?.venue ?? o.performances?.productions?.venue ?? null, asiento: etiqueta(t), qr: qrs.get(t.id)!,
    }))).slice(0, 20),
  };

  return (
    <main className="pb-10">
      <GuardarSinConexion datos={sinConexion} />
      <PageHeading eyebrow="Mi cuenta" title={`Hola, ${session.profile?.nombre || "fan DARF"}`} />
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        {deHoy.map((o) => {
          const lugar = o.performances?.venue ?? o.performances?.productions?.venue ?? null;
          const hora = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(o.performances!.starts_at!));
          const x = horarioDe(o);
          const maps = ligaMaps(x?.l, lugar);
          return (
            <section key={o.id} aria-label="Hoy es tu función" className="boton-compra flex flex-col gap-3 rounded-2xl p-6 lg:col-span-12">
              <p className="text-xs font-black uppercase tracking-[0.16em]">Hoy es tu función</p>
              <p className="titular text-3xl">{o.performances?.productions?.nombre ?? "DARF"} · {hora}</p>
              {lugar && <p className="text-sm">{lugar}{x?.l?.direccion ? `, ${x.l.direccion}` : ""}{maps && <> · <a href={maps} target="_blank" rel="noreferrer" className="font-bold underline">Cómo llegar</a></>}</p>}
              <p className="text-sm">{x ? textoPuertas(x.h) : "Llega 30 minutos antes."} Dentro de la sala a veces no hay señal: <b>descarga tu PDF</b> o deja abierto tu boleto.</p>
              <a href={`#o-${o.order_code}`} className="self-start rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0b0910]">Ver mis boletos</a>
            </section>
          );
        })}
        <section aria-labelledby="notificaciones" className="flex flex-col gap-3 rounded-2xl bg-telon p-5 lg:col-span-12">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="notificaciones" className="text-lg font-bold">
              Notificaciones{notisNuevas > 0 && <span className="ml-2 rounded-full bg-ciruela px-2 py-0.5 align-middle text-xs text-white">{notisNuevas} {notisNuevas === 1 ? "nueva" : "nuevas"}</span>}
            </h2>
            <span className="flex flex-wrap gap-4 text-sm font-bold">
              <Link href="/cuenta/notificaciones#telefono" className="text-violeta-claro"><Icono nombre="celular" /> Activar en mi teléfono</Link>
              {notis.length > 0 && <Link href="/cuenta/notificaciones" className="text-violeta-claro">Ver todas <Icono nombre="flecha-der" /></Link>}
            </span>
          </div>
          {notis.length === 0 ? <p className="text-sm text-texto-2">No tienes notificaciones. Aquí te avisamos cuando se aprueben tus boletos, antes de tu función y cuando respondan tus solicitudes.</p> : (
            <ul className="flex flex-col divide-y divide-white/10 text-sm">
              {notis.map((n) => (
                <li key={n.id}>
                  <Link href={`/notificacion/${n.id}`} prefetch={false} className="flex items-start gap-3 py-2.5 hover:text-violeta-claro">
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

        {/* Columna izquierda continua (boletos, ventas, equipo…) para que no quede un hueco bajo
            "Mis boletos" cuando la columna derecha es larga. En celular: boletos, perfil y luego lo demás. */}
        <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-10">
        <section aria-labelledby="boletos" className="order-1 flex flex-col gap-4 lg:order-none">
          <h2 id="boletos" className="titular text-2xl">Mis boletos</h2>
          {nueva && (() => {
            // 0088: el aviso dice el estado real de esa orden (puede venir de "Ver boletos" de una ya pagada).
            const o = orders.find((x) => x.order_code === nueva);
            if (!o) return null;
            const texto = o.status === "pendiente"
              ? <>Tu solicitud <b>{nueva}</b> quedó guardada y tus lugares están apartados. Cuando confirmemos tu pago, tus boletos con QR aparecerán aquí.</>
              : o.status === "aprobado"
                ? <>Tu orden <b>{nueva}</b> ya está pagada. Toca «Ver boletos» para tener tus códigos QR.</>
                : <>Tu orden <b>{nueva}</b> ya no está activa ({estadoOrden(o, "comprador").toLowerCase()}).</>;
            return (
              <p role="status" className={`rounded-xl border px-4 py-3 ${o.status === "rechazado" ? "border-white/15 bg-white/5" : "border-exito/40 bg-exito/10"}`}>
                {texto} <a href={`#o-${nueva}`} className="font-bold text-lila">Ir a la orden <Icono nombre="flecha-abajo" /></a>
              </p>
            );
          })()}
          {recordatorios.map((o) => (
            <p key={o.id} role="status" className="rounded-xl border border-[#a48bff]/40 bg-[#a48bff]/10 px-4 py-3">
              <b>{recordatorio(o.performances?.starts_at ?? null)}:</b> {o.performances?.productions?.nombre} ·{""}
              <span>{formatPerformanceDate(o.performances?.starts_at ?? null)}</span>. Toca «Ver boletos» para tener tus códigos QR a la mano.
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

        {miCodigo && (
          <section aria-labelledby="mis-ventas" className="flex flex-col gap-3 order-3 lg:order-none">
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
                        {(() => {
                          const c = comisionObra.get(v.production_id!);
                          return c && (
                            <span className="block text-xs">
                              <b className="text-oro">Tu comisión: {formatMoney(Number(c.comision))}</b>
                              {Number(c.pagado) > 0 && ` · ya te pagaron ${formatMoney(Number(c.pagado))}`}
                              {Number(c.por_pagar) > 0 && ` · por recibir ${formatMoney(Number(c.por_pagar))}`}
                              {v.en_venta && <span className="text-texto-3"> · {textoAvance(c)}</span>}
                            </span>
                          );
                        })()}
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
          <section aria-labelledby="mis-producciones" className="flex flex-col gap-3 order-3 lg:order-none">
            <h2 id="mis-producciones" className="titular text-2xl">Mis producciones</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {producciones.map((p) => (
                <li key={p.production_id}>
                  <Link href={`/cuenta/produccion/${p.production_id}`} className="block rounded-2xl bg-telon p-5 hover:bg-telon-2">
                    <p className="text-lg font-bold">{p.nombre}{avisosDe(p.production_id) > 0 && <span className="ml-2 rounded-full bg-[#be123c] px-2 py-0.5 text-xs text-white">{avisosDe(p.production_id)} {avisosDe(p.production_id) === 1 ? "aviso" : "avisos"}</span>}</p>
                    <p className="text-sm text-texto-2">{p.papeles.join(" · ") || "Integrante"}</p>
                    <span className="mt-2 inline-block text-sm font-bold text-violeta-claro">Avisos, ensayos, materiales y mi expediente <Icono nombre="flecha-der" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {equipos.length > 0 && (
          <section aria-labelledby="mi-equipo" className="flex flex-col gap-3 order-3 lg:order-none">
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
                      <span className="mt-2 inline-block text-sm font-bold text-violeta-claro">Notas, juntas, avisos y materiales <Icono nombre="flecha-der" /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <MisEnsayosEquipo ensayos={misEnsayosEquipo} />

        {ofertasPendientes.length > 0 && (
          <section aria-labelledby="ofertas" className="flex flex-col gap-3 order-3 lg:order-none">
            <h2 id="ofertas" className="titular text-2xl">Tienes {ofertasPendientes.length === 1 ? "una oferta" : `${ofertasPendientes.length} ofertas`} de papel</h2>
            <ul className="flex flex-col gap-3">
              {ofertasPendientes.map((o) => (
                <li key={o.id} className="flex flex-col gap-3 rounded-2xl border border-exito/40 bg-exito/10 p-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{o.obra}</p>
                    <p className="text-xl font-bold">{offerLabel(o)}</p>
                    {o.mensaje && <p className="mt-1 whitespace-pre-line text-texto-2">{o.mensaje}</p>}
                    {o.responder_antes && <p className="mt-1 text-sm text-texto-2">Responde antes del {formatSlot(o.responder_antes).toLowerCase()}</p>}
                  </div>
                  <OfferReplyForm id={o.id} label={`${offerLabel(o)} en ${o.obra}`} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendientes.length > 0 && (
          <section aria-labelledby="invitaciones" className="flex flex-col gap-3 order-3 lg:order-none">
            <h2 id="invitaciones" className="titular text-2xl">Te invitaron a audicionar</h2>
            <ul className="flex flex-col gap-3">
              {pendientes.map((i) => (
                <li key={i.audition_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#a48bff]/40 bg-telon p-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{i.obra ?? "Convocatoria DARF"}</p>
                    <p className="text-lg font-bold">{i.titulo}</p>
                    {i.inscripcion_cierra && <p className="text-sm text-texto-2">Inscripción hasta el {formatSlot(i.inscripcion_cierra).toLowerCase()}</p>}
                  </div>
                  <Link href={`/audiciones/${i.audition_id}`} className="boton-compra rounded-full px-5 py-2.5 text-sm font-bold">Inscribirme</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {audiciones.length > 0 && (
          <section aria-labelledby="mis-audiciones" className="flex flex-col gap-4 order-3 lg:order-none">
            <h2 id="mis-audiciones" className="titular text-2xl">Mis audiciones</h2>
            <ul className="flex flex-col gap-4">
              {audiciones.map((a) => (
                <li key={a.id} className="flex flex-col gap-4 rounded-2xl bg-telon p-5 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR generado (data URL) */}
                  {audQr.get(a.id) && <img src={audQr.get(a.id)} alt="QR de la audición" width={120} height={120} className="rounded-lg bg-white p-1.5" />}
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-lg font-bold">{a.auditions?.titulo ?? "Audición"}</p>
                    {a.audition_slots && <p className="text-sm text-texto-2">{formatSlot(a.audition_slots.inicia)}{a.audition_slots.sala ? ` · ${a.audition_slots.sala}` : ""}</p>}
                    <p className="text-sm">
                      {a.auditions?.estado === "cancelada"
                        ? <span className="rounded-full bg-[#5a1a22] px-2.5 py-1 text-xs font-bold text-[#fecdd3]">Convocatoria cancelada</span>
                        : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO_SOLICITUD[a.estado]?.cls ?? ""}`}>{ESTADO_SOLICITUD[a.estado]?.label ?? a.estado}</span>}
                      {a.numero && <span className="ml-2">Número {a.numero}</span>}
                    </p>
                    <Link href={`/audiciones/${a.audition_id}`} className="mt-1 text-sm font-bold text-violeta-claro">Ver convocatoria <Icono nombre="flecha-der" /></Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        <aside className="order-2 flex flex-col gap-6 lg:order-none lg:col-span-4 lg:self-start">
          {credencial && <div id="credencial" className="scroll-mt-24"><MiCredencial c={credencial} wallet={wallet} /></div>}
          {credencial?.lealtad ? <BarraLealtad n={credencial.lealtad} /> : null}
          {credencial?.socio && (
            <section aria-labelledby="club" className="flex flex-col gap-2 rounded-2xl bg-telon p-6">
              <h2 id="club" className="text-lg font-bold">Club Fan</h2>
              <p className="text-sm text-texto-2">Eres socio {numeroSocio(credencial.socio.numero)}{credencial.socio.fundador ? " · Fan fundador" : ""}. <Link href="/club-fan" className="font-bold text-lila">Tus beneficios</Link></p>
              {regalo && (
                <div className="rounded-xl border border-oro/40 bg-oro/10 p-3 text-sm">
                  <p className="font-bold text-oro-claro">¡Feliz cumpleaños! Tu regalo</p>
                  <p className="mt-1 text-texto-2">10 % en hasta 2 boletos de cualquier obra, en una compra, hasta el fin de {nombreMes}. Escribe este código en &ldquo;Código de descuento&rdquo; al comprar:</p>
                  <p className="num mt-2 select-all text-lg font-black tracking-widest">{regalo}</p>
                </div>
              )}
              <SalirClub numero={numeroSocio(credencial.socio.numero)} />
            </section>
          )}
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
              <span className="font-bold">Transacciones <Icono nombre="flecha-der" /></span>
              <span className="text-xs text-texto-2">Todas tus órdenes y pagos.</span>
            </a>
            <a href="/cuenta/eventos" className="flex flex-col gap-1 rounded-2xl bg-telon p-5 hover:bg-telon-2">
              <span className="font-bold">Mis eventos <Icono nombre="flecha-der" /></span>
              <span className="text-xs text-texto-2">Lo que apartaste, tus pagos y las funciones a las que fuiste.</span>
            </a>
          </div>
          <a href="/cuenta/perfil-profesional" className="flex flex-col gap-1 rounded-2xl bg-telon p-6 hover:bg-telon-2">
            <span className="text-lg font-bold">Perfil profesional <Icono nombre="flecha-der" /></span>
            <span className="text-sm text-texto-2">Retrato, semblanza, trayectoria, habilidades y reel. Puedes hacerlo público.</span>
          </a>
          <details className="rounded-2xl bg-telon p-6">
            <summary className="cursor-pointer text-lg font-bold">Correo y contraseña</summary>
            <div className="mt-4 flex flex-col gap-6">
              <EmailForm email={session.email} />
              <PasswordForm captcha={env.turnstileSiteKey} />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-4">
            <form action={logout}>
              <button className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold">Cerrar sesión</button>
            </form>
            <a href="/cuenta/eliminar" className="text-sm font-semibold text-texto-3 underline hover:text-texto">Eliminar mi cuenta</a>
          </div>
        </aside>
      </div>
    </main>
  );
}
