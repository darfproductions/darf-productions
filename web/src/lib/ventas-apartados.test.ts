import { describe, expect, it } from "vitest";
import { horasDePlazo, plazoEnUnidad, textoPlazo } from "./ventas-rules";

describe("plazo de los apartados (0128)", () => {
  it("convierte a horas dentro de 1 h y 30 días", () => {
    expect(horasDePlazo(24, "horas")).toBe(24);
    expect(horasDePlazo(2, "dias")).toBe(48);
    expect(horasDePlazo(30, "dias")).toBe(720);
    expect(horasDePlazo(31, "dias")).toBeNull();
    expect(horasDePlazo(0, "horas")).toBeNull();
    expect(horasDePlazo(1.5, "horas")).toBeNull();
  });
  it("muestra el plazo guardado", () => {
    expect(plazoEnUnidad(48)).toEqual({ n: 2, unidad: "dias" });
    expect(plazoEnUnidad(36)).toEqual({ n: 36, unidad: "horas" });
    expect(textoPlazo(24)).toBe("1 día");
    expect(textoPlazo(5)).toBe("5 horas");
  });
});
