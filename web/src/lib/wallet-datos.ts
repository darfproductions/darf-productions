import { funcionPasada } from "@/lib/account-rules";
import { getSession } from "@/lib/auth";
import { getMiCredencial } from "@/lib/credencial";
import { paseCredencial } from "@/lib/credencial-rules";
import { POSTER_COLUMNS } from "@/lib/poster";
import { assetUrl, getTheme, posterUrl, type Production } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { estiloDe } from "@/lib/ticket-design";
import { isLight } from "@/lib/themes";
import { paseBoleto, paseCredencialWallet, type PaseWallet } from "@/lib/wallet-pases";

// Datos de los pases de Wallet para la persona con sesión (solo servidor; pasa por RLS).

type ProdWallet = Pick<Production, "id" | "nombre" | "venue" | "color_fondo" | "color_superficie" | "color_texto" | "color_acento" | "logo_path" | "ambiente_path" | "frase"> & { estado: string } & Record<string, unknown>;
type FilaBoleto = {
  id: string; qr_token: string; is_active: boolean;
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
};

export type Fallo = { error: string; status: number };

const asientoDe = (t: Pick<FilaBoleto, "seats" | "price_categories">) =>
  t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : "Admisión general");

/** Un boleto propio, aprobado, activo y de una función que no ha pasado. */
export async function boletoWallet(ticketId: string): Promise<BoletoWallet | Fallo> {
  if (!/^[0-9a-f-]{36}$/.test(ticketId)) return { error: "Boleto no encontrado.", status: 404 };
  const session = await getSession();
  if (!session) return { error: "Inicia sesión.", status: 401 };
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select(`id, qr_token, is_active, seats(seat_label), price_categories(nombre), orders!inner(order_code, status, buyer_nombre, buyer_user_id, performances(id, starts_at, venue, cancelada_at, productions(id, nombre, venue, estado, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase, ${POSTER_COLUMNS})))`)
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
  const prod = f.productions;
  const tema = prod ? getTheme(prod as unknown as Production) : null;
  const poster = posterUrl(prod as unknown as Production, "boleto")?.url ?? null;
  const obra = prod?.nombre ?? "DARF Productions";
  const lugar = f.venue ?? prod?.venue ?? null;
  const asiento = asientoDe(t);
  const pase = paseBoleto({
    ticketId: t.id, qrToken: t.qr_token, obra, startsAt: f.starts_at, lugar, asiento,
    orden: o.order_code, comprador: o.buyer_nombre, estilo: estiloDe(tema, poster),
  });
  return {
    pase, obra, lugar, funcionId: f.id, asiento, comprador: o.buyer_nombre, orden: o.order_code,
    productionId: prod?.id ?? null, obraPublica: !!prod && ["publicada", "archivada"].includes(prod.estado),
    logo: isLight(pase.colores.fondo) ? "/marca/darf-horizontal.svg" : "/marca/darf-horizontal-blanco.svg",
    imagenObra: { ambiente: prod?.ambiente_path ? assetUrl(prod.ambiente_path) : poster, logo: tema?.logo ?? null },
  };
}

export type CredencialWallet = { pase: PaseWallet; fan: boolean; logo: string; logoTexto?: string; foto: string | null; banda: string };

/** La credencial única de la persona con sesión (0083). */
export async function credencialWallet(): Promise<CredencialWallet | Fallo> {
  const session = await getSession();
  if (!session) return { error: "Inicia sesión.", status: 401 };
  const c = await getMiCredencial();
  if (!c) return { error: "No encontramos tu credencial.", status: 404 };
  const vista = paseCredencial(c);
  const pase = paseCredencialWallet({ userId: session.userId, liga: c.liga, codigo: c.codigo, pase: vista });
  const fan = vista.tema === "fan";
  const banda = c.nivel === "equipo" ? c.franja ?? "crew" : c.nivel === "club" && c.socio ? "fan" : "cuenta";
  // El logo de Fan Zone es muy ancho para Wallet: monograma dorado + texto.
  return { pase, fan, logo: fan ? "/marca/darf-monograma-oro.svg" : "/marca/darf-horizontal-blanco.svg", logoTexto: fan ? "DARF Fan Zone" : undefined, foto: c.fotoUrl, banda };
}

export const esFallo = (x: unknown): x is Fallo => typeof x === "object" && x !== null && "error" in x && "status" in x;
