import { describe, expect, it } from "vitest";
import { elegir, revisarPoster, tienePoster } from "./poster";

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
    expect(elegir(p, "voy")).toEqual({ path: "a/kit/p916i.jpg", info: true });
    expect(elegir(p, "destacada")).toBeNull();
  });
  it("revisa la proporción", () => {
    expect(revisarPoster("3x4", 1500, 2000).errores).toEqual([]);
    expect(revisarPoster("3x4", 1920, 1080).errores.length).toBe(1);
    expect(revisarPoster("9x16", 720, 1280).errores[0]).toContain("pequeña");
  });
});
