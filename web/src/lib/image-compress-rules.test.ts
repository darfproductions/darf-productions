import { describe, expect, it } from "vitest";
import { destino, formatoSalida, hayQueComprimir, peso, renombrar } from "./image-compress-rules";

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
