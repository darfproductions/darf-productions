"use client";

import type { BeneficioCorto } from "@/lib/beneficios-rules";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorZona, textoSobre } from "@/lib/seatmap-rules";
import { clampSeat, formatMoney, groupSeatsByRow, seatSize, ZONE_COLORS, type MapSeat } from "@/lib/tickets";
import type { Forma } from "@/lib/mapa-libre";
import { MapaPlano } from "@/components/MapaPlano";

export type ZonePrice = { categoryId: string; price: number; nombre: string; color?: string | null; orden?: number; /** 0118: precio sin la promo (se muestra tachado). */ antes?: number;
  /** 0122: lo que incluye la zona. */ beneficios?: BeneficioCorto[] };

// Mapa de asientos (mismo dibujo para la compra en línea y la taquilla del panel).
// Solo pinta; quién puede comprar y qué está ocupado lo decide la base.
export function SeatMap({
  seats,
  prices,
  taken,
  selected,
  onToggle,
  formas = [],
  sinPrecios = false,
}: {
  /** 0120: la obra no muestra precios al apartar (solo el nombre de la zona). */
  sinPrecios?: boolean;
  /** 0113: escenario del mapa libre (si los asientos tienen posición). */
  formas?: Forma[];
  seats: MapSeat[];
  prices: ZonePrice[];
  taken: Set<string>;
  selected: Set<string>;
  onToggle: (s: MapSeat) => void;
}) {
  const priceByCat = useMemo(() => new Map(prices.map((p) => [p.categoryId, p])), [prices]);
  const precioDe = (z: ZonePrice) => (sinPrecios ? "" : `, ${formatMoney(z.price)}`);
  const colorByCat = useMemo(() => new Map([...prices].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p, i) => [p.categoryId, colorZona(p, i, ZONE_COLORS)])), [prices]);
  const rows = useMemo(() => groupSeatsByRow(seats), [seats]);
  // Zoom (Fase 4B): "Ajustar" calcula el tamaño para que quepa a lo ancho; + y − o dos dedos lo cambian.
  const box = useRef<HTMLDivElement>(null);
  const cols = useMemo(() => Math.max(1, ...rows.map((r) => r.blocks.reduce((n, b) => n + b.length, 0) + r.blocks.length * 2 + 2)), [rows]);
  const [fit, setFit] = useState(24);
  const [zoom, setZoom] = useState<number | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFit(seatSize(e.contentRect.width, cols)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols]);
  const size = zoom ?? fit;
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const libre = seats.some((s) => s.pos_x != null);
  const leyenda = (
    <ul className="flex flex-wrap gap-2 text-sm">
      {prices.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || b.price - a.price).map((z) => (
        <li key={z.categoryId} className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: colorByCat.get(z.categoryId) }} />
          {z.nombre}{!sinPrecios && <> · {z.antes != null && <s className="opacity-60">{formatMoney(z.antes).replace(" MXN", "")}</s>} {formatMoney(z.price).replace(" MXN", "")}</>}
        </li>
      ))}
      <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#3a3446]" /> Ocupado</li>
      <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-white" /> Selección</li>
    </ul>
  );
  // 0113: mapa libre (escenario redondo, pasarela, 360°…): cada asiento en su lugar.
  if (libre) {
    const porId = new Map(seats.map((s) => [s.id, s]));
    return (
      <>
        {leyenda}
        <MapaPlano formas={formas} onToggle={(id) => { const s = porId.get(id); if (s) onToggle(s); }}
          asientos={seats.filter((s) => s.pos_x != null).map((s) => {
            const zone = priceByCat.get(s.price_category_id ?? "");
            const isTaken = taken.has(s.id) || !zone;
            const isSel = selected.has(s.id);
            const color = zone ? colorByCat.get(zone.categoryId) ?? "#888" : "#888";
            return {
              id: s.id, x: s.pos_x!, y: s.pos_y ?? 0, numero: s.seat_number, etiqueta: s.seat_label, fila: s.seat_row, grupo: s.section ?? undefined, deshabilitado: isTaken, marcado: isSel,
              fondo: isSel ? "#ffffff" : isTaken ? "#3a3446" : color, texto: isSel ? "#0b0910" : isTaken ? "#6e6878" : textoSobre(color),
              titulo: `Asiento ${s.seat_label}${zone ? `, ${zone.nombre}${precioDe(zone)}` : ""}${isTaken ? ", ocupado" : ""}`,
            };
          })} />
      </>
    );
  }
  return (
    <>
      <ul className="flex flex-wrap gap-2 text-sm">
        {prices.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || b.price - a.price).map((z) => (
          <li key={z.categoryId} className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: colorByCat.get(z.categoryId) }} />
            {z.nombre}{!sinPrecios && <> · {z.antes != null && <s className="opacity-60">{formatMoney(z.antes).replace(" MXN", "")}</s>} {formatMoney(z.price).replace(" MXN", "")}</>}
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#3a3446]" /> Ocupado</li>
        <li className="flex items-center gap-2 rounded-full bg-telon px-3 py-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-white" /> Selección</li>
      </ul>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-texto-3">Zoom</span>
        <button type="button" aria-label="Alejar" onClick={() => setZoom(clampSeat(size - 4))} className="h-9 w-9 rounded-full border border-white/25 font-bold">−</button>
        <button type="button" aria-label="Acercar" onClick={() => setZoom(clampSeat(size + 4))} className="h-9 w-9 rounded-full border border-white/25 font-bold">+</button>
        <button type="button" onClick={() => setZoom(null)} className="rounded-full border border-white/25 px-3 py-1.5 font-semibold">Ajustar</button>
        <span className="hidden text-xs text-texto-3 sm:inline">o usa dos dedos en el mapa</span>
      </div>

      <div
        ref={box}
        className="max-h-[70vh] overflow-auto rounded-2xl bg-telon p-4"
        style={{ touchAction: "pan-x pan-y" }}
        onTouchStart={(e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), s: size }; }}
        onTouchMove={(e) => { if (e.touches.length === 2 && pinch.current) setZoom(clampSeat(pinch.current.s * (dist(e.touches) / pinch.current.d))); }}
        onTouchEnd={() => { pinch.current = null; }}
      >
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
                        aria-label={`Asiento ${s.seat_label}${zone ? `, ${zone.nombre}${precioDe(zone)}` : ""}${isTaken ? ", ocupado" : ""}`}
                        title={s.seat_label}
                        className="flex items-center justify-center rounded font-bold disabled:cursor-not-allowed"
                        style={{
                          width: size,
                          height: size,
                          fontSize: Math.max(7, Math.round(size * 0.38)),
                          background: isSel ? "#ffffff" : isTaken ? "#3a3446" : colorByCat.get(zone!.categoryId),
                          color: isSel ? "#0b0910" : isTaken ? "#6e6878" : textoSobre(colorByCat.get(zone!.categoryId)),
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

