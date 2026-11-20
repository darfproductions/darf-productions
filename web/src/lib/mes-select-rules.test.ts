import { describe, expect, it } from "vitest";
import { opcionesMes } from "./mes-select-rules";

describe("opcionesMes", () => {
  it("va de enero del año anterior a diciembre de 3 años después", () => {
    const o = opcionesMes(2026);
    expect(o[0]).toEqual({ value: "2025-01", label: "Enero 2025" });
    expect(o.at(-1)).toEqual({ value: "2029-12", label: "Diciembre 2029" });
    expect(o).toHaveLength(60);
  });
  it("incluye Febrero 2027", () => {
    expect(opcionesMes(2026).find((x) => x.value === "2027-02")?.label).toBe("Febrero 2027");
  });
  it("agrega el valor actual si queda fuera del rango, en orden", () => {
    const o = opcionesMes(2026, 1, 3, "2020-05-01");
    expect(o[0]).toEqual({ value: "2020-05", label: "Mayo 2020" });
    expect(opcionesMes(2026, 1, 3, "basura")).toHaveLength(60);
  });
});
