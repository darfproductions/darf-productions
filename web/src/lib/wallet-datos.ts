import { funcionPasada } from "@/lib/account-rules";
import type { ImagenesApple, ServicioApple } from "@/lib/apple-wallet";
import { getSession } from "@/lib/auth";
import { getMiCredencial } from "@/lib/credencial";
import { paseCredencial, type CredencialMia } from "@/lib/credencial-rules";
import { origen } from "@/lib/gafete";
import { ligaGafete } from "@/lib/gafete-rules";
import { POSTER_COLUMNS } from "@/lib/poster";
import { assetUrl, getTheme, posterUrl, type Production } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { estiloDe } from "@/lib/ticket-design";
import { isLight } from "@/lib/themes";
import { origenPublico } from "@/lib/wallet-env";
import { conEstado, estadoBoleto, paseBoleto, paseCredencialWallet, type PaseWallet } from "@/lib/wallet-pases";

// Datos de los pases de Wallet. Con sesión (descarga desde Mi cuenta; pasa por RLS) o, para que el
// pase de Apple se actualice solo (0098), sin sesión con el serial y el token del pase.

type ProdWallet = Pick<Production, "id" | "nombre" | "venue" | "color_fondo" | "color_superficie" | "color_texto" | "color_acento" | "logo_path" | "ambiente_path" | "frase"> & { estado: string } & Record<string, unknown>;
/** Misma forma con sesión (consulta) y sin sesión (wallet_pase_datos). */
type FilaBoleto = {
  id: string; qr_token: string; is_active: boolean; cancelled_at: string | null; checked_in_at: string | null;
  seats: { seat_label: string } | null; price_categories: { nombre: string } | null;
  orders: { order_code: string; status: string; buyer_nombre: string; buyer_user_id: string;
    performances: { id: string; starts_at: string | null; venue: string | null; cancelada_at: string | null; productions: ProdWallet | null } | null } | null;
};

export type BoletoWallet = {
  pase: PaseWallet;
  obra: string; lugar: string | null; funcionId: string; asiento: string; comprador: string; orden: string;
  productionId: string | null; obraPublica: boolean;
  /** Imágenes locales o https para Apple: logo de DARF y la obra (ambiente + su logo). */
  logo: string; imagenObra: { ambiente: string | null; logo: string | null };
  apple: ImagenesApple;
};

export type Fallo = { error: string; status: number };

const asientoDe = (t: Pick<FilaBoleto, "seats" | "price_categories">) =>
  t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : "Admisión general");

/** Arma el boleto (con su estado: cancelado, función cancelada o ya ingresó). */
function armarBoleto(t: FilaBoleto): BoletoWallet | null {
  const o = t.orders;
  const f = o?.performances;
  if (!o || !f) return null;
  const prod = f.productions;
  const tema = prod ? getTheme(prod as unknown as Production) : null;
  const poster = posterUrl(prod as unknown as Production, "boleto")?.url ?? null;
  const obra = prod?.nombre ?? "DARF Productions";
  const lugar = f.venue ?? prod?.venue ?? null;
  const asiento = asientoDe(t);
  const estado = estadoBoleto({
    status: o.status, activo: t.is_active, cancelado: !!t.cancelled_at, funcionCancelada: !!f.cancelada_at, ingreso: !!t.checked_in_at,
  });
  const pase = conEstado(paseBoleto({
    ticketId: t.id, qrToken: t.qr_token, obra, startsAt: f.starts_at, lugar, asiento,
    orden: o.order_code, comprador: o.buyer_nombre, estilo: estiloDe(tema, poster),
  }), estado);
  const logo = isLight(pase.colores.fondo) ? "/marca/darf-horizontal.svg" : "/marca/darf-horizontal-blanco.svg";
  const imagenObra = { ambiente: prod?.ambiente_path ? assetUrl(prod.ambiente_path) : poster, logo: tema?.logo ?? null };
  return {
    pase, obra, lugar, funcionId: f.id, asiento, comprador: o.buyer_nombre, orden: o.order_code,
    productionId: prod?.id ?? null, obraPublica: !!prod && ["publicada", "archivada"].includes(prod.estado),
    logo, imagenObra, apple: { logo, obra: imagenObra },
  };
}

