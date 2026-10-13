import { describe, expect, it } from "vitest";
import { cleanSellerCode, estadoVendedor, sellerPath, withSeller } from "./seller-rules";

describe("códigos de vendedor", () => {
  it("limpia el código", () => {
    expect(cleanSellerCode(" ana7k2q ")).toBe("ANA7K2Q");
    expect(cleanSellerCode("AB")).toBeNull();
    expect(cleanSellerCode("ANA 7K")).toBeNull();
    expect(cleanSellerCode("<script>")).toBeNull();
    expect(cleanSellerCode(["ANA7K2Q"])).toBeNull();
  });
  it("arma los links", () => {
    expect(sellerPath("mamma-mia", "ANA7K2Q")).toBe("/producciones/mamma-mia?v=ANA7K2Q");
    expect(withSeller("/comprar/f1", "ANA7K2Q")).toBe("/comprar/f1?v=ANA7K2Q");
    expect(withSeller("/comprar/f1?x=1", "ANA7K2Q")).toBe("/comprar/f1?x=1&v=ANA7K2Q");
    expect(withSeller("/comprar/f1", null)).toBe("/comprar/f1");
  });
  it("explica el estado", () => {
    expect(estadoVendedor({ tipo: "elenco", activo: true, decidido: false })).toBe("Activo (elenco)");
    expect(estadoVendedor({ tipo: "elenco", activo: false, decidido: true })).toBe("Desactivado");
    expect(estadoVendedor({ tipo: "cuenta", activo: false, decidido: false })).toBe("No activo");
  });
});
