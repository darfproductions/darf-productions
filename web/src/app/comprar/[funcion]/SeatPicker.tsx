"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SeatMap, type ZonePrice } from "@/components/SeatMap";
import { formatMoney, previewDiscount, type DiscountPreview, type MapSeat } from "@/lib/tickets";
import { placeOrder, type OrderResult } from "./actions";

export type { ZonePrice };

const MAX_SEATS = 20; // mismo tope que valida la base

export function SeatPicker(props: {
  performanceId: string;
  productionName: string;
  seats: MapSeat[];
  taken: string[];
  prices: ZonePrice[];
  defaultPhone: string;
  defaultSeller?: string;
  defaultSellerCheck?: { ok: boolean; text: string; code: string } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState(props.defaultPhone);
  const [seller, setSeller] = useState(props.defaultSeller ?? "");
  // Código de vendedor: se revisa al escribirlo; uno no válido no deja comprar (0050).
  const [sellerCheck, setSellerCheck] = useState<{ ok: boolean; text: string; code: string } | null>(props.defaultSellerCheck ?? null);
  const [codeInput, setCodeInput] = useState("");
  const [discount, setDiscount] = useState<DiscountPreview | null>(null);
  const [discountMsg, setDiscountMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<OrderResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  const taken = useMemo(() => new Set(props.taken), [props.taken]);
  const priceByCat = useMemo(() => new Map(props.prices.map((p) => [p.categoryId, p])), [props.prices]);
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

  async function checkSeller(value = seller) {
    const code = value.trim().toUpperCase();
    if (!code) { setSellerCheck(null); return; }
    const { data, error: e } = await createClient().rpc("preview_seller_code", { target_performance_id: props.performanceId, target_code: code });
    setSellerCheck(e ? { ok: false, text: e.message, code } : { ok: true, text: `Vendedor: ${data as string}`, code });
  }

  const sellerBad = seller.trim() !== "" && (!sellerCheck || sellerCheck.code !== seller.trim().toUpperCase() || !sellerCheck.ok);

  function submit() {
    setError("");
    if (sellerBad) {
      setError(sellerCheck && !sellerCheck.ok ? `${sellerCheck.text} Corrígelo o déjalo vacío.` : "Revisando el código de vendedor…");
      void checkSeller();
      return;
    }
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
        <SeatMap seats={props.seats} prices={props.prices} taken={taken} selected={selected} onToggle={toggle} />
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
            <input value={seller} onChange={(e) => { setSeller(e.target.value); setSellerCheck(null); }} onBlur={() => void checkSeller()}
              autoCapitalize="characters" className="rounded-lg bg-sala px-3 py-3 font-normal uppercase" />
            {sellerCheck && <span className={`text-xs font-normal ${sellerCheck.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{sellerCheck.text}</span>}
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