/** Un boleto propio, aprobado, activo y de una función que no ha pasado. */
export async function boletoWallet(ticketId: string): Promise<BoletoWallet | Fallo> {
  if (!/^[0-9a-f-]{36}$/.test(ticketId)) return { error: "Boleto no encontrado.", status: 404 };
  const session = await getSession();
  if (!session) return { error: "Inicia sesión.", status: 401 };
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select(`id, qr_token, is_active, cancelled_at, checked_in_at, seats(seat_label), price_categories(nombre), orders!inner(order_code, status, buyer_nombre, buyer_user_id, performances(id, starts_at, venue, cancelada_at, productions(id, nombre, venue, estado, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase, ${POSTER_COLUMNS})))`)
    .eq("id", ticketId)
    .eq("orders.buyer_user_id", session.userId)
    .maybeSingle();
  const t = data as unknown as FilaBoleto | null;
  const o = t?.orders;
  const f = o?.performances;
  if (!t || !o || !f || o.buyer_user_id !== session.userId) return { error: "Boleto no encontrado.", status: 404 };
  if (o.status !== "aprobado" || !t.is_active) return { error: "Este boleto no está activo.", status: 409 };
  if (f.cancelada_at) return { error: "Esta función se canceló.", status: 409 };
  if (funcionPasada(f.starts_at)) return { error: "Esta función ya pasó.", status: 410 };
  return armarBoleto(t) ?? { error: "Boleto no encontrado.", status: 404 };
}

export type CredencialWallet = { pase: PaseWallet; fan: boolean; logo: string; logoTexto?: string; foto: string | null; banda: string; apple: ImagenesApple };

function armarCredencial(userId: string, c: CredencialMia, nombre: string, fotoUrl: string | null, liga: string): CredencialWallet {
  const vista = paseCredencial({ ...c, nombre, fotoUrl });
  const pase = paseCredencialWallet({ userId, liga, codigo: c.codigo, pase: vista });
  const fan = vista.tema === "fan";
  const banda = c.nivel === "equipo" ? c.franja ?? "crew" : c.nivel === "club" && c.socio ? "fan" : "cuenta";
  // El logo de Fan Zone es muy ancho para Wallet: monograma dorado + texto.
  const logo = fan ? "/marca/darf-monograma-oro.svg" : "/marca/darf-horizontal-blanco.svg";
  const logoTexto = fan ? "DARF Fan Zone" : undefined;
  // Equipo que también es socio del Club Fan: el sello del club (Apple junto al logo, Google en la banda).
  const sello = !fan && !!vista.sello;
  return {
    pase, fan, logo, logoTexto, foto: fotoUrl, banda: sello ? `${banda}-socio` : banda,
    apple: { logo, logoTexto, foto: fotoUrl, banda: fan ? "fan" : null, sello },
  };
}

/** La credencial única de la persona con sesión (0083). */
export async function credencialWallet(): Promise<CredencialWallet | Fallo> {
  const session = await getSession();
  if (!session) return { error: "Inicia sesión.", status: 401 };
  const c = await getMiCredencial();
  if (!c) return { error: "No encontramos tu credencial.", status: 404 };
  return armarCredencial(session.userId, c, c.nombre, c.fotoUrl, c.liga);
}

/** Alta del pase para que se actualice solo (0098). Sin la 0098 o si falla, el pase sale sin servicio. */
export async function servicioApple(serial: string, ticketId: string | null): Promise<ServicioApple | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("wallet_pase_alta", ticketId ? { p_ticket: ticketId } : {});
    const r = data as { serial?: string; token?: string } | null;
    if (error || !r?.token || r.serial !== serial) return null;
    return { url: `${origenPublico()}/wallet/apple`, token: r.token };
  } catch {
    return null;
  }
}

export type PaseActualizado = { pase: PaseWallet; apple: ImagenesApple; cambiado: Date };

/** El pase al día, pedido por el iPhone (sin sesión). null = token inválido o el pase ya no existe. */
export async function paseActualizado(serial: string, token: string): Promise<PaseActualizado | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("wallet_pase_datos", { p_serial: serial, p_token: token });
  if (error || !data) return null;
  const d = data as {
    tipo: "boleto" | "credencial"; user_id: string; cambiado_at: string;
    boleto?: FilaBoleto | null; credencial?: CredencialMia | null; nombre?: string | null; retrato_path?: string | null;
  };
  const cambiado = new Date(d.cambiado_at);
  if (d.tipo === "boleto") {
    const b = d.boleto ? armarBoleto(d.boleto) : null;
    return b && b.pase.serial === serial ? { pase: b.pase, apple: b.apple, cambiado } : null;
  }
  if (!d.credencial) return null;
  // Sin sesión no se puede leer la foto privada: retrato público del perfil profesional (si hay).
  const foto = d.retrato_path ? supabase.storage.from("perfiles").getPublicUrl(d.retrato_path).data.publicUrl : null;
  const cr = armarCredencial(d.user_id, d.credencial, d.nombre ?? "", foto, ligaGafete(await origen(), d.credencial.token));
  return cr.pase.serial === serial ? { pase: cr.pase, apple: cr.apple, cambiado } : null;
}

export const esFallo = (x: unknown): x is Fallo => typeof x === "object" && x !== null && "error" in x && "status" in x;
