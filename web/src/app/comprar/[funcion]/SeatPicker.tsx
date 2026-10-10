"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  groupSeatsByRow,
  previewDiscount,
  ZONE_COLORS,
  type DiscountPreview,
  type MapSeat,
} from "@/lib/tickets";
import { placeOrder, type OrderResult } from "./actions";

export type ZonePrice = { categoryId: string; price: number; nombre: string };

const MAX_SEATS = 20; // mismo tope que valida la base

export function SeatPicker(props: {
  performanceId: string;
  productionName: string;
  seats: MapSeat[];
  taken: string[];
  prices: ZonePrice[];
  defaultPhone: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState(props.defaultPhone);
  const [seller, setSeller] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [discount, setDiscount] = useState<DiscountPreview | null>(null);
  const [discountMsg, setDiscountMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<OrderResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  const taken = useMemo(() => new Set(props.taken), [props.taken]);
  const priceByCat = useMemo(() => new Map(props.prices.map((p) => [p.categoryId, p])), [props.prices]);
  const rows = useMemo(() => groupSeatsByRow(props.seats), [props.seats]);
  const chosen = props.seats.filter((s) => selected.has(s.id));
  const subtotal = chosen.reduce((n, s) => n + (priceByCat.get(s.price_category_id ?? "")?.price ?? 0), 0);
  const disc = previewDiscount(discount, chosen, (id) => priceByCat.get(id)?.price);

  function toggle(s: MapSeat) {
    if (taken.has(s.id) || !priceByCat.has(s.price_category_id ?? "")) return;
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else if (next.size < MAX_SEATS) next.add(s.id);
      else setError(`Máximo ${MAX_SEATS} asientos por compra.`);
      return next;
    });
  }

  async function applyCode() {
    if (discount) { setDiscount(null); setDiscountMsg(""); setCodeInput(""); return; }
    const code = codeInput.trim();
    if (!code) return;
    const { data, error: e } = await createClient().rpc("preview_discount_code", {
      target_performance_id: props.performanceId,
      target_code: code,
    });
    if (e) { setDiscount(null); setDiscountMsg(e.message); return; }
    const d = data as DiscountPreview;
    setDiscount(d);
    setCodeInput(d.codigo);
    setDiscountMsg(`Código ${d.codigo} aplicado: ${d.percent}% de descuento.`);
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const r = await placeOrder({
        performanceId: props.performanceId,
        productionName: props.productionName,
        seatIds: [...selected],
        phone,
        sellerCode: seller,
        discountCode: discount?.codigo ?? null,
      });
      if (r.ok) { setResult(r); setSelected(new Set()); }
      else { setError(r.message); router.refresh(); }
    });
  }

  if (result) {
    return (
      <div role="status" className="flex max-w-2xl flex-col gap-4 rounded-2xl bg-telon p-8">
        <p className="titular text-3xl">¡Asientos apartados!</p>
        <p className="text-lg">Orden <b>{result.orderCode}</b> · {result.seats.join(", ")} · Total {formatMoney(result.total)}</p>
        <p className="text-texto-2">Tu solicitud quedó guardada y tus asientos están apartados hasta que confirmemos tu pago. Cuando se apruebe, tus boletos con QR aparecerán en Mi cuenta.</p>
        <div className="flex flex-wrap gap-3">
          {result.whatsappUrl ? (
            <a href={result.whatsappUrl} className="rounded-full bg-[#25d366] px-6 py-4 text-sm font-bold text-[#062b16]">Pagar por WhatsApp</a>
          ) : (
            <p className="text-sm text-texto-3">Pago por WhatsApp: sin número configurado en este entorno.</p>
          )}
          <Link href={`/cuenta?orden=${result.orderCode}`} className="rounded-full border border-white/30 px-6 py-4 text-sm font-bold">Ir a Mis boletos</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <section aria-label="Mapa de asientos" className="flex flex-col gap-4 lg:col-span-8">
        <ul className="flex flex-wrap gap-2 text-sm">
          {props.prices.slice().sort((a, b) => b.price - a.price).map((z) => (
            <li key={z.categoryId} className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: ZONE_COLORS[z.nombre] ?? "#888" }} />
              {z.nombre} · {formatMoney(z.price).replace(" MXN", "")}
            </li>
          ))}
          <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#3a3446]" /> Ocupado</li>
          <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-white" /> Tu selección</li>
        </ul>

        <div className="overflow-x-auto rounded-2xl bg-telon p-4">
          <div className="mx-auto flex w-max flex-col items-center gap-1.5">
            <div className="mb-3 w-full rounded-md bg-telon-2 py-2 text-center text-xs font-bold uppercase tracking-[0.3em] text-texto-3">Escenario</div>
            {rows.map(({ row, blocks }) => (
              <div key={row} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-bold text-texto-3">{row}</span>
                {blocks.map((block, bi) => (
                  <div key={bi} className="flex gap-1">
                    {block.map((s) => {
                      const zone = priceByCat.get(s.price_category_id ?? "");
                      const isTaken = taken.has(s.id) || !zone;
                      const isSel = selected.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggle(s)}
                          disabled={isTaken}
                          aria-pressed={isSel}
                          aria-label={`Asiento ${s.seat_label}${zone ? `, ${zone.nombre}, ${formatMoney(zone.price)}` : ""}${isTaken ? ", ocupado" : ""}`}
                          title={s.seat_label}
                          className="flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold disabled:cursor-not-allowed"
                          style={{
                            background: isSel ? "#ffffff" : isTaken ? "#3a3446" : ZONE_COLORS[zone!.nombre] ?? "#888",
                            color: isSel ? "#0b0910" : isTaken ? "#6e6878" : "#ffffff",
                          }}
                        >
                          {s.seat_number}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <span className="w-4 text-center text-xs font-bold text-texto-3">{row}</span>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => router.refresh()} className="self-start text-sm font-bold text-violeta-claro">Actualizar disponibilidad</button>
      </section>

      <aside className="flex flex-col gap-4 lg:col-span-4">
        <div className="sticky top-6 flex flex-col gap-4 rounded-2xl bg-telon p-6">
          <h2 className="text-lg font-bold">Tu compra</h2>
          {chosen.length === 0 ? (
            <p className="text-texto-2">Toca los asientos en el mapa para elegirlos.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {chosen.map((s) => (
                <li key={s.id} className="flex justify-between"><span>{s.seat_label}</span><span>{formatMoney(priceByCat.get(s.price_category_id ?? "")?.price ?? 0)}</span></li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <label htmlFor="codigo" className="text-sm font-semibold">Código de descuento</label>
            <div className="flex gap-2">
              <input id="codigo" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} disabled={!!discount} className="min-w-0 flex-1 rounded-lg bg-sala px-3 py-2.5" />
              <button type="button" onClick={applyCode} className="rounded-lg border border-white/30 px-4 text-sm font-bold">{discount ? "Quitar" : "Aplicar"}</button>
            </div>
            {(disc.note || discountMsg) && <p className={`text-sm ${disc.note || !discount ? "text-[#ff8fa3]" : "text-[#7ee2a8]"}`}>{disc.note || discountMsg}</p>}
          </div>

          <dl className="flex flex-col gap-1 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
            {disc.amount > 0 && <div className="flex justify-between text-[#7ee2a8]"><dt>Descuento {discount?.codigo}</dt><dd>−{formatMoney(disc.amount)}</dd></div>}
            <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatMoney(subtotal - disc.amount)}</dd></div>
            <p className="text-xs text-texto-3">El total final lo confirma el sistema al apartar tus asientos.</p>
          </dl>

          <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" className="rounded-lg bg-sala px-3 py-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de vendedor (opcional)
            <input value={seller} onChange={(e) => setSeller(e.target.value)} className="rounded-lg bg-sala px-3 py-3 font-normal" />
          </label>

          {error && <p role="alert" className="text-[#ff8fa3]">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={pending || chosen.length === 0}
            className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-50"
          >
            {pending ? "Apartando…" : `Apartar ${chosen.length || ""} ${chosen.length === 1 ? "asiento" : "asientos"}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
