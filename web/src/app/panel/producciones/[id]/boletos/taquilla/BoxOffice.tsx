"use client";

/* eslint-disable @next/next/no-img-element -- QR generados como imagen en el servidor */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SeatMap, type ZonePrice } from "@/components/SeatMap";
import { input } from "@/components/panel/ui";
import { formatMoney, type MapSeat } from "@/lib/tickets";
import { METODOS_PAGO } from "@/lib/ventas-rules";
import { boxOfficeSale, type SaleResult } from "../actions";

const MAX_SEATS = 20;

// Venta en taquilla: elegir asientos, datos del comprador y listo (queda aprobada).
export function BoxOffice({ pid, performanceId, seats, taken, prices }: { pid: string; performanceId: string; seats: MapSeat[]; taken: string[]; prices: ZonePrice[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [metodo, setMetodo] = useState<string>("efectivo");
  const [result, setResult] = useState<SaleResult | null>(null);
  const [pending, start] = useTransition();
  const takenSet = useMemo(() => new Set(taken), [taken]);
  const price = useMemo(() => new Map(prices.map((p) => [p.categoryId, p.price])), [prices]);
  const chosen = seats.filter((s) => selected.has(s.id));
  const total = chosen.reduce((n, s) => n + (price.get(s.price_category_id ?? "") ?? 0), 0);

  function toggle(s: MapSeat) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else if (next.size < MAX_SEATS) next.add(s.id);
      return next;
    });
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
        <p className="titular text-2xl">Venta registrada · {result.orderCode}</p>
        <p className="text-texto-2">Total {formatMoney(result.total)}. Muestra o envía estos QR al comprador; también puedes imprimir esta pantalla.</p>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {result.tickets.map((t) => (
            <li key={`${t.seat}-${t.qr.slice(-24)}`} className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 text-black">
              <img src={t.qr} alt={`QR del asiento ${t.seat}`} className="w-full" />
              <span className="font-bold">{t.seat}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala" onClick={() => { setResult(null); setSelected(new Set()); setNombre(""); setTelefono(""); router.refresh(); }}>
          Nueva venta
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section aria-label="Mapa de asientos" className="flex flex-col gap-3 lg:col-span-8">
        <SeatMap seats={seats} prices={prices} taken={takenSet} selected={selected} onToggle={toggle} />
        <button type="button" onClick={() => router.refresh()} className="self-start text-sm font-bold text-violeta-claro">Actualizar disponibilidad</button>
      </section>
      <aside className="flex flex-col gap-3 rounded-2xl bg-telon p-5 lg:col-span-4 lg:self-start">
        <h2 className="text-lg font-bold">Venta en taquilla</h2>
        <p className="text-sm text-texto-2">{chosen.length ? chosen.map((s) => s.seat_label).join(", ") : "Toca los asientos en el mapa."}</p>
        <p className="text-2xl font-black">{formatMoney(total)}</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre del comprador *<input className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono *<input className={input} type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de vendedor (opcional)<input className={input} value={vendedor} onChange={(e) => setVendedor(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Cómo pagó
          <select className={input} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS_PAGO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {result && !result.ok && <p role="alert" className="text-sm font-semibold text-[#ff8fa3]">{result.message}</p>}
        <button
          type="button"
          disabled={pending || !chosen.length}
          onClick={() => {
            if (!window.confirm(`¿Registrar la venta de ${chosen.length} boleto(s) por ${formatMoney(total)}? Confirma que ya cobraste.`)) return;
            start(async () => {
              const r = await boxOfficeSale({ pid, performanceId, seatIds: [...selected], nombre, telefono, vendedor, metodo });
              setResult(r);
              if (!r.ok) router.refresh();
            });
          }}
          className="boton-compra rounded-full py-3.5 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-50"
        >
          {pending ? "Registrando…" : "Registrar venta"}
        </button>
        <p className="text-xs text-texto-3">El precio final lo calcula el sistema. La venta queda aprobada al momento.</p>
      </aside>
    </div>
  );
}
