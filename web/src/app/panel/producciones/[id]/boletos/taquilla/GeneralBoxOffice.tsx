"use client";

/* eslint-disable @next/next/no-img-element -- QR generados como imagen en el servidor */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { input } from "@/components/panel/ui";
import type { GeneralZone } from "@/lib/boleteria";
import { formatMoney } from "@/lib/tickets";
import { DespuesDeVenta, PAGO_INICIAL, PagoTaquilla, type Pago } from "./PagoTaquilla";
import { boxOfficeGeneralSale, type GeneralSaleResult } from "../actions";

// Taquilla de entrada general (0055): zona + cantidad; queda aprobada al momento.
export function GeneralBoxOffice({ pid, performanceId, zones }: { pid: string; performanceId: string; zones: GeneralZone[] }) {
  const router = useRouter();
  const [zone, setZone] = useState(zones.find((z) => z.libres > 0)?.price_category_id ?? zones[0]?.price_category_id ?? "");
  const [cantidad, setCantidad] = useState(1);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [pago, setPago] = useState<Pago>(PAGO_INICIAL);
  const [result, setResult] = useState<GeneralSaleResult | null>(null);
  const [pending, start] = useTransition();
  const z = zones.find((x) => x.price_category_id === zone);

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
        <p className="titular text-2xl">Venta registrada · {result.orderCode}</p>
        <p className="text-texto-2">Total {formatMoney(result.total)}. Muestra o envía estos QR al comprador.</p>
        <DespuesDeVenta pid={pid} orderCode={result.orderCode} aviso={result.aviso} cuenta={result.cuenta} />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {result.tickets.map((t, i) => (
            <li key={i} className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 text-black">
              <img src={t.qr} alt={`QR ${i + 1}`} className="w-full" />
              <span className="text-sm font-bold">{t.seat}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala" onClick={() => { setResult(null); setCantidad(1); setNombre(""); setTelefono(""); setPago(PAGO_INICIAL); router.refresh(); }}>
          Nueva venta
        </button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-telon p-5">
      <h2 className="text-lg font-bold">Entrada general</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {zones.map((x) => (
          <button key={x.price_category_id} type="button" disabled={x.libres === 0} onClick={() => { setZone(x.price_category_id); setCantidad(1); }}
            className={`rounded-full border px-3 py-1.5 font-semibold disabled:opacity-40 ${zone === x.price_category_id ? "border-texto bg-white/10" : "border-white/20"}`}>
            {x.nombre} · {formatMoney(x.precio)} · {x.libres} de {x.cupo} libres
          </button>
        ))}
      </div>
      {z && (
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Cantidad
            <input className={input} type="number" min={1} max={Math.min(20, z.libres)} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre *<input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *<input className={input} type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Vendedor (opcional)<input className={input} value={vendedor} onChange={(e) => setVendedor(e.target.value)} /></label>
          <PagoTaquilla pago={pago} onChange={setPago} />
        </div>
      )}
      {result && !result.ok && <p role="alert" className="text-sm font-semibold text-[#ff8fa3]">{result.message}</p>}
      {z && (
        <button type="button" disabled={pending || z.libres === 0}
          onClick={() => {
            if (!window.confirm(`¿Registrar ${cantidad} boleto(s) de ${z.nombre} por ${pago.metodo === "cortesia" ? "$0 (cortesía)" : formatMoney(z.precio * cantidad)}? Confirma que ya cobraste.`)) return;
            start(async () => {
              const r = await boxOfficeGeneralSale({ pid, performanceId, zoneId: zone, cantidad, nombre, telefono, vendedor, ...pago });
              setResult(r);
              if (!r.ok) router.refresh();
            });
          }}
          className="boton-compra self-start rounded-full px-6 py-3 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-50">
          {pending ? "Registrando…" : `Registrar ${cantidad} · ${formatMoney(z.precio * cantidad)}`}
        </button>
      )}
    </section>
  );
}
