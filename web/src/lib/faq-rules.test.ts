import { describe, expect, it } from "vitest";
import { PREGUNTAS_SUGERIDAS, avanceSugeridas, faqsParaDarfy, filasEditor, respondidas, type FaqObra } from "./faq-rules";

const f = (x: Partial<FaqObra>): FaqObra => ({ id: "1", clave: null, pregunta: "P", respuesta: "", orden: 100, activa: true, ...x });

describe("preguntas frecuentes por obra (0141)", () => {
  it("hay 8 sugeridas con clave distinta", () => {
    expect(PREGUNTAS_SUGERIDAS).toHaveLength(8);
    expect(new Set(PREGUNTAS_SUGERIDAS.map((s) => s.clave)).size).toBe(8);
  });
  it("el editor muestra las 8 sugeridas (con lo guardado) y después las propias", () => {
    const filas = filasEditor([f({ id: "a", clave: "pagos", pregunta: "¿Cuánto se paga?", respuesta: "800 al mes" }), f({ id: "b", pregunta: "¿Hay estacionamiento?", respuesta: "Sí", orden: 5 })]);
    expect(filas).toHaveLength(9);
    expect(filas.find((x) => x.clave === "pagos")).toMatchObject({ id: "a", respuesta: "800 al mes", pregunta: "¿Cuánto se paga?" });
    expect(filas.find((x) => x.clave === "ensayos")).toMatchObject({ id: null, respuesta: "" });
    expect(filas[8]).toMatchObject({ id: "b" });
  });
  it("el elenco solo ve las activas con respuesta, en orden", () => {
    const r = respondidas([f({ id: "1", respuesta: "x", orden: 20 }), f({ id: "2", respuesta: "  " }), f({ id: "3", respuesta: "y", activa: false }), f({ id: "4", respuesta: "z", orden: 10 })]);
    expect(r.map((x) => x.id)).toEqual(["4", "1"]);
  });
  it("para DARFY lleva el nombre de la obra y la liga al portal", () => {
    const d = faqsParaDarfy([f({ id: "1", clave: "ensayos", pregunta: "¿Dónde son los ensayos?", respuesta: "En el Foro" })], "tbm", "Teen Beach Movie");
    expect(d).toEqual([{ id: "obra-tbm-1", pregunta: "¿Dónde son los ensayos?", respuesta: "Teen Beach Movie: En el Foro", palabras: ["Teen Beach Movie"], liga: "/cuenta/produccion/tbm#obra" }]);
  });
  it("avance: cuántas sugeridas ya tienen respuesta", () => {
    expect(avanceSugeridas([f({ clave: "pagos", respuesta: "x" }), f({ clave: "ensayos", respuesta: "" }), f({ respuesta: "propia" })])).toEqual({ listas: 1, total: 8 });
  });
});
