"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { formatMoney } from "@/lib/tickets";
import { esMetodo } from "@/lib/ventas-rules";
import { createClient } from "@/lib/supabase/server";

// Boletería de la obra en el panel. Usa las MISMAS funciones de la base que la
// 1.0 (approve_order, admin_create_seated_order, …); 0034 solo cambió quién
// puede usarlas: cada permiso en SU obra.

export type TicketState = { ok: boolean; message: string } | null;

const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/producciones/${pid}`);
  revalidatePath("/producciones");
};

const motivoDe = (f: FormData) => String(f.get("motivo") ?? "").trim().slice(0, 300) || null;

export async function approveOrder(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const metodo = String(f.get("metodo") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_order", {
    target_order_id: String(f.get("order")),
    p_metodo: esMetodo(metodo) ? metodo : null,
    p_referencia: String(f.get("referencia") ?? "").trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Orden aprobada: los boletos ya aparecen en la cuenta del comprador." };
}

export async function rejectOrder(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_order", { target_order_id: String(f.get("order")), p_motivo: motivoDe(f) });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Orden rechazada: los lugares quedaron libres y el comprador recibió el aviso." };
}

export async function cancelTicket(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const ticket = String(f.get("ticket") ?? "");
  if (!ticket) return { ok: false, message: "Elige el boleto que quieres cancelar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_ticket", { target_ticket_id: ticket, p_motivo: motivoDe(f) });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Boleto cancelado: su precio se descontó de la orden y el lugar quedó libre." };
}

export async function cancelOrder(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_order", { target_order_id: String(f.get("order")), p_motivo: motivoDe(f) });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  const monto = Number((data as { monto?: number } | null)?.monto ?? 0);
  return { ok: true, message: `Orden cancelada. ${monto > 0 ? `Si ya había pagado, devuelve ${formatMoney(monto)}.` : ""}`.trim() };
}

export async function extendOrder(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const horas = Math.min(72, Math.max(1, Number(f.get("horas") ?? 24) || 24));
  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_order", { target_order_id: String(f.get("order")), p_horas: horas });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: `Listo: el apartado sigue ${horas} horas más y el comprador recibió el aviso.` };
}

/** Método de pago de una venta en taquilla (0088). No detiene la venta si falla. */
async function guardarPago(orderId: string | undefined, metodo: string | undefined) {
  if (!orderId || !metodo || !esMetodo(metodo)) return;
  const supabase = await createClient();
  await supabase.rpc("order_set_pago", { target_order_id: orderId, p_metodo: metodo, p_referencia: null });
}

export type SaleResult =
  | { ok: true; orderCode: string; total: number; tickets: { seat: string; qr: string }[] }
  | { ok: false; message: string };

/** Venta en taquilla (queda aprobada al momento; mismo RPC que la 1.0). */
export async function boxOfficeSale(input: { pid: string; performanceId: string; seatIds: string[]; nombre: string; telefono: string; vendedor: string; metodo?: string }): Promise<SaleResult> {
  if (!input.nombre.trim() || !input.telefono.trim()) return { ok: false, message: "Escribe nombre y teléfono del comprador." };
  if (!input.seatIds.length) return { ok: false, message: "Elige al menos un asiento." };
  const supabase = await createClient();
  await supabase.rpc("expire_due_orders", { pid: input.pid });
  const { data, error } = await supabase.rpc("admin_create_seated_order", {
    target_performance_id: input.performanceId,
    target_buyer_nombre: input.nombre.trim(),
    target_buyer_telefono: input.telefono.trim(),
    target_seat_ids: input.seatIds,
    target_seller_codigo: input.vendedor.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  const r = data as { order_id?: string; order_code: string; total: number; tickets: { seat_label: string; qr_token: string }[] };
  await guardarPago(r.order_id, input.metodo);
  const tickets = await Promise.all(
    (r.tickets ?? []).map(async (t) => ({ seat: t.seat_label, qr: await QRCode.toDataURL(t.qr_token, { margin: 1, width: 240 }) })),
  );
  refresh(input.pid);
  return { ok: true, orderCode: r.order_code, total: Number(r.total), tickets };
}

// ──────── Funciones y precios (funciones.gestionar) ────────

export async function createPerformance(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const fecha = String(f.get("fecha") ?? "");
  const starts_at = fecha ? localMxToIso(fecha) : null;
  if (fecha && !starts_at) return { ok: false, message: "Revisa la fecha y hora." };
  const supabase = await createClient();
  const { error } = await supabase.from("performances").insert({ production_id: pid, starts_at, venue: String(f.get("venue") ?? "").trim() || null, on_sale: false });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Función creada (sin venta). Revisa sus precios y ponla en venta cuando esté lista." };
}

export async function updatePerformance(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("perf"));
  const fecha = String(f.get("fecha") ?? "");
  const starts_at = fecha ? localMxToIso(fecha) : null;
  if (fecha && !starts_at) return { ok: false, message: "Revisa la fecha y hora." };
  const on_sale = f.get("on_sale") === "on";
  if (on_sale && !starts_at) return { ok: false, message: "Una función sin fecha no puede estar en venta." };
  // Preventa del Club Fan (0076): hasta esa fecha solo los socios pueden comprar.
  const preventaTxt = String(f.get("preventa_hasta") ?? "");
  const preventa_hasta = preventaTxt ? localMxToIso(preventaTxt) : null;
  if (preventaTxt && !preventa_hasta) return { ok: false, message: "Revisa la fecha de la preventa." };
  if (preventa_hasta && starts_at && preventa_hasta >= starts_at) return { ok: false, message: "La preventa debe terminar antes de la función." };
  const prices = [...f.entries()]
    .filter(([k, v]) => k.startsWith("precio_") && String(v).trim() !== "")
    .map(([k, v]) => {
      const cat = k.slice(7);
      const cupo = String(f.get(`cupo_${cat}`) ?? "").trim();
      return { performance_id: id, price_category_id: cat, price: Number(v), ...(f.has(`cupo_${cat}`) && { cupo: cupo === "" ? null : Number(cupo) }) };
    });
  if (prices.some((p) => Number.isNaN(p.price))) return { ok: false, message: "Revisa los precios." };
  if (prices.some((p) => p.price < 0)) return { ok: false, message: "Los precios no pueden ser negativos." };
  if (prices.some((p) => "cupo" in p && p.cupo != null && (!Number.isInteger(p.cupo) || p.cupo < 0))) return { ok: false, message: "El cupo debe ser un número entero." };
  const supabase = await createClient();
  if (prices.length) {
    const { error } = await supabase.from("performance_price_categories").upsert(prices, { onConflict: "performance_id,price_category_id" });
    if (error) return { ok: false, message: error.message };
  }
  const { error, count } = await supabase
    .from("performances")
    .update({ starts_at, venue: String(f.get("venue") ?? "").trim() || null, on_sale, preventa_hasta }, { count: "exact" })
    .eq("id", id)
    .eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta función." };
  refresh(pid);
  return { ok: true, message: on_sale ? (preventa_hasta && new Date(preventa_hasta).getTime() > Date.now() ? "Guardado: la función está en preventa para el Club Fan." : "Guardado: la función está en venta.") : "Guardado." };
}

export async function deletePerformance(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_performance", { target_performance_id: String(f.get("perf")) });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Función eliminada." };
}

/** Obra en venta (switch general que usa la 1.0). ventas.operar; la base exige que esté publicada. */
export async function setProductionOnSale(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const on_sale = String(f.get("on_sale")) === "true";
  const supabase = await createClient();
  const { error, count } = await supabase.from("productions").update({ on_sale }, { count: "exact" }).eq("id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para cambiar la venta de esta obra." };
  refresh(pid);
  return { ok: true, message: on_sale ? "La obra está en venta." : "La obra ya no está en venta." };
}

// ──────── Descuentos (descuentos.gestionar) ────────

export async function saveDiscount(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const num = (k: string) => {
    const v = String(f.get(k) ?? "").trim();
    return v ? Number(v) : null;
  };
  const hasta = String(f.get("hasta") ?? "");
  const desde = String(f.get("desde") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_discount_code", {
    target_id: String(f.get("id") ?? "") || null,
    target_production_id: pid,
    target_codigo: String(f.get("codigo") ?? ""),
    target_percent: num("percent"),
    target_valid_from: desde ? localMxToIso(desde) : null,
    target_valid_until: hasta ? localMxToIso(hasta) : null,
    target_max_uses_total: num("max_total"),
    target_max_tickets_per_order: num("max_orden"),
    target_is_active: f.get("activo") === "on",
    target_category_ids: f.getAll("zona").map(String),
    target_performance_ids: f.getAll("funcion").map(String),
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Código guardado." };
}

export async function deleteDiscount(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_discount_code", { target_id: String(f.get("id")) });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Código eliminado (si ya se usó, solo se desactiva)." };
}

// ──────── Entrada general (0055) ────────

export async function saveGeneralZone(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const zid = String(f.get("zid") ?? "");
  const nombre = String(f.get("nombre") ?? "").trim();
  const cupo = Number(f.get("cupo"));
  if (!nombre) return { ok: false, message: "Escribe el nombre de la zona." };
  if (!Number.isInteger(cupo) || cupo < 1) return { ok: false, message: "El cupo debe ser un número entero mayor a 0." };
  const row = { nombre, cupo, descripcion: String(f.get("descripcion") ?? "").trim() || null, is_active: f.has("activa") ? f.getAll("activa").includes("on") : true };
  const supabase = await createClient();
  const { error } = zid
    ? await supabase.from("price_categories").update(row).eq("id", zid).eq("production_id", pid)
    : await supabase.from("price_categories").insert({ ...row, production_id: pid });
  if (error) return { ok: false, message: error.code === "23505" ? "Ya hay una zona con ese nombre." : error.message };
  refresh(pid);
  return { ok: true, message: zid ? "Zona guardada." : "Zona creada. Ponle precio en cada función." };
}

export type GeneralSaleResult = SaleResult;

/** Venta de entrada general en taquilla (aprobada al momento). */
export async function boxOfficeGeneralSale(input: { pid: string; performanceId: string; zoneId: string; cantidad: number; nombre: string; telefono: string; vendedor: string; metodo?: string }): Promise<GeneralSaleResult> {
  if (!input.nombre.trim() || !input.telefono.trim()) return { ok: false, message: "Escribe nombre y teléfono del comprador." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_general_order", {
    target_performance_id: input.performanceId,
    target_buyer_nombre: input.nombre.trim(),
    target_buyer_telefono: input.telefono.trim(),
    target_zone_id: input.zoneId,
    target_cantidad: input.cantidad,
    target_seller_codigo: input.vendedor.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  const r = data as { order_id?: string; order_code: string; total: number; tickets: { seat_label: string; qr_token: string }[] };
  await guardarPago(r.order_id, input.metodo);
  const tickets = await Promise.all(
    (r.tickets ?? []).map(async (t) => ({ seat: t.seat_label, qr: await QRCode.toDataURL(t.qr_token, { margin: 1, width: 240 }) })),
  );
  refresh(input.pid);
  return { ok: true, orderCode: r.order_code, total: Number(r.total), tickets };
}

// ──────── Mapa de asientos (0062) ────────
// La base revisa el permiso funciones.gestionar y que no se toquen asientos vendidos.

/** Zona con asiento (sin cupo), con su color para el mapa. */
export async function saveSeatZone(_p: TicketState, f: FormData): Promise<TicketState> {
  const pid = String(f.get("pid"));
  const zid = String(f.get("zid") ?? "");
  const nombre = String(f.get("nombre") ?? "").trim();
  const color = String(f.get("color") ?? "").trim();
  if (!nombre) return { ok: false, message: "Escribe el nombre de la zona." };
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, message: "Color no válido." };
  const row = { nombre, color: color || null, descripcion: String(f.get("descripcion") ?? "").trim() || null };
  const supabase = await createClient();
  const { error } = zid
    ? await supabase.from("price_categories").update(row).eq("id", zid).eq("production_id", pid).is("cupo", null)
    : await supabase.from("price_categories").insert({ ...row, production_id: pid });
  if (error) return { ok: false, message: error.code === "23505" ? "Ya hay una zona con ese nombre." : error.message };
  refresh(pid);
  return { ok: true, message: zid ? "Zona guardada." : "Zona creada. Úsala en el mapa y ponle precio en cada función." };
}

export type SeatMapResult = { ok: boolean; message: string };

const asientos = (n: unknown) => `${n} ${Number(n) === 1 ? "asiento" : "asientos"}`;

export async function generateSeatMap(pid: string, lista: { fila: string; numero: number; lado: string; etiqueta: string; zona: string }[]): Promise<SeatMapResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seat_map_generate", { pid, lista });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: `Mapa guardado: ${asientos((data as { asientos: number }).asientos)}.` };
}

export async function updateSeats(pid: string, ids: string[], accion: "quitar" | "poner" | "zona", zona?: string): Promise<SeatMapResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seat_map_update", { pid, ids, accion, zona: zona || null });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  const n = asientos((data as { asientos: number }).asientos);
  return { ok: true, message: accion === "quitar" ? `Quitaste ${n}.` : accion === "poner" ? `Volviste a poner ${n}.` : `Cambiaste de zona ${n}.` };
}

export async function copySeatMap(_p: TicketState, f: FormData): Promise<TicketState> {
  const destino = String(f.get("pid"));
  const origen = String(f.get("origen") ?? "");
  if (!origen) return { ok: false, message: "Elige la obra de donde copiar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seat_map_copy", { origen, destino });
  if (error) return { ok: false, message: error.message };
  refresh(destino);
  return { ok: true, message: `Mapa copiado: ${asientos((data as { asientos: number }).asientos)}. Revisa las zonas y sus precios.` };
}
