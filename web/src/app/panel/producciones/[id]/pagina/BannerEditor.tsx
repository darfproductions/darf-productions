"use client";

import { useState } from "react";
import { ProductionBanner } from "@/components/ProductionBanner";
import { buttonGhost, input } from "@/components/panel/ui";
import { avisosVigentes, type Banner, type BannerEstilo } from "@/lib/banner-rules";
import { isoToLocalMx, localMxToIso } from "@/lib/dates";
import { saveBanner, type EditState } from "./actions";
import { EditForm } from "./EditForm";

type Row = { key: number; texto: string; enlace: string; boton: string; inicia: string; termina: string };
const vacio = (key: number): Row => ({ key, texto: "", enlace: "", boton: "", inicia: "", termina: "" });
const lbl = "flex min-w-0 flex-col gap-1 text-xs font-semibold text-texto-2";

// Franja de avisos abajo del Hero: estilo, color, varios avisos con liga y fechas. Vista previa en vivo.
export function BannerEditor({ pid, banner, acento, action = saveBanner }: {
  pid: string;
  banner: Banner | null;
  acento: string;
  /** Guardado: el de la obra por omisión; la franja del sitio pasa el suyo (0074). */
  action?: (prev: EditState, f: FormData) => Promise<EditState>;
}) {
  const [activa, setActiva] = useState(banner?.activa ?? true);
  const [estilo, setEstilo] = useState<BannerEstilo>(banner?.estilo ?? "corre");
  const [usarColor, setUsarColor] = useState(!!banner?.color);
  const [color, setColor] = useState(banner?.color ?? "#f2b544");
  const [rows, setRows] = useState<Row[]>(
    banner?.items.length
      ? banner.items.map((it, i) => ({ key: i, texto: it.texto, enlace: it.enlace ?? "", boton: it.boton ?? "", inicia: isoToLocalMx(it.inicia), termina: isoToLocalMx(it.termina) }))
      : [vacio(0)],
  );
  const [next, setNext] = useState(rows.length + 1);
  const set = (i: number, k: keyof Omit<Row, "key">, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const items = rows.filter((r) => r.texto.trim()).map((r) => ({
    texto: r.texto.trim(), enlace: r.enlace.trim() ? "/" : null, boton: r.boton.trim() || null,
    inicia: r.inicia ? localMxToIso(r.inicia) : null, termina: r.termina ? localMxToIso(r.termina) : null,
  }));
  const ahora = avisosVigentes(items);
  const muestra: Banner = { estilo, color: usarColor ? color : null, activa, items: ahora };

  return (
    <EditForm action={action} pid={pid} submit="Guardar franja">
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="activa" value="1" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Mostrar la franja
        </label>
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Estilo</legend>
          <label className="flex items-center gap-2"><input type="radio" name="estilo" value="corre" checked={estilo === "corre"} onChange={() => setEstilo("corre")} /> Texto que corre</label>
          <label className="flex items-center gap-2"><input type="radio" name="estilo" value="fija" checked={estilo === "fija"} onChange={() => setEstilo("fija")} /> Franja fija (se turnan)</label>
        </fieldset>
        <span className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2"><input type="checkbox" name="usar_color" value="1" checked={usarColor} onChange={(e) => setUsarColor(e.target.checked)} /> Color propio</label>
          {usarColor ? (
            <input type="color" name="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color de la franja" className="h-9 w-14 cursor-pointer rounded border border-white/20 bg-transparent" />
          ) : <span className="text-texto-3">(usa el color de acento de la obra)</span>}
        </span>
      </div>

      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-sala p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Aviso {i + 1}</span>
              <button type="button" className="text-xs font-bold text-texto-3 hover:text-texto" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [vacio(next)])}>Quitar</button>
            </div>
            <label className={lbl}>Texto
              <input className={input} name="texto" value={r.texto} maxLength={160} onChange={(e) => set(i, "texto", e.target.value)} placeholder="¡Últimas funciones! 2x1 los jueves" />
            </label>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <label className={lbl}>Liga (opcional)
                <input className={input} name="enlace" value={r.enlace} onChange={(e) => set(i, "enlace", e.target.value)} placeholder="/audiciones o https://instagram.com/…" />
              </label>
              <label className={lbl}>Texto del botón
                <input className={input} name="boton" value={r.boton} maxLength={30} onChange={(e) => set(i, "boton", e.target.value)} placeholder="Ver más" />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={lbl}>Aparece desde (opcional)
                <input className={input} type="datetime-local" name="inicia" value={r.inicia} onChange={(e) => set(i, "inicia", e.target.value)} />
              </label>
              <label className={lbl}>Se quita el (opcional)
                <input className={input} type="datetime-local" name="termina" value={r.termina} onChange={(e) => set(i, "termina", e.target.value)} />
              </label>
            </div>
          </li>
        ))}
      </ol>
      {rows.length < 10 && (
        <button type="button" className={`${buttonGhost} self-start`} onClick={() => { setRows([...rows, vacio(next)]); setNext(next + 1); }}>+ Agregar aviso</button>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Así se ve ahora en la página:</p>
        {activa && ahora.length > 0 ? (
          <div inert className="overflow-hidden rounded-xl"><ProductionBanner banner={muestra} acento={acento} /></div>
        ) : (
          <p className="rounded-xl bg-sala px-4 py-3 text-sm text-texto-3">
            {!activa ? "La franja está apagada: no se muestra." : items.length ? "Ningún aviso está vigente en este momento (revisa las fechas)." : "Escribe al menos un aviso."}
          </p>
        )}
        <p className="text-xs text-texto-3">Horas del centro de México. Los avisos con fechas aparecen y se quitan solos.</p>
      </div>
    </EditForm>
  );
}
