import { describe, expect, it } from "vitest";
import { anteriorFase, botonSiguiente, fasesDe, propuesta, rondaDeFase, resumenEnvio, siguienteFase } from "./votacion-rules";

describe("fases", () => {
  it("con y sin callback", () => {
    expect(fasesDe(false)).toEqual(["audicion", "votacion", "ajuste", "enviado"]);
    expect(siguienteFase("audicion", true)).toBe("seleccion_callback");
    expect(siguienteFase("audicion", false)).toBe("votacion");
    expect(siguienteFase("callback", true)).toBe("votacion");
    expect(siguienteFase("ajuste", true)).toBeNull();
    expect(anteriorFase("votacion", false)).toBe("audicion");
    expect(anteriorFase("votacion", true)).toBe("callback");
    expect(anteriorFase("enviado", true)).toBeNull();
    expect(rondaDeFase("callback")).toBe(2);
    expect(rondaDeFase("audicion")).toBe(1);
    expect(botonSiguiente("votacion", false)).toMatch(/Cerrar votación/);
  });
});

describe("propuesta (0167)", () => {
  const votos = [
    { role: "donna", app: "petra" }, { role: "donna", app: "ana" }, { role: "donna", app: null },
    { role: "sophie", app: "petra" }, { role: "sophie", app: "petra" }, { role: "sophie", app: "lucia" },
    { role: "sam", app: null },
  ];
  it("empate en Donna: lo desempata la «Opción 1» de los jueces y se anota", () => {
    const p = propuesta(["donna", "sophie", "sam"], votos, ["beto", "petra"], { op1: { donna: { petra: 2, ana: 1 } } });
    expect(p.porRol.donna).toEqual(["petra"]);
    expect(p.notas.donna).toEqual({ saltados: [], empate: ["ana"] });
    // Petra ya quedó en Donna: Sophie pasa a la siguiente más votada.
    expect(p.porRol.sophie).toEqual(["lucia"]);
    expect(p.notas.sophie).toEqual({ saltados: ["petra"], empate: [] });
    expect(p.porRol.sam).toEqual([]);
    expect(p.ensamble).toEqual(["beto"]);
  });
  it("sin Opción 1 desempata el promedio y luego el número de turno", () => {
    expect(propuesta(["donna"], votos, [], { prom: { ana: 4.5, petra: 4 } }).porRol.donna).toEqual(["ana"]);
    expect(propuesta(["donna"], votos, [], { numero: { ana: 9, petra: 3 } }).porRol.donna).toEqual(["petra"]);
  });
  it("el más importante manda; si todos los votados ya quedaron, el personaje queda vacío", () => {
    const p = propuesta(["a", "b"], [{ role: "a", app: "x" }, { role: "b", app: "x" }, { role: "b", app: "x" }]);
    expect(p.porRol).toEqual({ a: ["x"], b: [] });
    expect(p.notas.b.saltados).toEqual(["x"]);
  });
});

describe("resumenEnvio", () => {
  it("cuenta ofertas, avisos y sin cuenta", () => {
    const r = resumenEnvio([{ cuenta: true }, { cuenta: true }, { cuenta: false }], [{ cuenta: true }, { cuenta: false }]);
    expect(r).toMatchObject({ ofertas: 2, sinCuenta: 1, avisos: 1 });
    expect(r.texto).toBe('Se mandarán 2 ofertas y 1 aviso de "no quedaste"; 1 sin cuenta (avísales tú).');
  });
});
