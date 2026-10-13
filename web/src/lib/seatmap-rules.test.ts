import { describe, expect, it } from "vitest";
import { colorZona, compararFilas, generarAsientos, nombreFila, resumen, textoSobre, type MapSpec, validarSpec, zonaDeFila } from "./seatmap-rules";

const spec = (o: Partial<MapSpec> = {}): MapSpec => ({
  filas: "letras",
  cuantas: 3,
  bloques: { izquierda: 2, central: 4, derecha: 2 },
  crece: 0,
  numeracion: "continua",
  zonas: [{ zona: "vip", desde: 1, hasta: 1 }, { zona: "pref", desde: 2, hasta: 3 }],
  ...o,
});

describe("filas", () => {
  it("letras y números", () => {
    expect([0, 1, 25, 26, 27].map((i) => nombreFila(i, "letras"))).toEqual(["A", "B", "Z", "AA", "BB"]);
    expect(nombreFila(9, "numeros")).toBe("10");
  });
  it("orden natural", () => {
    expect(["B", "AA", "A", "Z"].sort(compararFilas)).toEqual(["A", "B", "Z", "AA"]);
    expect(["10", "2", "1"].sort(compararFilas)).toEqual(["1", "2", "10"]);
  });
});

describe("generar", () => {
  it("numeración continua de izquierda a derecha, etiquetas únicas", () => {
    const xs = generarAsientos(spec());
    expect(xs).toHaveLength(24);
    const a = xs.filter((x) => x.fila === "A");
    expect(a.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.map((x) => x.lado)).toEqual(["izquierda", "izquierda", "central", "central", "central", "central", "derecha", "derecha"]);
    expect(new Set(xs.map((x) => x.etiqueta)).size).toBe(24);
    expect(a[0].etiqueta).toBe("A-1");
  });
  it("numeración por bloque: cada bloque empieza en 1 y la etiqueta lleva el bloque", () => {
    const xs = generarAsientos(spec({ numeracion: "bloque" }));
    const a = xs.filter((x) => x.fila === "A");
    expect(a.map((x) => x.numero)).toEqual([1, 2, 1, 2, 3, 4, 1, 2]);
    expect(a[0].etiqueta).toBe("A-1 Izq");
    expect(new Set(xs.map((x) => x.etiqueta)).size).toBe(24);
  });
  it("crece por fila y zonas por rango", () => {
    const xs = generarAsientos(spec({ crece: 1 }));
    expect(xs.filter((x) => x.fila === "C")).toHaveLength(8 + 3 * 2);
    expect(xs.find((x) => x.fila === "A")?.zona).toBe("vip");
    expect(xs.find((x) => x.fila === "C")?.zona).toBe("pref");
    expect(zonaDeFila([{ zona: "x", desde: 1, hasta: 1 }], 5)).toBe("x");
    const r = resumen(xs);
    expect(r.filas).toBe(3);
    expect(r.porZona.get("vip")).toBe(8);
  });
});

describe("validar", () => {
  it("detecta formularios incompletos", () => {
    expect(validarSpec(spec())).toEqual([]);
    expect(validarSpec(spec({ bloques: { izquierda: 0, central: 0, derecha: 0 } }))).toContain("Pon asientos en al menos un bloque.");
    expect(validarSpec(spec({ zonas: [] }))).toContain("Elige la zona de precio de cada rango de filas.");
    expect(validarSpec(spec({ cuantas: 0 })).length).toBeGreaterThan(0);
  });
  it("color de zona", () => {
    expect(colorZona({ nombre: "X", color: "#000000" }, 0)).toBe("#000000");
    expect(colorZona({ nombre: "VIP" }, 3, { VIP: "#111111" })).toBe("#111111");
    expect(colorZona({ nombre: "Y" }, 1)).toBe("#14B8A6");
  });
});

describe("texto sobre el color de la zona", () => {
  it("negro en claros y blanco en oscuros", () => {
    expect(textoSobre("#ffe066")).toBe("#0b0910");
    expect(textoSobre("#340feb")).toBe("#ffffff");
    expect(textoSobre(null)).toBe("#ffffff");
  });
});
