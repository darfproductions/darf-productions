import { describe, expect, it } from "vitest";
import { buscarAtajos, esCodigo, normalizar, type Atajo } from "./panel-buscar-rules";

const a = (titulo: string, claves: string): Atajo => ({ tipo: "seccion", titulo, detalle: "", href: `/${titulo}`, claves });
const atajos = [
  a("Showman", "showman obra resumen"),
  a("Showman → Funciones y horarios", "showman boletos funciones y precios"),
  a("Showman → Ventas y órdenes", "showman boletos ventas y ordenes"),
  a("Mamma Mia → Ventas y órdenes", "mamma mia boletos ventas y ordenes"),
  a("Personas", "personas directorio"),
];

describe("buscador del panel", () => {
  it("normaliza acentos y espacios", () => {
    expect(normalizar("  Órdenes  de   Público ")).toBe("ordenes de publico");
  });
  it("reconoce códigos", () => {
    expect(esCodigo("DARF-7K2")).toBe(true);
    expect(esCodigo("ev-")).toBe(true);
    expect(esCodigo("showman")).toBe(false);
  });
  it("todas las palabras, en cualquier orden y sin acentos", () => {
    expect(buscarAtajos(atajos, "showman boletos").map((x) => x.titulo)).toEqual(["Showman → Funciones y horarios", "Showman → Ventas y órdenes"]);
    expect(buscarAtajos(atajos, "órdenes mamma").map((x) => x.titulo)).toEqual(["Mamma Mia → Ventas y órdenes"]);
    expect(buscarAtajos(atajos, "show")[0].titulo).toBe("Showman");
    expect(buscarAtajos(atajos, "  ")).toEqual([]);
  });
});
