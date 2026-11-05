import { describe, expect, it } from "vitest";
import { themeProblems } from "@/lib/themes";
import { compararPerfil, coloresPrincipales, mesAInput, mesDeInput, PUESTOS_SUGERIDOS, resumenPersonaje, sugerirColores, textoMeses, validarMeses } from "./produccion-nueva-rules";

const pixeles = (lista: [number, number, number, number, number][]) => {
  const out: number[] = [];
  for (const [r, g, b, a, n] of lista) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return out;
};

describe("producción nueva (0135)", () => {
  it("fechas tentativas por mes", () => {
    expect(mesDeInput("2027-03")).toBe("2027-03-01");
    expect(mesDeInput("2027-13")).toBeNull();
    expect(mesDeInput("")).toBeNull();
    expect(mesAInput("2027-03-01")).toBe("2027-03");
    expect(textoMeses("2027-03-01")).toBe("Marzo 2027");
    expect(textoMeses("2027-03-01", "2027-03-01")).toBe("Marzo 2027");
    expect(textoMeses("2027-03-01", "2027-04-01")).toBe("Marzo – Abril 2027");
    expect(textoMeses("2026-11-01", "2027-01-01")).toBe("Noviembre 2026 – Enero 2027");
    expect(textoMeses(null)).toBeNull();
    expect(validarMeses(null, "2027-01-01")).toMatch(/inicio/);
    expect(validarMeses("2027-04-01", "2027-03-01")).toMatch(/antes/);
    expect(validarMeses("2027-03-01", null)).toBeNull();
  });

  it("resumen de un personaje y de un grupo de ensamble", () => {
    const base = { categoria: "protagonista" as const, cupo: 1, genero: "mujer", edad_min: 16, edad_max: 22, tesituras: ["soprano", "mezzosoprano"], canto: "fuerte", baile: "fuerte", actuacion: null, habilidades: ["Acrobacia"] };
    expect(resumenPersonaje(base)).toBe("Mujer · 16–22 años · Soprano o Mezzosoprano · Baila fuerte · Acrobacia");
    expect(resumenPersonaje({ ...base, categoria: "ensamble", cupo: 6, edad_min: null, edad_max: null, tesituras: [], canto: "no", habilidades: [] }))
      .toBe("6 personas · Mujeres · No canta · Baila fuerte");
  });

  it("los puestos sugeridos traen permisos", () => {
    expect(PUESTOS_SUGERIDOS.find((p) => p.puesto === "Dirección vocal")?.roles).toContain("juez");
    expect(PUESTOS_SUGERIDOS.every((p) => p.roles.length > 0)).toBe(true);
  });

  it("colores del logo: ignora lo transparente y siempre se leen bien", () => {
    const px = pixeles([[220, 30, 60, 255, 600], [250, 200, 20, 255, 300], [0, 0, 0, 0, 5000]]);
    const cols = coloresPrincipales(px);
    expect(cols).toHaveLength(2);
    expect(cols[0].peso).toBeCloseTo(2 / 3, 2);
    const c = sugerirColores(px);
    expect(themeProblems(c)).toEqual([]);
    expect(sugerirColores([])).toEqual({ fondo: "#14121f", superficie: "#221f33", texto: "#f7f5ff", acento: "#c4b5fd" });
    // Un logo casi negro también da algo legible.
    expect(themeProblems(sugerirColores(pixeles([[10, 10, 10, 255, 500], [30, 30, 40, 255, 100]])))).toEqual([]);
  });
});

describe("pop-up del juez: ficha vs. perfil (0135)", () => {
  const ficha = { id: "r", nombre: "Lela", descripcion: null, categoria: "protagonista", cupo: 1, genero: "mujer", edad_min: 16, edad_max: 22,
    tesituras: ["soprano"], canto: "fuerte", baile: "basico", actuacion: null, habilidades: ["Acrobacia"], rasgos: null };
  it("marca lo que cumple y lo que no", () => {
    const c = compararPerfil(ficha, { tesitura: "mezzosoprano", canto: "fuerte", baile: "fuerte", genero: "mujer", habilidades: ["acrobacia"] }, 19);
    expect(c.map((x) => [x.que, x.ok])).toEqual([["Interpreta", true], ["Edad que aparenta", true], ["Tesitura", false], ["Canto", true], ["Baile", true], ["Acrobacia", true]]);
    expect(c.find((x) => x.que === "Tesitura")).toMatchObject({ pide: "Soprano", tiene: "Mezzosoprano" });
  });
  it("sin perfil o sin datos no se puede saber", () => {
    const c = compararPerfil(ficha, null, null);
    expect(c.every((x) => x.ok === null)).toBe(true);
    expect(compararPerfil({ ...ficha, genero: null, edad_min: null, edad_max: null, tesituras: [], canto: null, baile: null, habilidades: [] }, null, 20)).toEqual([]);
    expect(compararPerfil(ficha, { tesitura: "no_se", canto: "basico", baile: null, genero: null, habilidades: [] }, 30).find((x) => x.que === "Tesitura")?.tiene).toBe("No sabe");
    expect(compararPerfil(ficha, { tesitura: null, canto: "basico", baile: null, genero: null, habilidades: [] }, 30).find((x) => x.que === "Canto")?.ok).toBe(false);
  });
});
