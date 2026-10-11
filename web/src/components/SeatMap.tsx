"use client";

import { useMemo } from "react";
import { formatMoney, groupSeatsByRow, ZONE_COLORS, type MapSeat } from "@/lib/tickets";

export type ZonePrice = { categoryId: string; price: number; nombre: string };

// Mapa de asientos (mismo dibujo para la compra en línea y la taquilla del panel).
// Solo pinta; quién puede comprar y qué está ocupado lo decide la base.
export function SeatMap({
  seats,
  prices,
  taken,
  selected,
  onToggle,
}: {
  seats: MapSeat[];
  prices: ZonePrice[];
  taken: Set<string>;
  selected: Set<string>;
  onToggle: (s: MapSeat) => void;
}) {
  const priceByCat = useMemo(() => new Map(prices.map((p) => [p.categoryId, p])), [prices]);
  const rows = useMemo(() => groupSeatsByRow(seats), [seats]);
  return (
    <>
      <ul className="flex flex-wrap gap-2 text-sm">
        {prices.slice().sort((a, b) => b.price - a.price).map((z) => (
          <li key={z.categoryId} className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: ZONE_COLORS[z.nombre] ?? "#888" }} />
            {z.nombre} · {formatMoney(z.price).replace(" MXN", "")}
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#3a3446]" /> Ocupado</li>
        <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-white" /> Selección</li>
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
                        onClick={() => onToggle(s)}
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
    </>
  );
}
