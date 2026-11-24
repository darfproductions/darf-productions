import QRCode from "qrcode";
import { textosBoleto, type BeneficioBoleto } from "@/lib/beneficios-rules";
import { estiloDe, type BoletoVista, type EstiloBoleto } from "@/lib/ticket-design";
import type { Traspaso } from "@/lib/traspaso-rules";
import { funcionPasada, imagen, poster, type Obra } from "~/lib/datos";
import { mayus } from "@/lib/dates";
import { supabase } from "~/lib/supabase";

// Mis boletos por orden (igual que Mi cuenta en la web): cada orden con sus boletos, lo que incluye cada zona, los
// traspasos y el diseño del boleto de la obra (el mismo del PDF). Todo pasa por RLS: cada quien ve solo lo suyo.

export type BoletoFila = { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; etiqueta: string; zona: string | null };
export type OrdenBoletos = {
  id: string; order_code: string; status: "pendiente" | "aprobado" | "rechazado"; total: number; created_at: string;
  buyer_nombre: string; buyer_telefono: string | null; expires_at: string | null; vencida_at: string | null; motivo: string | null;
  discount_codigo: string | null; discount_amount: number | null;
  funcion: { id: string; starts_at: string | null; venue: string | null; production_id: string; cancelada_at: string | null; cancelada_motivo: string | null } | null;
  obra: Obra | null; boletos: BoletoFila[];
};


export function fechaFuncion(iso: string | null): string {
  if (!iso) return "Fecha por anunciar";
  return mayus(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));
}

export async function leerOrdenes(uid: string): Promise<{ ordenes: OrdenBoletos[]; traspasos: Traspaso[] }> {
  const [o, t] = await Promise.all([
    supabase.from("orders")
      .select(`id, order_code, status, total, created_at, buyer_nombre, buyer_telefono, expires_at, vencida_at, motivo, discount_codigo, discount_amount,
        performances(id, starts_at, venue, production_id, cancelada_at, cancelada_motivo, productions(*)),
        tickets(id, is_active, qr_token, checked_in_at, seats(seat_label, price_categories(nombre)), price_categories(nombre))`)
      .eq("buyer_user_id", uid).order("created_at", { ascending: false }),
    supabase.rpc("mis_traspasos"),
  ]);
  if (o.error) throw new Error(o.error.message);
  type T = { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; seats: { seat_label: string; price_categories: { nombre: string } | null } | null; price_categories: { nombre: string } | null };
  type F = Omit<OrdenBoletos, "funcion" | "obra" | "boletos"> & { performances: (NonNullable<OrdenBoletos["funcion"]> & { productions: Obra | null }) | null; tickets: T[] };
  const ordenes = ((o.data ?? []) as unknown as F[]).map(({ performances: p, tickets, ...r }) => ({
    ...r, total: Number(r.total),
    funcion: p ? { id: p.id, starts_at: p.starts_at, venue: p.venue, production_id: p.production_id, cancelada_at: p.cancelada_at, cancelada_motivo: p.cancelada_motivo } : null,
    obra: p?.productions ?? null,
    boletos: tickets.map((x) => ({
      id: x.id, is_active: x.is_active, qr_token: x.qr_token, checked_in_at: x.checked_in_at,
      etiqueta: x.seats?.seat_label ?? (x.price_categories ? `General · ${x.price_categories.nombre}` : "Admisión general"),
      zona: x.seats?.price_categories?.nombre ?? x.price_categories?.nombre ?? null,
    })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true })),
  }));
  return { ordenes, traspasos: (t.data ?? []) as Traspaso[] };
}

/** Estilo del boleto de la obra (colores, logo y póster) con las imágenes de la app. */
export function estiloObra(obra: Obra | null): EstiloBoleto {
  if (!obra?.color_fondo || !obra.color_superficie || !obra.color_texto || !obra.color_acento) return estiloDe(null);
  return { fondo: obra.color_fondo, superficie: obra.color_superficie, texto: obra.color_texto, acento: obra.color_acento, logo: imagen(obra.logo_path), poster: poster(obra, "boleto") };
}

/** Los boletos activos de una orden, listos para dibujarse (QR, lo que incluye su zona y su hora de acceso). */
export async function boletosVista(o: OrdenBoletos): Promise<BoletoVista[]> {
  const activos = o.boletos.filter((b) => b.is_active);
  const pasada = funcionPasada(o.funcion?.starts_at ?? null);
  const { data } = activos.length ? await supabase.rpc("beneficios_boletos", { p_tickets: activos.map((b) => b.id) }) : { data: [] };
  const benef = new Map(((data ?? []) as { ticket_id: string; beneficios: BeneficioBoleto[] }[]).map((r) => [r.ticket_id, r.beneficios]));
  return Promise.all(activos.map(async (b) => ({
    id: b.id, obra: o.obra?.nombre ?? "Producción", funcion: fechaFuncion(o.funcion?.starts_at ?? null), lugar: o.funcion?.venue ?? o.obra?.venue ?? null,
    asiento: b.etiqueta, zona: b.zona, orden: o.order_code, comprador: o.buyer_nombre, usado: !!b.checked_in_at,
    qr: pasada ? null : await QRCode.toDataURL(b.qr_token, { margin: 1, width: 480 }),
    ...textosBoleto(benef.get(b.id) ?? [], o.funcion?.starts_at),
  })));
}
