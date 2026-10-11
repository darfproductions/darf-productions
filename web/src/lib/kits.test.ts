import { describe, expect, it } from "vitest";
import { isLight, themeFromKit, themeProblems, type KitColumns } from "./themes";

const kit: KitColumns = {
  color_fondo: "#f8f7f5",
  color_superficie: "#ffffff",
  color_texto: "#13235c",
  color_acento: "#c2255c",
  logo_path: "mm/kit/logo.webp",
  ambiente_path: "/producciones/mm/ambiente.jpg",
  frase: "Una boda, tres posibles padres y la música de ABBA.",
};
const url = (p: string) => (p.startsWith("/") ? p : `https://x.test/${p}`);

describe("kit de producción", () => {
  it("arma el tema con las URLs de las imágenes", () => {
    const t = themeFromKit(kit, url);
    expect(t?.logo).toBe("https://x.test/mm/kit/logo.webp");
    expect(t?.ambiente).toBe("/producciones/mm/ambiente.jpg");
    expect(t?.tagline).toBe(kit.frase);
  });
  it("sin una pieza obligatoria no hay tema", () => {
    expect(themeFromKit({ ...kit, logo_path: null }, url)).toBeNull();
    expect(themeFromKit({ ...kit, color_acento: null }, url)).toBeNull();
  });
  it("acepta fondos claros y oscuros legibles", () => {
    expect(themeProblems({ fondo: "#f8f7f5", superficie: "#ffffff", texto: "#13235c", acento: "#c2255c" })).toEqual([]);
    expect(themeProblems({ fondo: "#1a0607", superficie: "#2a0c0e", texto: "#fcebd0", acento: "#f2b544" })).toEqual([]);
  });
  it("rechaza texto ilegible", () => {
    expect(themeProblems({ fondo: "#101010", superficie: "#202020", texto: "#333333", acento: "#ffcc00" })).toHaveLength(2);
  });
  it("distingue fondo claro de oscuro", () => {
    expect(isLight("#f8f7f5")).toBe(true);
    expect(isLight("#08101f")).toBe(false);
  });
});
