"use client";

import { useMemo, useState, useTransition } from "react";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, Notice, input } from "@/components/panel/ui";
import {
  colorZona, generarAsientos, LADO_CORTO, LADOS, MAX_ASIENTOS, resumen, SPEC_INICIAL, validarSpec,
  type Lado, type MapSpec,
} from "@/lib/seatmap-rules";
import { groupSeatsByRow, ZONE_COLORS } from "@/lib/tickets";
import { copySeatMap, generateSeatMap, saveSeatZone, updateSeats, type SeatMapResult } from "../actions";
import { MapaPlano } from "@/components/MapaPlano";
import type { Diseno } from "@/lib/mapa-libre";
import { MapaEditor } from "./MapaEditor";

export type BuilderSeat = {
  id: string;
  seat_label: string;
  seat_row: string | null;
  seat_number: number | null;
  lado: string | null;
  price_category_id: string | null;
  is_active: boolean;
  /** 0113: mapa libre. */
  pos_x?: number | null;
  pos_y?: number | null;
  section?: string | null;
};
type Zona = { id: string; nombre: string; color: string | null; descripcion: string | null };

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-50";
const solid = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-50";
const SIZE = 22;

// Dibujo del mapa para el panel: zonas por color, asientos quitados en línea punteada, selección en blanco.
function SeatGrid({ seats, colorOf, selected, onToggle, onRow }: {
  seats: BuilderSeat[];
  colorOf: (zona: string | null) => string;
  selected?: Set<string>;
  onToggle?: (s: BuilderSeat) => void;
  onRow?: (row: string) => void;
}) {
  const rows = useMemo(() => groupSeatsByRow(seats) as unknown as { row: string; blocks: BuilderSeat[][] }[], [seats]);
  return (
    <div className="max-h-[60vh] overflow-auto rounded-2xl bg-sala p-4">
      <div className="mx-auto flex w-max flex-col items-center gap-1">
        <div className="mb-2 w-full rounded-md bg-telon-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-texto-3">Escenario</div>
        {rows.map(({ row, blocks }) => (
          <div key={row} className="flex items-center gap-3">
            {onRow ? (
              <button type="button" onClick={() => onRow(row)} title={`Seleccionar fila ${row}`} className="w-6 text-center text-xs font-bold text-violeta-claro">{row}</button>
            ) : <span className="w-6 text-center text-xs font-bold text-texto-3">{row}</span>}
            {blocks.map((block, bi) => (
              <div key={bi} className="flex gap-0.5">
                {block.map((s) => {
                  const sel = selected?.has(s.id);
                  const color = colorOf(s.price_category_id);
                  const style = sel
                    ? { background: "#ffffff", color: "#0b0910" }
                    : s.is_active ? { background: color, color: "#ffffff" } : { background: "transparent", color: "#6e6878", border: `1px dashed ${color}` };
                  return onToggle ? (
                    <button key={s.id} type="button" onClick={() => onToggle(s)} aria-pressed={sel} title={`${s.seat_label}${s.is_active ? "" : " (quitado)"}`}
                      className="flex items-center justify-center rounded text-[9px] font-bold" style={{ width: SIZE, height: SIZE, ...style }}>{s.seat_number}</button>
                  ) : (
                    <span key={s.id} title={s.seat_label} className="flex items-center justify-center rounded text-[9px] font-bold" style={{ width: SIZE, height: SIZE, ...style }}>{s.seat_number}</span>
                  );
                })}
              </div>
            ))}
            <span className="w-6 text-center text-xs font-bold text-texto-3">{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function num(v: string, min = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min;
}

export function SeatMapBuilder({ pid, seats, zonas, conBoletos, obras, diseno }: {
  pid: string;
  diseno: Diseno | null;
  seats: BuilderSeat[];
  zonas: Zona[];
  conBoletos: boolean;
  obras: { id: string; nombre: string }[];
}) {
  const colores = useMemo(() => new Map([...zonas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((z, i) => [z.id, colorZona(z, i, ZONE_COLORS)])), [zonas]);
  const colorOf = (z: string | null) => (z && colores.get(z)) || "#888888";
  const nombreZona = new Map(zonas.map((z) => [z.id, z.nombre]));

  // ──── Ajustar ────
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [zonaNueva, setZonaNueva] = useState("");
  const [msg, setMsg] = useState<SeatMapResult | null>(null);
  const [pending, start] = useTransition();
  const toggle = (s: BuilderSeat) => setSel((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; });
  const toggleRow = (row: string) => setSel((prev) => {
    const ids = seats.filter((s) => s.seat_row === row).map((s) => s.id);
    const all = ids.every((id) => prev.has(id));
    const n = new Set(prev);
    for (const id of ids) if (all) n.delete(id); else n.add(id);
    return n;
  });
  const ajustar = (accion: "quitar" | "poner" | "zona") => {
    if (!sel.size) return;
    if (accion === "zona" && !zonaNueva) { setMsg({ ok: false, message: "Elige la zona nueva." }); return; }
    start(async () => {
      const r = await updateSeats(pid, [...sel], accion, zonaNueva);
      setMsg(r);
      if (r.ok) setSel(new Set());
    });
  };
  const activos = seats.filter((s) => s.is_active).length;
  // 0113: mapa libre (con posición) y sus bloques para seleccionar completos.
  const libre = seats.some((s) => s.pos_x != null);
  const secciones = [...new Set(seats.map((s) => s.section).filter((x): x is string => !!x))];
  const toggleSeccion = (sec: string) => setSel((prev) => {
    const ids = seats.filter((s) => s.section === sec).map((s) => s.id);
    const all = ids.every((id) => prev.has(id));
    const n = new Set(prev);
    for (const id of ids) if (all) n.delete(id); else n.add(id);
    return n;
  });

  // ──── Generar ────
  const [spec, setSpec] = useState<MapSpec>(() => ({ ...SPEC_INICIAL, zonas: zonas[0] ? [{ zona: zonas[0].id, desde: 1, hasta: SPEC_INICIAL.cuantas }] : [] }));
  const errores = validarSpec(spec);
  const nuevos = useMemo(() => (validarSpec(spec).length ? [] : generarAsientos(spec)), [spec]);
  const previa: BuilderSeat[] = useMemo(() => nuevos.map((a, i) => ({ id: `n${i}`, seat_label: a.etiqueta, seat_row: a.fila, seat_number: a.numero, lado: a.lado, price_category_id: a.zona, is_active: true })), [nuevos]);
  const res = resumen(nuevos);
  const demasiados = nuevos.length > MAX_ASIENTOS;
  const [genMsg, setGenMsg] = useState<SeatMapResult | null>(null);
  const guardar = () => {
    if (seats.length && !window.confirm(`Esto reemplaza el mapa actual (${seats.length} asientos) por uno nuevo de ${nuevos.length}. ¿Seguir?`)) return;
    start(async () => { setGenMsg(await generateSeatMap(pid, nuevos)); setSel(new Set()); });
  };
  const setBloque = (l: Lado, v: string) => setSpec((s) => ({ ...s, bloques: { ...s.bloques, [l]: num(v) } }));
  const setRango = (i: number, k: "zona" | "desde" | "hasta", v: string) =>
    setSpec((s) => ({ ...s, zonas: s.zonas.map((z, j) => (j === i ? { ...z, [k]: k === "zona" ? v : num(v, 1) } : z)) }));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">Mapa de asientos</h2>
        <p className="text-sm text-texto-2">
          {seats.length
            ? `Esta obra tiene ${seats.length} asientos (${activos} a la venta${seats.length - activos ? `, ${seats.length - activos} quitados` : ""}). La compra en línea, la taquilla y la puerta usan este mapa.`
            : "Esta obra aún no tiene mapa. Créalo abajo por filas, o cópialo de otra obra; luego ajusta asiento por asiento."}
        </p>
        {conBoletos && <Notice ok>Ya hay boletos vendidos con asiento: el mapa ya no se puede regenerar ni copiar, solo ajustar asiento por asiento. Los asientos vendidos para funciones próximas no se pueden quitar.</Notice>}
      </Card>

      {/* Zonas con asiento */}
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Zonas</h2>
          <p className="text-sm text-texto-2">Cada asiento pertenece a una zona de precio (ej. VIP, Preferente). El precio se pone en cada función, en Funciones y precios.</p>
        </div>
        {zonas.map((z) => (
          <ActionForm key={z.id} inline action={saveSeatZone} hidden={{ pid, zid: z.id }} submit="Guardar" submitClass={ghost}>
            <input type="color" name="color" defaultValue={colorOf(z.id)} aria-label={`Color de ${z.nombre}`} className="h-10 w-12 rounded bg-transparent" />
            <input className={`${input} w-48`} name="nombre" defaultValue={z.nombre} aria-label="Nombre de la zona" required />
            <span className="text-xs text-texto-3">{seats.filter((s) => s.price_category_id === z.id).length} asientos</span>
          </ActionForm>
        ))}
        <ActionForm inline action={saveSeatZone} hidden={{ pid }} submit="Crear zona" submitClass={solid}>
          <input type="color" name="color" defaultValue={colorZona({ nombre: "" }, zonas.length)} aria-label="Color de la zona nueva" className="h-10 w-12 rounded bg-transparent" />
          <input className={`${input} w-48`} name="nombre" placeholder="Nombre (ej. VIP)" aria-label="Nombre de la zona nueva" required />
        </ActionForm>
      </Card>

      {/* Ajustar */}
      {seats.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Ajustar asiento por asiento</h2>
            <p className="text-sm text-texto-2">Toca asientos para seleccionarlos (toca la letra de la fila para seleccionarla completa). Los quitados se ven punteados y no se venden; puedes volver a ponerlos.</p>
          </div>
          {libre ? (
            <>
              {secciones.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-texto-3">Seleccionar bloque completo:</span>
                  {secciones.map((s) => <button key={s} type="button" onClick={() => toggleSeccion(s)} className="rounded-full border border-white/25 px-3 py-1 font-bold">{s}</button>)}
                </div>
              )}
              <MapaPlano formas={diseno?.formas ?? []} alto="60vh" onToggle={(id) => { const s = seats.find((x) => x.id === id); if (s) toggle(s); }}
                asientos={seats.filter((s) => s.pos_x != null).map((s) => {
                  const marcado = sel.has(s.id), color = colorOf(s.price_category_id);
                  return {
                    id: s.id, x: s.pos_x!, y: s.pos_y ?? 0, numero: s.seat_number, etiqueta: s.seat_label, marcado,
                    fondo: marcado ? "#ffffff" : s.is_active ? color : "transparent", texto: marcado ? "#0b0910" : s.is_active ? "#ffffff" : "#6e6878",
                    borde: !s.is_active && !marcado ? color : undefined, titulo: `${s.seat_label}${s.section ? ` · ${s.section}` : ""}${s.is_active ? "" : " (quitado)"}`,
                  };
                })} />
            </>
          ) : <SeatGrid seats={seats} colorOf={colorOf} selected={sel} onToggle={toggle} onRow={toggleRow} />}
          <ul className="flex flex-wrap gap-2 text-xs">
            {zonas.map((z) => (
              <li key={z.id} className="flex items-center gap-1.5 rounded-full bg-sala px-2.5 py-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(z.id) }} />{z.nombre}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{sel.size} seleccionados</span>
            <button type="button" disabled={!sel.size || pending} onClick={() => ajustar("quitar")} className={ghost}>Quitar</button>
            <button type="button" disabled={!sel.size || pending} onClick={() => ajustar("poner")} className={ghost}>Volver a poner</button>
            <select className={`${input} py-2 text-sm`} value={zonaNueva} onChange={(e) => setZonaNueva(e.target.value)} aria-label="Zona nueva">
              <option value="">Cambiar a zona…</option>
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <button type="button" disabled={!sel.size || pending} onClick={() => ajustar("zona")} className={ghost}>Cambiar zona</button>
            {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="text-sm font-bold text-violeta-claro">Limpiar selección</button>}
          </div>
          {msg && <Notice ok={msg.ok}>{msg.message}</Notice>}
        </Card>
      )}

      {/* 0113: diseñar el mapa libre */}
      <MapaEditor pid={pid} inicial={diseno} zonas={zonas} colorOf={colorOf} asientosActuales={seats.length} conBoletos={conBoletos} />

      {/* Generar */}
      {!conBoletos && (
        <Card className="flex flex-col gap-4">
          <details open={!libre && seats.length > 0 && !diseno} className="flex flex-col gap-4">
          <summary className="cursor-pointer font-bold">Otra forma: crear por filas (teatro clásico, sin dibujo)</summary>
          <div>
            <h2 className="titular text-xl">{seats.length ? "Generar un mapa nuevo" : "Crear el mapa"}</h2>
            <p className="text-sm text-texto-2">Describe el teatro por filas: cuántas filas, cuántos asientos tiene cada bloque (izquierda, centro, derecha) y qué zona va en cada rango de filas. La fila A es la más cercana al escenario. Ves el resultado abajo antes de guardar.</p>
          </div>
          {zonas.length === 0 ? (
            <Notice>Primero crea al menos una zona (arriba).</Notice>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Filas
                  <input className={input} type="number" min={1} max={60} value={spec.cuantas} onChange={(e) => setSpec((s) => ({ ...s, cuantas: num(e.target.value, 1) }))} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre de las filas
                  <select className={input} value={spec.filas} onChange={(e) => setSpec((s) => ({ ...s, filas: e.target.value as MapSpec["filas"] }))}>
                    <option value="letras">Letras (A, B, C…)</option>
                    <option value="numeros">Números (1, 2, 3…)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Numeración
                  <select className={input} value={spec.numeracion} onChange={(e) => setSpec((s) => ({ ...s, numeracion: e.target.value as MapSpec["numeracion"] }))}>
                    <option value="continua">Seguida en toda la fila</option>
                    <option value="bloque">Cada bloque empieza en 1</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Asientos que crece cada fila
                  <input className={input} type="number" min={0} max={10} value={spec.crece} onChange={(e) => setSpec((s) => ({ ...s, crece: num(e.target.value) }))} />
                </label>
              </div>
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-1 text-sm font-semibold">Asientos por bloque en la primera fila (0 = sin ese bloque)</legend>
                {LADOS.map((l) => (
                  <label key={l} className="flex flex-col gap-1.5 text-sm">{LADO_CORTO[l]}
                    <input className={input} type="number" min={0} max={80} value={spec.bloques[l]} onChange={(e) => setBloque(l, e.target.value)} />
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">Zona por filas (fila 1 = la más cercana al escenario)</legend>
                {spec.zonas.map((z, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <select className={`${input} py-2`} value={z.zona} onChange={(e) => setRango(i, "zona", e.target.value)} aria-label="Zona">
                      {zonas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                    de la fila <input className={`${input} w-20 py-2`} type="number" min={1} value={z.desde} onChange={(e) => setRango(i, "desde", e.target.value)} aria-label="Desde la fila" />
                    a la <input className={`${input} w-20 py-2`} type="number" min={1} value={z.hasta} onChange={(e) => setRango(i, "hasta", e.target.value)} aria-label="Hasta la fila" />
                    {spec.zonas.length > 1 && <button type="button" onClick={() => setSpec((s) => ({ ...s, zonas: s.zonas.filter((_, j) => j !== i) }))} className="text-xs font-bold text-violeta-claro">Quitar</button>}
                  </div>
                ))}
                <button type="button" onClick={() => setSpec((s) => ({ ...s, zonas: [...s.zonas, { zona: zonas[0].id, desde: (s.zonas.at(-1)?.hasta ?? 0) + 1, hasta: s.cuantas }] }))} className="self-start text-sm font-bold text-violeta-claro">+ Otra zona</button>
              </fieldset>

              {errores.length > 0 && <Notice>{errores.join(" ")}</Notice>}
              {demasiados && <Notice>Son {nuevos.length} asientos: el máximo es {MAX_ASIENTOS}.</Notice>}
              {nuevos.length > 0 && (
                <>
                  <p className="text-sm text-texto-2">
                    Vista previa: <b>{res.asientos} asientos</b> en {res.filas} filas
                    {[...res.porZona.entries()].map(([z, n]) => ` · ${nombreZona.get(z) ?? "?"}: ${n}`).join("")}
                  </p>
                  <SeatGrid seats={previa} colorOf={colorOf} />
                </>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={pending || errores.length > 0 || demasiados || !nuevos.length} onClick={guardar} className={solid}>
                  {pending ? "Un momento…" : seats.length ? "Reemplazar el mapa" : "Guardar mapa"}
                </button>
                {genMsg && <Notice ok={genMsg.ok}>{genMsg.message}</Notice>}
              </div>
            </>
          )}
          </details>
        </Card>
      )}

      {/* Copiar */}
      {!conBoletos && obras.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Copiar el mapa de otra obra</h2>
            <p className="text-sm text-texto-2">Útil si es el mismo teatro. Se copian los asientos y las zonas (por nombre); los precios se ponen en cada función.{seats.length ? " Reemplaza el mapa actual." : ""}</p>
          </div>
          <ActionForm inline action={copySeatMap} hidden={{ pid }} submit="Copiar mapa" submitClass={ghost}
            confirm={seats.length ? `Esto reemplaza el mapa actual (${seats.length} asientos). ¿Seguir?` : undefined}>
            <select className={`${input} py-2`} name="origen" defaultValue="" required aria-label="Obra de origen">
              <option value="" disabled>Elige la obra…</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
