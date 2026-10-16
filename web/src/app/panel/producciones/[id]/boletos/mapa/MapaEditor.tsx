"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Card, Notice, input } from "@/components/panel/ui";
import { FormaSvg, etiquetasFila } from "@/components/MapaPlano";
import {
  bloqueBase, encimados, encuadre, erroresDiseno, forma, generarLibre, PLANTILLAS, plantilla,
  type Bloque, type Diseno, type Forma, type Plantilla,
} from "@/lib/mapa-libre";
import { disenarMapa, type SeatMapResult } from "../actions";

type Zona = { id: string; nombre: string };
type Sel = { tipo: "bloque" | "forma"; id: string } | null;

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-50";
const solid = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-50";
const lbl = "flex flex-col gap-1 text-xs font-semibold";

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className={lbl}>{label}
      <input className={`${input} py-1.5`} type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n); }} />
    </label>
  );
}

// Diseñador del mapa (0113): plantillas, escenario y bloques que se arrastran, giran y curvean.
// Los asientos salen de los bloques; se guardan con su posición y la numeración no se repite.
export function MapaEditor({ pid, inicial, zonas, colorOf, asientosActuales, conBoletos }: {
  pid: string; inicial: Diseno | null; zonas: Zona[]; colorOf: (zona: string | null) => string; asientosActuales: number; conBoletos: boolean;
}) {
  const [d, setD] = useState<Diseno>(() => inicial ?? plantilla("frontal"));
  const [sel, setSel] = useState<Sel>(() => (inicial ?? d).bloques[0] ? { tipo: "bloque", id: (inicial ?? d).bloques[0].id } : null);
  const asientos = useMemo(() => generarLibre(d), [d]);
  const errores = erroresDiseno(d, asientos);
  const choques = useMemo(() => encimados(asientos), [asientos]);
  const [vista, setVista] = useState(() => encuadre(d, asientos, 60));
  const svg = useRef<SVGSVGElement>(null);
  const arrastre = useRef<{ tipo: "bloque" | "forma"; id: string; dx: number; dy: number } | null>(null);
  const [msg, setMsg] = useState<SeatMapResult | null>(null);
  const [pending, start] = useTransition();

  const bloque = sel?.tipo === "bloque" ? d.bloques.find((b) => b.id === sel.id) ?? null : null;
  const fig = sel?.tipo === "forma" ? d.formas.find((f) => f.id === sel.id) ?? null : null;
  const setBloque = (id: string, cambio: Partial<Bloque>) => setD((x) => ({ ...x, bloques: x.bloques.map((b) => (b.id === id ? { ...b, ...cambio } : b)) }));
  const setForma = (id: string, cambio: Partial<Forma>) => setD((x) => ({ ...x, formas: x.formas.map((f) => (f.id === id ? { ...f, ...cambio } : f)) }));

  const punto = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const empezar = (tipo: "bloque" | "forma", id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSel({ tipo, id });
    const p = punto(e);
    const el = tipo === "bloque" ? d.bloques.find((b) => b.id === id) : d.formas.find((f) => f.id === id);
    if (!el) return;
    arrastre.current = { tipo, id, dx: p.x - el.x, dy: p.y - el.y };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const p = punto(e);
    const x = Math.round(p.x - a.dx), y = Math.round(p.y - a.dy);
    if (a.tipo === "bloque") setBloque(a.id, { x, y }); else setForma(a.id, { x, y });
  };
  const soltar = () => { arrastre.current = null; };

  const usarPlantilla = (p: Plantilla) => {
    if (d.bloques.length && !window.confirm("¿Empezar con esta plantilla? Se reemplaza el diseño que tienes en pantalla (lo guardado no cambia hasta que guardes).")) return;
    const n = plantilla(p);
    setD(n);
    setSel(n.bloques[0] ? { tipo: "bloque", id: n.bloques[0].id } : null);
    setVista(encuadre(n, generarLibre(n), 60));
  };
  const agregar = (tipo: "recto" | "arco" | "rect" | "elipse") => {
    const cx = Math.round(vista.x + vista.w / 2), cy = Math.round(vista.y + vista.h / 2);
    if (tipo === "recto" || tipo === "arco") {
      // La numeración automática sigue después de los bloques anteriores: no se repiten asientos.
      const b = bloqueBase(tipo === "arco"
        ? { nombre: `Bloque ${d.bloques.length + 1}`, forma: "arco", x: cx, y: cy, filas: 4, asientos: 10, crece: 1 }
        : { nombre: `Bloque ${d.bloques.length + 1}`, x: cx, y: cy, filas: 4, asientos: 8 });
      setD((x) => ({ ...x, bloques: [...x.bloques, b] }));
      setSel({ tipo: "bloque", id: b.id });
    } else {
      const f = forma({ tipo, etiqueta: tipo === "elipse" ? "Escenario" : "Pasarela", x: cx, y: cy, ancho: tipo === "elipse" ? 200 : 60, alto: tipo === "elipse" ? 200 : 260 });
      setD((x) => ({ ...x, formas: [...x.formas, f] }));
      setSel({ tipo: "forma", id: f.id });
    }
  };
  const duplicar = () => {
    if (bloque) {
      const b = { ...bloque, id: bloqueBase().id, nombre: `${bloque.nombre} (copia)`, x: bloque.x + 40, y: bloque.y + 40, numInicial: null };
      setD((x) => ({ ...x, bloques: [...x.bloques, b] }));
      setSel({ tipo: "bloque", id: b.id });
    } else if (fig) {
      const f = { ...fig, id: forma({}).id, x: fig.x + 40, y: fig.y + 40 };
      setD((x) => ({ ...x, formas: [...x.formas, f] }));
      setSel({ tipo: "forma", id: f.id });
    }
  };
  const borrar = () => {
    if (bloque) setD((x) => ({ ...x, bloques: x.bloques.filter((b) => b.id !== bloque.id) }));
    if (fig) setD((x) => ({ ...x, formas: x.formas.filter((f) => f.id !== fig.id) }));
    setSel(null);
  };
  const guardar = () => {
    if (errores.length) return;
    if (asientosActuales && !window.confirm(`Esto reemplaza el mapa actual (${asientosActuales} asientos) por uno nuevo de ${asientos.length}. ¿Seguir?`)) return;
    start(async () => {
      setMsg(await disenarMapa(pid, d, asientos.map((a) => ({ fila: a.fila, numero: a.numero, etiqueta: a.etiqueta, x: a.x, y: a.y, zona: a.zona, seccion: a.seccion }))));
    });
  };
  const porBloque = new Map<string, number>();
  for (const a of asientos) porBloque.set(a.bloque, (porBloque.get(a.bloque) ?? 0) + 1);
  const primeros = new Map<string, string>();
  for (const a of asientos) if (!primeros.has(a.bloque)) primeros.set(a.bloque, a.etiqueta);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="titular text-xl">Diseñar el mapa</h2>
        <p className="text-sm text-texto-2">Arma el teatro como es: empieza con una plantilla y mueve los bloques y el escenario con el mouse o el dedo. Gira, curvea y cambia filas y asientos en el panel. Los pasillos son el espacio entre bloques. La numeración (fila + número) sigue de un bloque a otro y nunca se repite. Después de guardar, acomoda las zonas y sus precios.</p>
      </div>
      {conBoletos && <Notice>Ya hay boletos vendidos con asiento: el mapa ya no se puede reemplazar, solo ajustar asiento por asiento (abajo).</Notice>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-3">Empezar con:</span>
        {PLANTILLAS.map((p) => <button key={p.id} type="button" title={p.ayuda} onClick={() => usarPlantilla(p.id)} className={ghost}>{p.label}</button>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => agregar("recto")} className={ghost}>+ Bloque recto</button>
            <button type="button" onClick={() => agregar("arco")} className={ghost}>+ Bloque en arco</button>
            <button type="button" onClick={() => agregar("rect")} className={ghost}>+ Rectángulo (pasarela)</button>
            <button type="button" onClick={() => agregar("elipse")} className={ghost}>+ Redondo</button>
            <button type="button" onClick={() => setVista(encuadre(d, asientos, 60))} className={ghost}>Encuadrar</button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-sala">
            <svg ref={svg} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} className="block h-[60vh] w-full touch-none select-none"
              onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onPointerDown={() => setSel(null)} role="application" aria-label="Lienzo del mapa">
              {d.formas.map((f) => <FormaSvg key={f.id} f={f} activa={fig?.id === f.id} onPointerDown={empezar("forma", f.id)} />)}
              {etiquetasFila(asientos).map((e, i) => (
                <text key={`${e.fila}-${i}`} x={e.x} y={e.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill="#a39cb3" style={{ pointerEvents: "none" }}>{e.fila}</text>
              ))}
              {d.bloques.map((b) => {
                const activo = bloque?.id === b.id;
                const suyos = asientos.filter((a) => a.bloque === b.id);
                return (
                  <g key={b.id} onPointerDown={empezar("bloque", b.id)} style={{ cursor: "move" }}>
                    {suyos.map((a) => <circle key={a.etiqueta} cx={a.x} cy={a.y} r={8} fill={a.zona ? colorOf(a.zona) : "#6e6878"} stroke={activo ? "#ffffff" : "none"} strokeWidth={2} />)}
                    {suyos[0] && <text x={b.forma === "arco" ? suyos[Math.floor(suyos.length / 2)]?.x : b.x} y={(b.forma === "arco" ? suyos[Math.floor(suyos.length / 2)]?.y : b.y) - 14}
                      textAnchor="middle" fontSize={11} fontWeight={700} fill={activo ? "#ffffff" : "#a39cb3"} style={{ pointerEvents: "none" }}>{b.nombre}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-sm text-texto-2"><b className="text-texto">{asientos.length} asientos</b> en {d.bloques.length} {d.bloques.length === 1 ? "bloque" : "bloques"}{choques ? ` · ${choques} asientos encimados (separa los bloques)` : ""}</p>
          {errores.length > 0 && <Notice>{errores.join(" ")}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={guardar} disabled={pending || conBoletos || errores.length > 0} className={solid}>{pending ? "Guardando…" : asientosActuales ? "Reemplazar el mapa" : "Guardar mapa"}</button>
            {msg && <Notice ok={msg.ok}>{msg.message}</Notice>}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-sala p-4 text-sm">
          {bloque ? (
            <>
              <div className="flex items-center justify-between gap-2"><b>Bloque</b><span className="text-xs text-texto-3">{porBloque.get(bloque.id) ?? 0} asientos · empieza en {primeros.get(bloque.id) ?? "—"}</span></div>
              <label className={lbl}>Nombre<input className={`${input} py-1.5`} value={bloque.nombre} maxLength={40} onChange={(e) => setBloque(bloque.id, { nombre: e.target.value })} /></label>
              <label className={lbl}>Forma
                <select className={`${input} py-1.5`} value={bloque.forma} onChange={(e) => setBloque(bloque.id, { forma: e.target.value as Bloque["forma"] })}>
                  <option value="recto">Recto (filas rectas o curvas)</option>
                  <option value="arco">En arco (alrededor de un punto)</option>
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Num label="Filas" value={bloque.filas} min={1} max={60} onChange={(n) => setBloque(bloque.id, { filas: n })} />
                <Num label="Asientos 1a fila" value={bloque.asientos} min={1} max={120} onChange={(n) => setBloque(bloque.id, { asientos: n })} />
                <Num label="Crece por fila" value={bloque.crece} min={-10} max={20} onChange={(n) => setBloque(bloque.id, { crece: n })} />
              </div>
              {bloque.forma === "recto" ? (
                <>
                  <label className={lbl}>Giro: {bloque.rot}°
                    <input type="range" min={-180} max={180} step={1} value={bloque.rot} onChange={(e) => setBloque(bloque.id, { rot: Number(e.target.value) })} />
                  </label>
                  <label className={lbl}>Curva de las filas: {bloque.curva}
                    <input type="range" min={-100} max={100} step={1} value={bloque.curva} onChange={(e) => setBloque(bloque.id, { curva: Number(e.target.value) })} />
                  </label>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <Num label="Radio" value={bloque.radio} min={20} max={2000} onChange={(n) => setBloque(bloque.id, { radio: n })} />
                  <Num label="Desde (°)" value={bloque.desde} min={-360} max={360} onChange={(n) => setBloque(bloque.id, { desde: n })} />
                  <Num label="Hasta (°)" value={bloque.hasta} min={-360} max={360} onChange={(n) => setBloque(bloque.id, { hasta: n })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Num label="Espacio entre asientos" value={bloque.paso} min={16} max={60} onChange={(n) => setBloque(bloque.id, { paso: n })} />
                <Num label="Espacio entre filas" value={bloque.sepFila} min={16} max={80} onChange={(n) => setBloque(bloque.id, { sepFila: n })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className={lbl}>Primera fila<input className={`${input} py-1.5 uppercase`} value={bloque.filaInicial} maxLength={3} onChange={(e) => setBloque(bloque.id, { filaInicial: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") || "A" })} /></label>
                <label className={lbl}>Primer número
                  <input className={`${input} py-1.5`} type="number" min={1} placeholder="Auto" value={bloque.numInicial ?? ""} onChange={(e) => setBloque(bloque.id, { numInicial: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null })} />
                </label>
                <label className={lbl}>Numerar
                  <select className={`${input} py-1.5`} value={bloque.sentido} onChange={(e) => setBloque(bloque.id, { sentido: e.target.value as Bloque["sentido"] })}>
                    <option value="izq">De un lado</option>
                    <option value="der">Al revés</option>
                  </select>
                </label>
              </div>
              <label className={lbl}>Zona (también se cambia después)
                <select className={`${input} py-1.5`} value={bloque.zona ?? ""} onChange={(e) => setBloque(bloque.id, { zona: e.target.value || null })}>
                  <option value="">Sin zona aún (va a “General”)</option>
                  {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Posición X" value={bloque.x} onChange={(n) => setBloque(bloque.id, { x: n })} />
                <Num label="Posición Y" value={bloque.y} onChange={(n) => setBloque(bloque.id, { y: n })} />
              </div>
            </>
          ) : fig ? (
            <>
              <b>Escenario o figura</b>
              <label className={lbl}>Texto<input className={`${input} py-1.5`} value={fig.etiqueta} maxLength={30} onChange={(e) => setForma(fig.id, { etiqueta: e.target.value })} /></label>
              <label className={lbl}>Forma
                <select className={`${input} py-1.5`} value={fig.tipo} onChange={(e) => setForma(fig.id, { tipo: e.target.value as Forma["tipo"] })}>
                  <option value="rect">Rectángulo</option>
                  <option value="elipse">Redondo / óvalo</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Ancho" value={fig.ancho} min={10} max={3000} onChange={(n) => setForma(fig.id, { ancho: n })} />
                <Num label="Alto" value={fig.alto} min={10} max={3000} onChange={(n) => setForma(fig.id, { alto: n })} />
              </div>
              <label className={lbl}>Giro: {fig.rot}°
                <input type="range" min={-180} max={180} step={1} value={fig.rot} onChange={(e) => setForma(fig.id, { rot: Number(e.target.value) })} />
              </label>
            </>
          ) : (
            <p className="text-texto-2">Toca un bloque o el escenario para cambiarlo. Arrástralo para moverlo.</p>
          )}
          {(bloque || fig) && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <button type="button" onClick={duplicar} className={ghost}>Duplicar</button>
              <button type="button" onClick={borrar} className={ghost}>Borrar</button>
            </div>
          )}
          {d.bloques.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="mb-1 text-xs font-semibold text-texto-3">Bloques (en orden de numeración)</p>
              <ul className="flex flex-col gap-1">
                {d.bloques.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => setSel({ tipo: "bloque", id: b.id })} className={`w-full rounded-lg px-2 py-1 text-left text-xs ${bloque?.id === b.id ? "bg-white/10 font-bold" : "hover:bg-white/5"}`}>
                      {b.nombre} <span className="text-texto-3">· {porBloque.get(b.id) ?? 0} · desde {primeros.get(b.id) ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
