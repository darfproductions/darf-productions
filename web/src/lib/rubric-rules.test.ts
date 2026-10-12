import { describe, expect, it } from "vitest";
import { asistenciaPct, completa, filasBoleta, numeroDe, promedio, siguiente } from "./rubric-rules";

describe("rúbrica", () => {
  it("promedio con un decimal", () => {
    expect(promedio([{ numero: 9 }, { numero: 8.5 }, { numero: null }])).toBe(8.8);
    expect(promedio([{ numero: null }])).toBeNull();
  });
  it("número del formulario", () => {
    expect(numeroDe("")).toEqual({ ok: true, n: null });
    expect(numeroDe("9,5")).toEqual({ ok: true, n: 9.5 });
    expect(numeroDe("11").ok).toBe(false);
    expect(numeroDe("abc").ok).toBe(false);
  });
  it("completa y siguiente", () => {
    const c = [{ id: "a", nombre: "A", descripcion: null, orden: 1 }, { id: "b", nombre: "B", descripcion: null, orden: 2 }];
    expect(completa(c, [{ criterion_id: "a", level_id: "x", numero: null }])).toBe(false);
    expect(completa(c, [{ criterion_id: "a", level_id: "x", numero: null }, { criterion_id: "b", level_id: null, numero: 7 }])).toBe(true);
    expect(siguiente(["u1", "u2"], "u1")).toBe("u2");
    expect(siguiente(["u1", "u2"], "u2")).toBeNull();
  });
});

describe("materias por maestro y actitud compartida", () => {
  const crit = [
    { id: "canto", nombre: "Canto", descripcion: null, orden: 1 },
    { id: "act", nombre: "Actitud y conducta", descripcion: null, orden: 2, compartido: true },
  ];
  const niveles = [{ id: "ex", nombre: "Excelente", orden: 1 }, { id: "bien", nombre: "Bien", orden: 2 }];
  const shared = [
    { criterion_id: "act", teacher_id: "t1", level_id: "bien", numero: 8 },
    { criterion_id: "act", teacher_id: "t2", level_id: "ex", numero: 9 },
    { criterion_id: "act", teacher_id: "t3", level_id: "bien", numero: 10 },
  ];
  it("promedia la actitud y toma el nivel más repetido", () => {
    const f = filasBoleta(crit, niveles, [{ criterion_id: "canto", level_id: "ex", numero: 9.5 }], shared);
    expect(f).toEqual([
      { criterio: "Canto", nivel: "Excelente", numero: 9.5 },
      { criterio: "Actitud y conducta", nivel: "Bien", numero: 9, maestros: 3 },
    ]);
  });
  it("completa pide al menos un maestro en lo compartido", () => {
    const sc = [{ criterion_id: "canto", level_id: null, numero: 9 }];
    expect(completa(crit, sc, [])).toBe(false);
    expect(completa(crit, sc, shared)).toBe(true);
  });
  it("porcentaje de asistencia", () => {
    expect(asistenciaPct({ presentes: 7, retardos: 1, faltas: 2 })).toBe(80);
    expect(asistenciaPct({ presentes: 0, retardos: 0, faltas: 0 })).toBeNull();
  });
});
