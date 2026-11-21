import { describe, expect, it } from "vitest";
import { bancoDeClabe, clabeValida, formatearClabe, limpiarClabe } from "./clabe-rules";

describe("CLABE (0161)", () => {
  it("valida 18 dígitos y el dígito verificador", () => {
    expect(clabeValida("012180001234567899")).toBe(true);
    expect(clabeValida("0121 8000 1234 5678 99")).toBe(true);
    expect(clabeValida("012180001234567890")).toBe(false);
    expect(clabeValida("12345")).toBe(false);
  });
  it("limpia y da formato", () => {
    expect(limpiarClabe("0121-8000 1234")).toBe("012180001234");
    expect(formatearClabe("012180001234567899")).toBe("012 180 00123456789 9");
  });
  it("adivina el banco por los primeros dígitos", () => {
    expect(bancoDeClabe("012180001234567899")).toBe("BBVA");
    expect(bancoDeClabe("722")).toBe("Mercado Pago");
    expect(bancoDeClabe("999000")).toBeNull();
  });
});
