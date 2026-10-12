import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("rutas internas pasan", () => {
    expect(safeNext("/cuenta")).toBe("/cuenta");
    expect(safeNext("/comprar/abc?v=X1#mapa")).toBe("/comprar/abc?v=X1#mapa");
  });
  it("bloquea otros sitios", () => {
    for (const n of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\\t/evil.com", "https://evil.com", "evil.com", "/%5Cevil", "\\\\evil"]) {
      const r = safeNext(n);
      expect(new URL(r, "https://darf.local").origin).toBe("https://darf.local");
    }
    expect(safeNext("/\\evil.com")).toBe("/cuenta");
  });
  it("vacío usa el respaldo", () => expect(safeNext(null, "/panel")).toBe("/panel"));
});
