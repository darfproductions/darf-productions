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

describe("propuesta (ejemplo de Diego)", () => {
  it("empate en Donna, Sophie vacía porque Petra ya quedó en Donna, Sam vacío, Ensamble precargado", () => {
    const votos = [
      { role: "donna", app: "petra" }, { role: "donna", app: "ana" }, { role: "donna", app: null },
      { role: "sophie", app: "petra" }, { role: "sophie", app: "petra" }, { role: "sophie", app: "lucia" },
      { role: "sam", app: null },
    ];
    const p = propuesta(["donna", "sophie", "sam"], votos, ["beto", "petra"]);
    expect(p.porRol.donna).toEqual(["ana", "petra"]);
    expect(p.porRol.sophie).toEqual([]);
    expect(p.porRol.sam).toEqual([]);
    expect(p.ensamble).toEqual(["beto"]);
  });
  it("el más importante manda aunque tenga menos votos en él", () => {
    const p = propuesta(["a", "b"], [{ role: "a", app: "x" }, { role: "b", app: "x" }, { role: "b", app: "x" }, { role: "b", app: "y" }]);
    expect(p.porRol).toEqual({ a: ["x"], b: [] });
  });
});

describe("resumenEnvio", () => {
  it("cuenta ofertas, avisos y sin cuenta", () => {
    const r = resumenEnvio([{ cuenta: true }, { cuenta: true }, { cuenta: false }], [{ cuenta: true }, { cuenta: false }]);
    expect(r).toMatchObject({ ofertas: 2, sinCuenta: 1, avisos: 1 });
    expect(r.texto).toBe('Se mandarán 2 ofertas y 1 aviso de "no quedaste"; 1 sin cuenta (avísales tú).');
  });
});
