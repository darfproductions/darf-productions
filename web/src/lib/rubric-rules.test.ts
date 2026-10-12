import { describe, expect, it } from "vitest";
import { completa, numeroDe, promedio, siguiente } from "./rubric-rules";

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
