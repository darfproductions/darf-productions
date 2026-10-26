"use client";

import { useMemo, useRef, useState } from "react";
import type { Forma } from "@/lib/mapa-libre";
import { etiquetasFila } from "@/lib/mapa-filas";

/** Letras de fila (en lib/mapa-filas.ts para que también las usen las imágenes del servidor). */
export { etiquetasFila };

// Dibujo de un mapa libre (0113): el escenario y los asientos en su posición. Lo usan la compra, la taquilla y el
// panel. Solo pinta; quién puede comprar lo decide la base.

export type AsientoPlano = {
  id: string; x: number; y: number; numero: number | null; etiqueta: string;
  fondo: string; texto: string; borde?: string; deshabilitado?: boolean; marcado?: boolean; titulo?: string;
  /** Letra de la fila: se escribe en las puntas de cada fila. */
  fila?: string | null;
  /** Bloque al que pertenece (las letras van en las puntas de cada bloque). */
  grupo?: string;
};

const R = 9;

export function encuadrePlano(formas: Forma[], asientos: { x: number; y: number }[]) {
  const xs: number[] = [], ys: number[] = [];
  for (const a of asientos) { xs.push(a.x); ys.push(a.y); }
  for (const f of formas) { const r = Math.hypot(f.ancho, f.alto) / 2; xs.push(f.x - r, f.x + r); ys.push(f.y - r, f.y + r); }
  if (!xs.length) return { x: 0, y: 0, w: 1000, h: 800 };
  const m = 30, x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  return { x: x0, y: y0, w: Math.max(...xs) + m - x0, h: Math.max(...ys) + m - y0 };
}

export function FormaSvg({ f, activa, onPointerDown }: { f: Forma; activa?: boolean; onPointerDown?: (e: React.PointerEvent) => void }) {
  const props = { fill: "#2a2436", stroke: activa ? "#ffffff" : "#5b5470", strokeWidth: activa ? 3 : 1.5 };
  return (
    <g transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`} onPointerDown={onPointerDown} style={onPointerDown ? { cursor: "move" } : undefined}>
      {f.tipo === "elipse"
        ? <ellipse rx={f.ancho / 2} ry={f.alto / 2} {...props} />
        : <rect x={-f.ancho / 2} y={-f.alto / 2} width={f.ancho} height={f.alto} rx={6} {...props} />}
      <text textAnchor="middle" dominantBaseline="central" fill="#a39cb3" fontSize={Math.min(16, Math.max(9, Math.min(f.ancho, f.alto) / 4))} fontWeight={700}
        letterSpacing={3} transform={f.alto > f.ancho * 1.6 ? "rotate(-90)" : undefined} style={{ pointerEvents: "none", textTransform: "uppercase" }}>{f.etiqueta}</text>
    </g>
  );
}

/** Mapa para comprar o ajustar: zoom con botones y asientos que se tocan. */
export function MapaPlano({ formas, asientos, onToggle, alto = "70vh" }: {
  formas: Forma[]; asientos: AsientoPlano[]; onToggle?: (id: string) => void; alto?: string;
}) {
  const caja = useMemo(() => encuadrePlano(formas, asientos), [formas, asientos]);
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const z = (v: number) => Math.min(5, Math.max(1, Math.round(v * 10) / 10));
  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-texto-3">Zoom</span>
        <button type="button" aria-label="Alejar" onClick={() => setZoom((v) => z(v - 0.5))} className="h-9 w-9 rounded-full border border-white/25 font-bold">−</button>
        <button type="button" aria-label="Acercar" onClick={() => setZoom((v) => z(v + 0.5))} className="h-9 w-9 rounded-full border border-white/25 font-bold">+</button>
        <button type="button" onClick={() => setZoom(1)} className="rounded-full border border-white/25 px-3 py-1.5 font-semibold">Ajustar</button>
        <span className="hidden text-xs text-texto-3 sm:inline">o usa dos dedos en el mapa</span>
      </div>
      <div className="overflow-auto rounded-2xl bg-telon p-2" style={{ maxHeight: alto, touchAction: "pan-x pan-y" }}
        onTouchStart={(e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z: zoom }; }}
        onTouchMove={(e) => { if (e.touches.length === 2 && pinch.current) setZoom(z(pinch.current.z * (dist(e.touches) / pinch.current.d))); }}
        onTouchEnd={() => { pinch.current = null; }}>
        <svg viewBox={`${caja.x} ${caja.y} ${caja.w} ${caja.h}`} style={{ width: `${zoom * 100}%`, display: "block" }} role="group" aria-label="Mapa de asientos">
          {formas.map((f) => <FormaSvg key={f.id} f={f} />)}
          {etiquetasFila(asientos).map((e, i) => (
            <text key={`${e.fila}-${i}`} x={e.x} y={e.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill="#a39cb3" style={{ pointerEvents: "none" }} aria-hidden="true">{e.fila}</text>
          ))}
          {asientos.map((a) => {
            const contenido = (
              <>
                <circle cx={a.x} cy={a.y} r={R} fill={a.fondo} stroke={a.borde ?? (a.marcado ? "#ffffff" : "none")} strokeWidth={a.borde ? 1.5 : 2} strokeDasharray={a.borde ? "3 2" : undefined} />
                {a.numero !== null && <text x={a.x} y={a.y} textAnchor="middle" dominantBaseline="central" fontSize={a.numero > 99 ? 6.5 : 8} fontWeight={700} fill={a.texto} style={{ pointerEvents: "none" }}>{a.numero}</text>}
                <title>{a.titulo ?? a.etiqueta}</title>
              </>
            );
            return onToggle ? (
              <g key={a.id} role="button" tabIndex={a.deshabilitado ? -1 : 0} aria-label={a.titulo ?? a.etiqueta} aria-pressed={!!a.marcado} aria-disabled={a.deshabilitado}
                style={{ cursor: a.deshabilitado ? "not-allowed" : "pointer" }}
                onClick={() => { if (!a.deshabilitado) onToggle(a.id); }}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !a.deshabilitado) { e.preventDefault(); onToggle(a.id); } }}>
                {contenido}
              </g>
            ) : <g key={a.id}>{contenido}</g>;
          })}
        </svg>
      </div>
    </>
  );
}
