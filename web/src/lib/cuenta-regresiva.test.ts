import { describe, expect, it } from "vitest";
import { fechaEstreno, partesRestantes } from "./cuenta-regresiva";

describe("partesRestantes", () => {
  it("divide en días, horas y minutos", () => {
    expect(partesRestantes((2 * 1440 + 3 * 60 + 5) * 60_000)).toEqual({ dias: 2, horas: 3, minutos: 5 });
  });
  it("redondea hacia arriba y no baja de cero", () => {
    expect(partesRestantes(30_000)).toEqual({ dias: 0, horas: 0, minutos: 1 });
    expect(partesRestantes(-5000)).toEqual({ dias: 0, horas: 0, minutos: 0 });
  });
});

describe("fechaEstreno", () => {
  const ahora = new Date("2027-01-10T00:00:00Z");
  it("la primera función si aún no llega", () => {
    expect(fechaEstreno([{ starts_at: "2027-01-23T02:00:00Z" }, { starts_at: "2027-01-22T02:00:00Z" }, { starts_at: null }], ahora)).toBe("2027-01-22T02:00:00Z");
  });
  it("nada si ya se estrenó o no hay fechas", () => {
    expect(fechaEstreno([{ starts_at: "2027-01-01T02:00:00Z" }, { starts_at: "2027-02-01T02:00:00Z" }], ahora)).toBeNull();
    expect(fechaEstreno([{ starts_at: null }], ahora)).toBeNull();
  });
});
