"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icono } from "@/components/Icono";
import { input } from "@/components/panel/ui";
import { preciosDistintos } from "@/lib/zona-precio-rules";
import { borrarZona, moverZona, precioZona } from "./actions";

const chico = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-40";

// 0117: en cada zona — subir/bajar, precio para todas las funciones y borrar (pasando sus asientos a otra zona).
// 2026-10-26: el precio se guarda con su propio botón "Guardar precio" (el "Guardar" de la zona es solo nombre y color),
// y si hay funciones con otro precio se avisa y por omisión también cambian.
export function ZonaAcciones({ pid, zona, primera, ultima, asientos, otras, actuales = [] }: {
  pid: string;
  zona: { id: string; nombre: string; precio_base?: number | null };
  primera: boolean; ultima: boolean; asientos: number;
  otras: { id: string; nombre: string }[];
  /** Precio de esta zona en cada función que aún no pasa. */
  actuales?: number[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [precio, setPrecio] = useState(zona.precio_base != null ? String(Number(zona.precio_base)) : "");
  const [destino, setDestino] = useState(otras[0]?.id ?? "");
  const [borrando, setBorrando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [tambien, setTambien] = useState(true);
  const valido = precio !== "" && Number(precio) >= 0;
  const distintos = valido ? preciosDistintos(Number(precio), actuales) : { n: 0, precios: [] };
  const cambio = valido && (zona.precio_base == null || Number(precio) !== Number(zona.precio_base) || distintos.n > 0);
  const correr = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const r = await fn();
    setMsg(r.message ? { ok: r.ok, t: r.message } : null);
    if (r.ok) router.refresh();
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={pending || primera} onClick={() => correr(() => moverZona(pid, zona.id, true))} className={chico} aria-label={`Subir ${zona.nombre}`}><Icono nombre="flecha-arriba" /></button>
        <button type="button" disabled={pending || ultima} onClick={() => correr(() => moverZona(pid, zona.id, false))} className={chico} aria-label={`Bajar ${zona.nombre}`}><Icono nombre="flecha-abajo" /></button>
        <label className="flex items-center gap-1 text-xs font-semibold">Precio $
          <input className={`${input} w-24 py-1`} type="number" min={0} step="1" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} aria-label={`Precio de ${zona.nombre}`} />
        </label>
        <button type="button" disabled={pending || !valido}
          onClick={() => correr(() => precioZona(pid, zona.id, Number(precio), tambien && distintos.n > 0))}
          className={cambio ? "rounded-full bg-texto px-3 py-1 text-xs font-bold text-sala disabled:opacity-40" : chico}>{pending ? "Guardando…" : "Guardar precio"}</button>
        {!borrando
          ? <button type="button" disabled={pending} onClick={() => setBorrando(true)} className={`${chico} text-[#ff8fa3]`}>Borrar</button>
          : (
            <span className="flex flex-wrap items-center gap-1.5 rounded-full bg-[#5a1a22]/60 px-2 py-1 text-xs">
              {asientos > 0 && (otras.length ? (
                <label className="flex items-center gap-1">Pasar sus {asientos} asientos a
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} className={`${input} py-0.5 text-xs`}>
                    {otras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                </label>
              ) : <span>Crea otra zona para pasarle sus {asientos} asientos.</span>)}
              <button type="button" disabled={pending || (asientos > 0 && !destino)}
                onClick={() => correr(() => borrarZona(pid, zona.id, asientos > 0 ? destino : null))}
                className="rounded-full bg-[#be123c] px-3 py-1 font-bold text-white disabled:opacity-40">Borrar {zona.nombre}</button>
              <button type="button" onClick={() => setBorrando(false)} className="underline">Cancelar</button>
            </span>
          )}
      </div>
      {valido && distintos.n > 0 && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={tambien} onChange={(e) => setTambien(e.target.checked)} />
          En {distintos.n === 1 ? "1 función" : `${distintos.n} funciones`} esta zona cuesta {distintos.precios.map((p) => `$${p}`).join(" o ")}: cambiarlas también a ${precio}
        </label>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-[#bbf7d0]" : "text-[#ff8fa3]"}`}>{msg.t}</p>}
    </div>
  );
}
