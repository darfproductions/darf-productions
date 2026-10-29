import { describe, expect, it } from "vitest";
import { codigoOrden, restoCodigo } from "./codigo-orden";

describe("código de la orden", () => {
  it("pone DARF- solo y acepta como venga escrito", () => {
    expect(codigoOrden("a1b2c3")).toBe("DARF-A1B2C3");
    expect(codigoOrden(" A1B2C3 ")).toBe("DARF-A1B2C3");
    expect(codigoOrden("DARF-A1B2C3")).toBe("DARF-A1B2C3");
    expect(codigoOrden("darf a1b2 c3")).toBe("DARF-A1B2C3");
  });
  it("vacío o con caracteres raros no busca nada", () => {
    expect(codigoOrden("")).toBe("");
    expect(codigoOrden("DARF-")).toBe("");
    expect(codigoOrden("a1b2*")).toBe("");
  });
  it("resto del código para la casilla", () => {
    expect(restoCodigo("DARF-A1B2C3")).toBe("A1B2C3");
    expect(restoCodigo("")).toBe("");
  });
});
