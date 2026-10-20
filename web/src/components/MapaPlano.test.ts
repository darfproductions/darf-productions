import { describe, expect, it } from "vitest";
import { etiquetasFila } from "./MapaPlano";

describe("letras de fila del mapa libre (0114)", () => {
  it("pone la letra en las dos puntas y parte la fila en los pasillos", () => {
    const fila = (x0: number, n0: number, k: number) => Array.from({ length: k }, (_, i) => ({ x: x0 + i * 20, y: 100, numero: n0 + i, fila: "A" }));
    const e = etiquetasFila([...fila(0, 1, 3), ...fila(200, 4, 2)]);
    expect(e).toHaveLength(4);
    expect(e[0]).toEqual({ fila: "A", x: -17, y: 100 });
    expect(e[1]).toEqual({ fila: "A", x: 57, y: 100 });
    expect(e[2].x).toBe(183);
  });
  it("sin fila no escribe nada", () => {
    expect(etiquetasFila([{ x: 0, y: 0, numero: 1 }])).toEqual([]);
  });
});

describe("letras de fila por bloque", () => {
  it("con grupo, un hueco no parte la fila", () => {
    const a = [0, 20, 40, 120, 140].map((x, i) => ({ x, y: 0, numero: i + 1, fila: "C", grupo: "centro" }));
    expect(etiquetasFila(a)).toHaveLength(2);
  });
});
