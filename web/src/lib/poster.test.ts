import { describe, expect, it } from "vitest";
import { columnaAlt, elegir, posterAlt, revisarPoster, tienePoster } from "./poster";

describe("póster oficial", () => {
  it("sin póster se usa la imagen de ambiente", () => {
    expect(elegir({}, "destacada")).toBeNull();
    expect(tienePoster({})).toBe(false);
  });
  it("cada lugar toma la versión correcta", () => {
    const p = { poster_3x4_path: "a/kit/p34.jpg", poster_3x4_info_path: "a/kit/p34i.jpg", poster_16x9_info_path: "a/kit/p169i.jpg", poster_9x16_info_path: "a/kit/p916i.jpg" };
    expect(elegir(p, "pagina")).toEqual({ path: "a/kit/p34i.jpg", info: true });
    expect(elegir(p, "tarjeta-celular")).toEqual({ path: "a/kit/p34.jpg", info: false });
    expect(elegir(p, "compartir")).toEqual({ path: "a/kit/p169i.jpg", info: true });
    // "Voy a ir" nunca usa la versión con información: con solo el 9:16 con info, toma el 3:4 limpio.
    expect(elegir(p, "voy")).toEqual({ path: "a/kit/p34.jpg", info: false });
    expect(elegir({ poster_9x16_info_path: "a/kit/p916i.jpg" }, "voy")).toBeNull();
    expect(elegir(p, "destacada")).toBeNull();
  });
  it("revisa la proporción", () => {
    expect(revisarPoster("3x4", 1500, 2000).errores).toEqual([]);
    expect(revisarPoster("3x4", 1920, 1080).errores.length).toBe(1);
    expect(revisarPoster("9x16", 720, 1280).errores[0]).toContain("pequeña");
  });
});

describe("póster alterno", () => {
  it("lee cada formato y versión", () => {
    const p = { poster_alt_9x16_path: "o/kit/alt-9x16.jpg", poster_alt_3x4_info_path: "o/kit/alt-3x4-info.jpg" };
    expect(columnaAlt("3x4", false)).toBe("poster_alt_3x4_path");
    expect(posterAlt(p, "9x16", false)).toBe("o/kit/alt-9x16.jpg");
    expect(posterAlt(p, "3x4", true)).toBe("o/kit/alt-3x4-info.jpg");
    expect(posterAlt(p, "3x4", false)).toBeNull();
  });
  it("no reemplaza al póster oficial en la página", () => {
    const p = { poster_alt_3x4_path: "o/kit/alt.jpg" };
    expect(tienePoster(p)).toBe(false);
    expect(elegir(p, "pagina")).toBeNull();
  });
});

describe("póster alterno en borrador", () => {
  it("el editor lo ve sobre lo publicado", async () => {
    const { obraConCapa } = await import("./obra-capa-rules");
    const p = obraConCapa({ poster_alt_9x16_path: null as string | null }, { poster: { poster_alt_9x16_path: "o/kit/alt.jpg", otra: "x" } } as never);
    expect(p.poster_alt_9x16_path).toBe("o/kit/alt.jpg");
    expect((p as Record<string, unknown>).otra).toBeUndefined();
  });
});
