"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GeneralZone } from "@/lib/boleteria";
import { formatMoney } from "@/lib/tickets";
import { placeGeneralOrder, type OrderResult } from "./actions";
import { usePaso } from "@/components/PasosCompra";
import { OrderDone } from "./OrderDone";
import { mensajeError } from "@/lib/errores";

const MAX = 10; // mismo tope que valida la base (0055)
const field = "rounded-lg bg-sala px-3 py-3 font-normal";

// Entrada general (Fase 4C): eliges zona y cuántos boletos; sin asiento. La base cuenta el cupo.
export function GeneralPicker(props: { performanceId: string; productionName: string; zones: GeneralZone[]; defaultPhone: string; defaultSeller?: string; sinSesion?: boolean }) {
  const [zone, setZone] = useState(props.zones.find((z) => z.libres > 0)?.price_category_id ?? "");
  const [cantidad, setCantidad] = useState(1);
  const [phone, setPhone] = useState(props.defaultPhone);
  const [seller, setSeller] = useState(props.defaultSeller ?? "");
  const [codigo, setCodigo] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<OrderResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const z = props.zones.find((x) => x.price_category_id === zone);
  const tope = Math.min(MAX, z?.libres ?? 0);

  async function revisarCodigo() {
    setNota("");
    if (!codigo.trim()) return;
    const { data, error: e } = await createClient().rpc("preview_discount_code", { target_performance_id: props.performanceId, target_code: codigo.trim() });
    setNota(e ? mensajeError(e) : `Código ${(data as { codigo: string }).codigo}: ${(data as { percent: number }).percent}% de descuento (se confirma al apartar).`);
  }

  function apartar() {
    setError("");
    start(async () => {
      const r = await placeGeneralOrder({ performanceId: props.performanceId, productionName: props.productionName, zoneId: zone, cantidad, phone, sellerCode: seller, discountCode: codigo });
      if (r.ok) setResult(r);
      else setError(r.message);
    });
  }

  usePaso(result ? 4 : zone ? 3 : 2);
  if (result) return <OrderDone result={result} />;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
      <div>
        <h2 className="text-lg font-bold">Entrada general</h2>
        <p className="text-sm text-texto-2">Sin asiento numerado: entras a la zona y te acomodas al llegar. Máximo {MAX} por compra.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {props.zones.map((x) => (
          <li key={x.price_category_id}>
            <label className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-4 ${zone === x.price_category_id ? "border-texto bg-white/5" : "border-white/15"} ${x.libres === 0 ? "cursor-not-allowed opacity-50" : ""}`}>
              <input type="radio" name="zona" className="sr-only" disabled={x.libres === 0} checked={zone === x.price_category_id}
                onChange={() => { setZone(x.price_category_id); setCantidad(1); }} />
              <span className="font-bold">{x.nombre} · {x.antes != null && <s className="font-normal opacity-60">{formatMoney(x.antes)}</s>} {formatMoney(x.precio)}</span>
              {x.descripcion && <span className="text-xs text-texto-3">{x.descripcion}</span>}
              <span className={`text-sm ${x.libres === 0 ? "text-[#ff8fa3]" : x.libres <= 10 ? "text-aviso" : "text-texto-2"}`}>
                {x.libres === 0 ? "Agotado" : x.libres <= 10 ? `¡Quedan ${x.libres}!` : `${x.libres} lugares disponibles`}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {z && tope > 0 && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">¿Cuántos?</span>
            <button type="button" aria-label="Uno menos" onClick={() => setCantidad((n) => Math.max(1, n - 1))} className="h-10 w-10 rounded-full border border-white/25 text-lg font-bold">−</button>
            <span className="w-8 text-center text-xl font-black">{cantidad}</span>
            <button type="button" aria-label="Uno más" onClick={() => setCantidad((n) => Math.min(tope, n + 1))} className="h-10 w-10 rounded-full border border-white/25 text-lg font-bold">+</button>
            <span className="ml-auto text-lg font-bold">{formatMoney(z.precio * cantidad)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de descuento
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} onBlur={() => void revisarCodigo()} className={`${field} uppercase`} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de vendedor
              <input value={seller} onChange={(e) => setSeller(e.target.value)} className={`${field} uppercase`} />
            </label>
          </div>
          {nota && <p className="text-sm text-texto-2">{nota}</p>}
          {error && <p role="alert" className="text-[#ff8fa3]">{error}</p>}
          <p className="text-xs text-texto-3">Al apartar aceptas los <a href="/terminos" target="_blank" className="underline">términos</a> y la <a href="/reembolsos" target="_blank" className="underline">política de cambios y reembolsos</a>.</p>
          {props.sinSesion ? (
            <Link href={`/entrar?next=${encodeURIComponent(`/comprar/${props.performanceId}`)}`}
              className="boton-compra self-start rounded-full px-8 py-4 text-sm font-bold uppercase tracking-[0.1em]">
              Entrar para apartar
            </Link>
          ) : (
          <button type="button" onClick={apartar} disabled={pending || !phone.trim()}
            className="boton-compra self-start rounded-full px-8 py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-50">
            {pending ? "Apartando…" : `Apartar ${cantidad} ${cantidad === 1 ? "lugar" : "lugares"}`}
          </button>
          )}
        </>
      )}
      {props.zones.every((x) => x.libres === 0) && <p className="text-[#ff8fa3]">La entrada general está agotada para esta función.</p>}
    </div>
  );
}
