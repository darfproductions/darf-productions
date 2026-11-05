import { describe, expect, it } from "vitest";
import { boleteriaPorDefecto, conBoleteria, etiquetaTipo, paginasNoAplican, tipoDe } from "./tipo-obra-rules";

describe("tipo de producción (0139)", () => {
  it("lo raro o vacío es profesional, con boletería", () => {
    expect(tipoDe(null)).toBe("profesional");
    expect(tipoDe({ tipo: "circo" })).toBe("profesional");
    expect(tipoDe({ tipo: "escuela" })).toBe("escuela");
    expect(conBoleteria(null)).toBe(true);
    expect(conBoleteria({ con_boleteria: false })).toBe(false);
  });
  it("la escuela empieza sin boletería; los demás, con", () => {
    expect(boleteriaPorDefecto("escuela")).toBe(false);
    expect(boleteriaPorDefecto("taller")).toBe(true);
  });
  it("qué no aplica a cada tipo", () => {
    expect([...paginasNoAplican({ tipo: "profesional" })]).toEqual(["cuotas", "adeudos", "evaluaciones"]);
    expect(paginasNoAplican({ tipo: "taller" }).has("vendedores")).toBe(true);
    expect(paginasNoAplican({ tipo: "taller" }).has("cuotas")).toBe(false);
    const esc = paginasNoAplican({ tipo: "escuela", con_boleteria: false });
    for (const p of ["cuotas", "fanzone", "boletos", "taquilla", "puerta", "hoy", "funciones"]) expect(esc.has(p)).toBe(true);
    // Audiciones, ensayos, expedientes y evaluaciones sí aplican a la escuela (Teen Beach Movie las usa).
    for (const p of ["audiciones", "ensayos", "expedientes", "evaluaciones", "materiales", "comunicados"]) expect(esc.has(p)).toBe(false);
    // Con la boletería prendida, la escuela ve Boletos (menos lo que no aplica: vendedores, preventa, beneficios).
    const escV = paginasNoAplican({ tipo: "escuela", con_boleteria: true });
    expect(escV.has("boletos")).toBe(false);
    expect(escV.has("vendedores")).toBe(true);
  });
  it("etiqueta del encabezado", () => {
    expect(etiquetaTipo({ tipo: "escuela", con_boleteria: false })).toBe("Escuela · sin boletería");
    expect(etiquetaTipo({ tipo: "profesional" })).toBe("Profesional");
  });
});
