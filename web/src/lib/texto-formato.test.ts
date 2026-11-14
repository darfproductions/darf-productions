import { describe, expect, it } from "vitest";
import { envolver, partesFormato, sinFormato } from "./texto-formato";

describe("formato de textos (negritas, subrayado, cursivas)", () => {
  it("negritas, subrayado y cursivas", () => {
    expect(partesFormato("Hola **mundo** y __tú__ y *ella*")).toEqual([
      { texto: "Hola " }, { texto: "mundo", negrita: true }, { texto: " y " }, { texto: "tú", subrayado: true }, { texto: " y " }, { texto: "ella", cursiva: true },
    ]);
  });
  it("se pueden combinar", () => {
    expect(partesFormato("**__Fecha: 13 de febrero__**")).toEqual([{ texto: "Fecha: 13 de febrero", negrita: true, subrayado: true }]);
  });
  it("una marca sin cierre o con espacios se deja como está", () => {
    expect(partesFormato("5 * 3 = 15")).toEqual([{ texto: "5 * 3 = 15" }]);
    expect(partesFormato("**sin cierre")).toEqual([{ texto: "**sin cierre" }]);
    expect(partesFormato("nombre__de_archivo")).toEqual([{ texto: "nombre__de_archivo" }]);
  });
  it("sin formato quita las marcas", () => {
    expect(sinFormato("Lleva **ropa cómoda** y __agua__")).toBe("Lleva ropa cómoda y agua");
  });
  it("el botón envuelve lo seleccionado y lo quita si ya estaba", () => {
    const r = envolver("Lleva ropa cómoda", 6, 17, "**");
    expect(r).toEqual({ texto: "Lleva **ropa cómoda**", desde: 8, hasta: 19 });
    expect(envolver(r.texto, r.desde, r.hasta, "**")).toEqual({ texto: "Lleva ropa cómoda", desde: 6, hasta: 17 });
    expect(envolver("Hola mundo ", 5, 11, "__").texto).toBe("Hola __mundo__ ");
    expect(envolver("Hola ", 5, 5, "**")).toEqual({ texto: "Hola **texto**", desde: 7, hasta: 12 });
  });
});
