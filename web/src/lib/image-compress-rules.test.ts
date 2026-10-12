import { describe, expect, it } from "vitest";
import { destino, formatoSalida, hayQueComprimir, peso, recorteAlfa, renombrar } from "./image-compress-rules";

describe("compresión de fotos", () => {
  it("reduce al lado mayor sin deformar ni agrandar", () => {
    expect(destino(4000, 3000, 2400)).toEqual({ w: 2400, h: 1800 });
    expect(destino(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(destino(800, 600, 2400)).toEqual({ w: 800, h: 600 });
  });
  it("deja en paz las ligeras y pequeñas", () => {
    expect(hayQueComprimir("galeria", { size: 200 * 1024, width: 1200, height: 800 })).toBe(false);
    expect(hayQueComprimir("galeria", { size: 4 * 1024 * 1024, width: 1200, height: 800 })).toBe(true);
    expect(hayQueComprimir("avatar", { size: 100 * 1024, width: 3000, height: 3000 })).toBe(true);
  });
  it("formato: WebP si se puede; si no, PNG solo con transparencia", () => {
    expect(formatoSalida(true, true)).toBe("image/webp");
    expect(formatoSalida(false, true)).toBe("image/png");
    expect(formatoSalida(false, false)).toBe("image/jpeg");
  });
  it("peso y nombre", () => {
    expect(peso(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(peso(380 * 1024)).toBe("380 KB");
    expect(renombrar("IMG_001.HEIC.jpeg", "image/webp")).toBe("IMG_001.HEIC.webp");
  });
});

describe("recorte de márgenes transparentes en logos", () => {
  it("recorta con un poco de aire y solo si vale la pena", () => {
    expect(recorteAlfa({ x0: 100, y0: 200, x1: 899, y1: 599 }, 1000, 1000)).toEqual({ x: 84, y: 184, w: 832, h: 432 });
    expect(recorteAlfa({ x0: 2, y0: 2, x1: 997, y1: 997 }, 1000, 1000)).toBeNull();
    expect(recorteAlfa(null, 10, 10)).toBeNull();
  });
});
