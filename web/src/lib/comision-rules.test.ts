import { describe, expect, it } from "vitest";
import { comisionDe, leerTramos, pctDe, textoAvance, textoTramo, validarTramos, type Tramo } from "./comision-rules";

const showman: Tramo[] = [{ desde: 26, hasta: 35, porcentaje: 10 }, { desde: 36, hasta: 45, porcentaje: 20 }];

describe("comisiones por tramos", () => {
  it("el ejemplo de Showman: cada % solo sobre los boletos de su tramo", () => {
    expect(comisionDe(Array(25).fill(250), showman)).toBe(0);
    expect(comisionDe(Array(35).fill(250), showman)).toBe(250);
    expect(comisionDe(Array(45).fill(250), showman)).toBe(750);
    expect(comisionDe(Array(50).fill(250), showman)).toBe(750);
    expect(pctDe(showman, 36)).toBe(20);
    expect(pctDe(showman, 46)).toBe(0);
  });

  it("un solo % para todos y 'a partir del boleto N'", () => {
    expect(comisionDe([100, 200, 300], [{ desde: 1, hasta: null, porcentaje: 10 }])).toBe(60);
    expect(comisionDe(Array(30).fill(100), [{ desde: 26, hasta: null, porcentaje: 15 }])).toBe(75);
  });

  it("revisa los tramos como la base", () => {
    expect(validarTramos(showman)).toBeNull();
    expect(validarTramos([{ desde: 1, hasta: 10, porcentaje: 5 }, { desde: 10, hasta: 20, porcentaje: 10 }])).toMatch(/enciman/);
    expect(validarTramos([{ desde: 1, hasta: null, porcentaje: 5 }, { desde: 20, hasta: 30, porcentaje: 10 }])).toMatch(/enciman/);
    expect(validarTramos([{ desde: 5, hasta: 3, porcentaje: 5 }])).toMatch(/antes del inicio/);
    expect(validarTramos([{ desde: 1, hasta: null, porcentaje: 120 }])).toMatch(/0 a 100/);
    expect(validarTramos([{ desde: 0, hasta: null, porcentaje: 5 }])).toMatch(/boleto 1/);
  });

  it("textos de tramos y avance", () => {
    expect(textoTramo(showman[0])).toBe("Del 26 al 35: 10 %");
    expect(textoTramo({ desde: 46, hasta: null, porcentaje: 25 })).toBe("Desde el boleto 46: 25 %");
    expect(textoTramo({ desde: 1, hasta: null, porcentaje: 12.5 })).toBe("Todos los boletos: 12.5 %");
    expect(textoAvance({ boletos: 42, pct_actual: 20, siguiente_desde: 46, siguiente_pct: 25 })).toBe("va en 20 % · faltan 3 para el 25 %");
    expect(textoAvance({ boletos: 12, pct_actual: 0, siguiente_desde: 26, siguiente_pct: 10 })).toBe("va en 0 % · faltan 13 para el 10 %");
    expect(textoAvance({ boletos: 50, pct_actual: 0, siguiente_desde: null, siguiente_pct: null })).toBe("va en 0 %");
  });

  it("lee el formulario e ignora filas vacías", () => {
    expect(leerTramos([{ desde: "36", hasta: "45", porcentaje: "20" }, { desde: "", hasta: "", porcentaje: "" }, { desde: "26", hasta: "35", porcentaje: "10,5" }]))
      .toEqual([{ desde: 26, hasta: 35, porcentaje: 10.5 }, { desde: 36, hasta: 45, porcentaje: 20 }]);
  });
});
