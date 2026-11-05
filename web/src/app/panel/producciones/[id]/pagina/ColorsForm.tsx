"use client";

import { useState } from "react";
import { sugerirColores } from "@/lib/produccion-nueva-rules";
import { contrastRatio } from "@/lib/kit-rules";
import { themeProblems } from "@/lib/themes";
import { saveColors } from "./actions";
import { EditForm } from "./EditForm";
import { Icono } from "@/components/Icono";

const CAMPOS = [
  { k: "fondo", label: "Fondo", ayuda: "El color de toda la página (claro u oscuro)." },
  { k: "superficie", label: "Superficie", ayuda: "Tarjetas y recuadros." },
  { k: "texto", label: "Texto", ayuda: "Debe leerse sobre fondo y superficie." },
  { k: "acento", label: "Acento", ayuda: "Detalles, números y enlaces." },
] as const;

// Los 4 colores del kit con revisión de legibilidad en vivo (mismas reglas que la base).
export function ColorsForm({ pid, initial, logoUrl, submit = "Guardar colores" }: { pid: string; initial: Record<"fondo" | "superficie" | "texto" | "acento", string>; logoUrl?: string | null; submit?: string }) {
  const [c, setC] = useState(initial);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // 0135: lee los colores del logo (en el navegador) y propone los 4 del kit; tú los ajustas y guardas.
  const delLogo = async () => {
    if (!logoUrl) return;
    setLeyendo(true); setAviso(null);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = logoUrl;
      await img.decode();
      const w = 160, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(img, 0, 0, w, h);
      setC(sugerirColores(ctx.getImageData(0, 0, w, h).data));
      setAviso("Listo: estos colores salen de tu logo. Ajústalos si quieres y guarda.");
    } catch {
      setAviso("No pudimos leer el logo. Elige los colores a mano.");
    } finally { setLeyendo(false); }
  };
  const problems = themeProblems(c);
  return (
    <EditForm action={saveColors} pid={pid} submit={submit}>
      {logoUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={delLogo} disabled={leyendo} className="rounded-full border border-lila/60 px-4 py-2 text-sm font-bold text-lila hover:bg-lila/10 disabled:opacity-60">
            {leyendo ? "Leyendo el logo…" : "Sugerir colores a partir del logo"}
          </button>
          {aviso && <span className="text-sm text-texto-2">{aviso}</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(({ k, label, ayuda }) => (
          <label key={k} className="flex items-center gap-3 rounded-lg bg-sala p-3 text-sm">
            <input type="color" name={`color_${k}`} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} className="h-11 w-14 cursor-pointer rounded border-0 bg-transparent" />
            <span>
              <span className="block font-bold">{label} <span className="font-mono text-xs text-texto-3">{c[k]}</span></span>
              <span className="text-texto-3">{ayuda}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="rounded-xl p-5" style={{ background: c.fondo, color: c.texto }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: c.acento }}>Vista rápida</p>
        <p className="mt-1 text-lg font-bold">Así se lee el texto sobre el fondo</p>
        <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: c.superficie }}>Y así sobre una tarjeta · <b style={{ color: c.acento }}>acento</b></div>
      </div>
      <p className="text-sm text-texto-2">
        Texto/fondo {contrastRatio(c.texto, c.fondo).toFixed(1)}:1 · texto/superficie {contrastRatio(c.texto, c.superficie).toFixed(1)}:1 ·
        acento/fondo {contrastRatio(c.acento, c.fondo).toFixed(1)}:1
      </p>
      {problems.length > 0 ? (
        <ul className="text-sm font-semibold text-aviso">{problems.map((p) => <li key={p}><Icono nombre="punto" className="h-2 w-2 opacity-70" /> {p}</li>)}</ul>
      ) : (
        <p className="text-sm font-semibold text-[#bbf7d0]">Se lee bien: cumple las reglas de la plantilla.</p>
      )}
    </EditForm>
  );
}
