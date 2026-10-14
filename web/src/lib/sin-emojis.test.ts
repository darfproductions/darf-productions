import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Diego (2026-10-14): en la página no se usan emojis ni símbolos tipo emoji (flechas, palomitas,
// tachas, estrellas…): van los íconos propios de components/Icono.tsx. Esta prueba revisa todo src
// (sin contar comentarios). Se permiten ©, ×/· de medidas y textos, y la elipsis.
const PROHIBIDOS = /[←-⇿⌀-⏿■-➿⤀-⥿⬀-⯿•¶\u{1F000}-\u{1FAFF}️]/u;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(tsx?|css)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

/** Quita comentarios (// … y /* … *\/) para no contar las notas del código. */
function sinComentarios(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("sin emojis en la página", () => {
  it("ningún archivo de src usa emojis ni símbolos tipo emoji", () => {
    const base = join(__dirname, "..");
    const hallados = archivos(base).flatMap((p) =>
      sinComentarios(readFileSync(p, "utf8")).split("\n").flatMap((l, i) => (PROHIBIDOS.test(l) ? [`${p.slice(base.length + 1)}:${i + 1}: ${l.trim().slice(0, 80)}`] : [])),
    );
    expect(hallados).toEqual([]);
  });
});
