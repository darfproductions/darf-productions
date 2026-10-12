import { describe, expect, it } from "vitest";
import { enPreventa, estadoFuncion, partesFuncion } from "./disponibilidad";

describe("estadoFuncion", () => {
  it("sin capacidad no se sabe", () => {
    expect(estadoFuncion(0, 0)).toBeNull();
    expect(estadoFuncion(NaN, 3)).toBeNull();
  });
  it("disponible, últimos y agotado", () => {
    expect(estadoFuncion(100, 0)).toBe("disponible");
    expect(estadoFuncion(100, 89)).toBe("disponible");
    expect(estadoFuncion(100, 90)).toBe("ultimos");
    expect(estadoFuncion(100, 99)).toBe("ultimos");
    expect(estadoFuncion(100, 100)).toBe("agotado");
    expect(estadoFuncion(100, 130)).toBe("agotado");
  });
});

describe("partesFuncion", () => {
  it("día, número, mes y hora de Querétaro", () => {
    // 2027-01-23 02:30 UTC = viernes 22 de enero, 20:30 en Querétaro.
    expect(partesFuncion("2027-01-23T02:30:00Z")).toEqual({ dia: "vie", numero: "22", mes: "ene", hora: "20:30 h" });
    expect(partesFuncion("2027-01-24T19:00:00Z").hora).toBe("13:00 h");
  });
});

describe("enPreventa", () => {
  const ahora = Date.parse("2027-01-10T00:00:00Z");
  it("solo en venta y antes de la fecha", () => {
    expect(enPreventa({ on_sale: true, preventa_hasta: "2027-01-11T00:00:00Z" }, ahora)).toBe(true);
    expect(enPreventa({ on_sale: true, preventa_hasta: "2027-01-09T00:00:00Z" }, ahora)).toBe(false);
    expect(enPreventa({ on_sale: false, preventa_hasta: "2027-01-11T00:00:00Z" }, ahora)).toBe(false);
    expect(enPreventa({ on_sale: true, preventa_hasta: null }, ahora)).toBe(false);
  });
});
