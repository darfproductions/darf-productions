import { describe, expect, it } from "vitest";
import { conPunto, isoMx, isoToLocalMx, localMxToIso, mayus, partesMx } from "./dates";

describe("fechas en hora de CDMX", () => {
  it("ida y vuelta", () => {
    const iso = localMxToIso("2027-05-22T19:00");
    expect(iso).toBe("2027-05-22T19:00:00-06:00");
    expect(isoToLocalMx(iso)).toBe("2027-05-22T19:00");
    expect(isoToLocalMx("2027-05-23T01:00:00+00:00")).toBe("2027-05-22T19:00");
  });
  it("rechaza fechas mal escritas", () => {
    expect(localMxToIso("22/05/2027")).toBeNull();
    expect(isoToLocalMx(null)).toBe("");
  });
});


describe("fechas de México", () => {
  it("después de las 18:00 de México sigue siendo el mismo día (el servidor está en UTC)", () => {
    expect(isoMx(new Date("2026-10-14T03:30:00Z"))).toBe("2026-10-13");
    expect(isoMx(new Date("2026-10-14T06:30:00Z"))).toBe("2026-10-14");
    expect(partesMx(new Date("2027-01-01T05:00:00Z"))).toEqual({ y: 2026, m: 12, d: 31 });
  });
  it("mayúscula solo en la primera letra y sin punto doble", () => {
    expect(mayus("viernes, 22 de noviembre")).toBe("Viernes, 22 de noviembre");
    expect(conPunto("hoy 8:00 p.m.")).toBe("hoy 8:00 p.m.");
    expect(conPunto("Próximas funciones: vie 22 nov")).toBe("Próximas funciones: vie 22 nov.");
  });
});
