import { describe, expect, it } from "vitest";
import { agruparPorPersona, filasExcel, nombreRonda, promedioDe, promedioGeneral, resumenOpciones, type Evaluacion } from "./evaluaciones-rules";

const ev = (app: string, ronda: number, juez: string, puntos: Record<string, number>, opciones: string[] = [], notas: string | null = null): Evaluacion =>
  ({ app, ronda, juez, puntos, opciones, notas });

describe("evaluaciones de todos los jueces", () => {
  it("promedia solo lo que se calificó", () => {
    expect(promedioDe({ canto: 5, baile: 3 })).toBe(4);
    expect(promedioDe({})).toBeNull();
    expect(promedioGeneral([ev("a", 1, "J1", { canto: 5 }), ev("a", 1, "J2", { canto: 2, baile: 2 })])).toBe(3);
    expect(promedioGeneral([ev("a", 1, "J1", {})])).toBeNull();
  });

  it("agrupa por persona, con el callback primero y los jueces en orden", () => {
    const g = agruparPorPersona([ev("a", 1, "Zoe", {}), ev("a", 2, "Ana", {}), ev("a", 1, "Ana", {}), ev("b", 1, "Ana", {})]);
    expect(g.get("a")!.map((r) => r.ronda)).toEqual([2, 1]);
    expect(g.get("a")![1].jueces.map((j) => j.juez)).toEqual(["Ana", "Zoe"]);
    expect(g.get("b")!.length).toBe(1);
  });

  it("resume las opciones de personaje", () => {
    expect(resumenOpciones([ev("a", 1, "J1", {}, ["Brady", "Ensamble"]), ev("a", 1, "J2", {}, ["Brady"])])).toBe("Brady ×2, Ensamble ×1");
    expect(resumenOpciones([])).toBe("");
  });

  it("arma el Excel con una fila por juez y ronda", () => {
    const filas = filasExcel({
      fase: "votacion", criterios: [{ k: "canto", l: "Canto" }],
      personas: [{ id: "b", numero: 2, nombre: "Beto", ronda: 1, estado: "convocado", edad: 15 }, { id: "a", numero: 1, nombre: "Ana", ronda: 2, estado: "callback", edad: 14 }],
      evaluaciones: [ev("a", 1, "J1", { canto: 4 }, ["Brady"], "Bien"), ev("b", 1, "J1", { canto: 3, baile: 4 })],
    });
    expect(filas[0]).toEqual(["Nº", "Nombre", "Edad", "Ronda", "Juez", "Canto", "Promedio del juez", "Opción 1", "Opción 2", "Opción 3", "Notas"]);
    expect(filas[1]).toEqual([2, "Beto", 15, "Audición", "J1", 3, 3.5, "", "", "", ""]);
    expect(filas[2]).toEqual([1, "Ana", 14, "Audición", "J1", 4, 4, "Brady", "", "", "Bien"]);
    expect(nombreRonda(2)).toBe("Callback");
  });
});
