import { describe, expect, it } from "vitest";
import { decidir, estadoInicial, MISMO_MS, PAUSA_MS, registrar } from "./escaner-rules";

describe("escáner automático con pausa", () => {
  it("después de leer se pausa y no lee otro código", () => {
    const e = estadoInicial();
    expect(decidir(e, "A", 0)).toBe("nuevo");
    registrar(e, "A", 0);
    expect(decidir(e, "B", PAUSA_MS - 1)).toBe("ignorar");
    expect(decidir(e, "B", PAUSA_MS + 1)).toBe("nuevo");
  });
  it("el mismo QR enfrente se ignora; si vuelve después, solo avisa que ya se registró", () => {
    const e = estadoInicial();
    registrar(e, "A", 0);
    expect(decidir(e, "A", PAUSA_MS + 10)).toBe("ignorar");
    registrar(e, "B", MISMO_MS + 1);
    expect(decidir(e, "A", MISMO_MS + PAUSA_MS + 5)).toBe("repetido");
  });
  it("escrito a mano siempre se manda", () => {
    const e = estadoInicial();
    registrar(e, "A", 0);
    expect(decidir(e, "A", 10, true)).toBe("nuevo");
    expect(decidir(e, "  ", 10, true)).toBe("ignorar");
  });
});
