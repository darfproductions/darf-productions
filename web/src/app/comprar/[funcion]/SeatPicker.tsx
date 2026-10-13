"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SeatMap, type ZonePrice } from "@/components/SeatMap";
import { formatMoney, previewDiscount, type DiscountPreview, type MapSeat } from "@/lib/tickets";
import { placeOrder, type OrderResult } from "./actions";
import { usePaso } from "@/components/PasosCompra";
import { OrderDone } from "./OrderDone";
import { mensajeError } from "@/lib/errores";

export type { ZonePrice };

const MAX_SEATS = 20; // mismo tope que valida la base

export function SeatPicker(props: {
  performanceId: string;
  productionId?: string;
  productionName: string;
  seats: MapSeat[];
  taken: string[];
  prices: ZonePrice[];
  defaultPhone: string;
  defaultSeller?: string;
  defaultSellerCheck?: { ok: boolean; text: string; code: string } | null;
  /** Sin sesión: se ve el mapa y se elige; para apartar se entra (los asientos se conservan). */
  sinSesion?: boolean;
  /** Asientos elegidos antes de entrar (?asientos=…). */
  inicial?: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set((props.inicial ?? []).filter((id) => !props.taken.includes(id) && props.seats.some((s) => s.id === id))));
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

  // Disponibilidad en vivo (Fase 4B): cada 20 s se vuelve a preguntar qué está ocupado. Si alguien
  // apartó un asiento que tenías elegido, se quita de tu selección y se avisa.
  const [polled, setPolled] = useState<string[] | null>(null);
  const [aviso, setAviso] = useState("");
  const taken = useMemo(() => new Set(polled ?? props.taken), [polled, props.taken]);
  useEffect(() => {
    const id = setInterval(async () => {
      const sb = createClient();
      if (document.visibilityState === "hidden") return; // las vencidas las libera la base cada minuto (0068)
      const { data } = await sb.rpc("get_taken_seats", { target_performance_id: props.performanceId });
      if (!data) return;
      const ocupados = new Set(data as string[]);
      setPolled(data as string[]);
      setSelected((prev) => {
        const perdidos = [...prev].filter((sid) => ocupados.has(sid));
        if (!perdidos.length) return prev;
        const labels = props.seats.filter((s) => perdidos.includes(s.id)).map((s) => s.seat_label).join(", ");
        setAviso(`Alguien acaba de apartar ${labels}. Lo quitamos de tu selección; elige otro.`);
        return new Set([...prev].filter((sid) => !ocupados.has(sid)));
      });
    }, 20000);
    return () => clearInterval(id);
  }, [props.performanceId, props.productionId, props.seats]);
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
    if (e) { setDiscount(null); setDiscountMsg(mensajeError(e)); return; }
    const d = data as DiscountPreview;
    setDiscount(d);
    setCodeInput(d.codigo);
    setDiscountMsg(`Código ${d.codigo} aplicado: ${d.percent}% de descuento.`);
  }

  async function checkSeller(value = seller) {
    const code = value.trim().toUpperCase();
    if (!code) { setSellerCheck(null); return; }
    const { data, error: e } = await createClient().rpc("preview_seller_code", { target_performance_id: props.performanceId, target_code: code });
    setSellerCheck(e ? { ok: false, text: mensajeError(e), code } : { ok: true, text: `Vendedor: ${data as string}`, code });
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
      else {
        setError(/disponible|bloqueado/i.test(r.message) ? `${r.message}. Actualizamos el mapa: elige otro asiento.` : r.message);
        setPolled(null);
        router.refresh();
      }
    });
  }

  usePaso(result ? 4 : chosen.length ? 3 : 2);
  if (result) return <OrderDone result={result} />;

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <section aria-label="Mapa de asientos" className="flex flex-col gap-4 lg:col-span-8">
        {aviso && <p role="alert" className="rounded-xl border border-[#ff8fa3]/40 bg-[#ff8fa3]/10 px-4 py-3 text-sm">{aviso}</p>}
        <SeatMap seats={props.seats} prices={props.prices} taken={taken} selected={selected} onToggle={toggle} />
        <button type="button" onClick={() => { setPolled(null); setAviso(""); router.refresh(); }} className="self-start text-sm font-bold text-violeta-claro">Actualizar disponibilidad</button>
      </section>

      <aside className="flex flex-col gap-4 pb-24 lg:col-span-4 lg:pb-0">
        <div id="tu-compra" className="sticky top-6 flex scroll-mt-4 flex-col gap-4 rounded-2xl bg-telon p-6">
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
            {(disc.note || discountMsg) && <p className={`text-sm ${disc.note || !discount ? "text-[#ff8fa3]" : "text-exito"}`}>{disc.note || discountMsg}</p>}
          </div>

          <dl className="flex flex-col gap-1 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div>
            {disc.amount > 0 && <div className="flex justify-between text-exito"><dt>Descuento {discount?.codigo}</dt><dd>−{formatMoney(disc.amount)}</dd></div>}
            <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatMoney(subtotal - disc.amount)}</dd></div>
            <p className="text-xs text-texto-3">El total final lo confirma el sistema al apartar tus asientos.</p>
          </dl>

          <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" className="rounded-lg bg-sala px-3 py-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de vendedor (opcional)
            <input value={seller} onChange={(e) => { setSeller(e.target.value); setSellerCheck(null); }} onBlur={() => void checkSeller()}
              autoCapitalize="characters" className="rounded-lg bg-sala px-3 py-3 font-normal uppercase" />
            {sellerCheck && <span className={`text-xs font-normal ${sellerCheck.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{sellerCheck.text}</span>}
          </label>

          {error && <p role="alert" className="text-[#ff8fa3]">{error}</p>}
          <p className="text-xs text-texto-3">Al apartar aceptas los <a href="/terminos" target="_blank" className="underline">términos</a> y la <a href="/reembolsos" target="_blank" className="underline">política de cambios y reembolsos</a>.</p>
          {props.sinSesion ? (
            <>
              <Link
                href={`/entrar?next=${encodeURIComponent(`/comprar/${props.performanceId}?asientos=${[...selected].join(",")}${seller.trim() ? `&v=${encodeURIComponent(seller.trim())}` : ""}`)}`}
                aria-disabled={chosen.length === 0}
                className={`boton-compra rounded-full py-4 text-center text-sm font-bold uppercase tracking-[0.1em] ${chosen.length === 0 ? "pointer-events-none opacity-50" : ""}`}
              >
                Entrar para apartar
              </Link>
              <p className="text-xs text-texto-3">Entra o crea tu cuenta gratis; tus asientos se quedan elegidos.</p>
            </>
          ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending || chosen.length === 0}
            className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-50"
          >
            {pending ? "Apartando…" : `Apartar ${chosen.length || ""} ${chosen.length === 1 ? "asiento" : "asientos"}`}
          </button>
          )}
        </div>
      </aside>
      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/10 bg-sala/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="text-sm">
            <b>{chosen.length} {chosen.length === 1 ? "asiento" : "asientos"}</b> · {formatMoney(subtotal - disc.amount)}
          </span>
          <button type="button" onClick={() => document.getElementById("tu-compra")?.scrollIntoView({ behavior: "smooth" })}
            className="boton-compra rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.08em]">Continuar</button>
        </div>
      )}
    </div>
  );
}
