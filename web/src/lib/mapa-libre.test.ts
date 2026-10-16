import { describe, expect, it } from "vitest";
import { bloqueBase, encimados, erroresDiseno, generarLibre, leerDiseno, nombreFila, plantilla, PLANTILLAS, posicionesBloque, repetidos } from "./mapa-libre";

describe("mapa libre (0113)", () => {
  it("nombres de fila con letras y números", () => {
    expect(nombreFila("A", 0)).toBe("A");
    expect(nombreFila("A", 2)).toBe("C");
    expect(nombreFila("A", 26)).toBe("AA");
    expect(nombreFila("D", 1)).toBe("E");
    expect(nombreFila("1", 4)).toBe("5");
  });
  it("bloque recto: filas se alejan, crecen y se giran", () => {
    const b = bloqueBase({ x: 100, y: 100, asientos: 3, filas: 2, crece: 1, paso: 20, sepFila: 30 });
    const p = posicionesBloque(b);
    expect(p[0].puntos).toEqual([{ x: 80, y: 100 }, { x: 100, y: 100 }, { x: 120, y: 100 }]);
    expect(p[1].puntos).toHaveLength(4);
    expect(p[1].puntos[0].y).toBe(130);
    // Girado 90°: las filas se alejan hacia la izquierda.
    const g = posicionesBloque({ ...b, rot: 90 });
    expect(g[1].puntos[0].x).toBe(70);
  });
  it("bloque en arco alrededor del escenario", () => {
    const b = bloqueBase({ forma: "arco", x: 0, y: 0, radio: 100, desde: -90, hasta: 90, asientos: 3, filas: 1 });
    const [f] = posicionesBloque(b);
    expect(f.puntos).toEqual([{ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }]);
  });
  it("numeración seguida por fila entre bloques, sin repetidos", () => {
    const d = { version: 1 as const, formas: [], bloques: [
      bloqueBase({ nombre: "Izq", x: 0, asientos: 3, filas: 2 }),
      bloqueBase({ nombre: "Der", x: 300, asientos: 2, filas: 2 }),
    ] };
    const a = generarLibre(d);
    expect(a.filter((x) => x.fila === "A").map((x) => x.etiqueta)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(a.find((x) => x.etiqueta === "A4")?.seccion).toBe("Der");
    expect(repetidos(a)).toEqual([]);
    expect(erroresDiseno(d, a)).toEqual([]);
  });
  it("detecta repetidos y encimados", () => {
    const d = { version: 1 as const, formas: [], bloques: [bloqueBase({ asientos: 2, filas: 1, numInicial: 1 }), bloqueBase({ asientos: 2, filas: 1, numInicial: 1, x: 900 })] };
    const a = generarLibre(d);
    expect(repetidos(a)).toEqual(["A1", "A2"]);
    expect(erroresDiseno(d, a)[0]).toContain("repetidos");
    expect(encimados([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 50, y: 50 }])).toBe(1);
  });
  it("las plantillas no repiten asientos ni se enciman", () => {
    for (const p of PLANTILLAS) {
      const d = plantilla(p.id);
      const a = generarLibre(d);
      expect(a.length, p.id).toBeGreaterThan(50);
      expect(repetidos(a), p.id).toEqual([]);
      expect(encimados(a), p.id).toBe(0);
    }
  });
  it("lee un diseño guardado", () => {
    const d = plantilla("redondo");
    expect(leerDiseno(JSON.parse(JSON.stringify(d)))?.bloques).toHaveLength(4);
    expect(leerDiseno({ version: 2 })).toBeNull();
  });
});
