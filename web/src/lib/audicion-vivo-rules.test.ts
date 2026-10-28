import { describe, expect, it } from "vitest";
import { enLaFila, esperando, gruposCierre, quienSigue, textoCallback, validarCallback, type FilaVivo, type PersonaCierre } from "./audicion-vivo-rules";

const f = (id: string, numero: number, extra: Partial<FilaVivo> = {}): FilaVivo =>
  ({ id, numero, estado: "convocado", checked_in_at: "2026-11-08T16:00:00Z", entered_at: null, finished_at: null, ...extra });

describe("día de audiciones en vivo", () => {
  it("quién sigue: el siguiente número después del que está en escena, sin quien no llegó", () => {
    const rows = [
      f("a", 1, { entered_at: "x", finished_at: "y" }),
      f("b", 2, { entered_at: "x" }),
      f("c", 3, { checked_in_at: null }),
      f("d", 4),
      f("e", 5),
    ];
    expect(quienSigue(rows, "b", "audicion")?.id).toBe("d");
    expect(esperando(rows, "b", "audicion")).toBe(2);
  });

  it("quién sigue: los que se saltaron van después de los que siguen", () => {
    const rows = [f("a", 1), f("b", 2, { entered_at: "x" }), f("c", 3)];
    expect(quienSigue(rows, "b", "audicion")?.id).toBe("c");
    expect(quienSigue(rows.filter((r) => r.id !== "c"), "b", "audicion")?.id).toBe("a");
    expect(quienSigue([f("a", 1, { finished_at: "y" })], null, "audicion")).toBeNull();
  });

  it("en el callback solo cuentan los llamados", () => {
    const rows = [f("a", 1), f("b", 2, { estado: "callback" })];
    expect(enLaFila(rows, "callback").map((r) => r.id)).toEqual(["b"]);
    expect(quienSigue(rows, null, "callback")?.id).toBe("b");
    expect(quienSigue(rows, null, "audicion")?.id).toBe("a");
  });

  it("texto del callback", () => {
    expect(textoCallback("hoy", null, null)).toBe("Hoy mismo");
    expect(textoCallback("otra_fecha", "2026-11-08T17:00:00Z", " Foro DARF ")).toBe("Domingo, 8 de noviembre, 11:00 a.m. · Foro DARF");
    expect(textoCallback(null, null, null)).toBeNull();
  });

  it("grupos del host: por personaje, más marcas primero; ensamble y sin personaje al final", () => {
    const p = (id: string, roles: string[], marcas: Record<string, number>, promedio: number | null = null): PersonaCierre =>
      ({ id, numero: Number(id.slice(1)), nombre: id, estado: "convocado", roles, paso: true, promedio, marcas });
    const g = gruposCierre(
      [{ id: "lela", nombre: "Lela" }, { id: "brady", nombre: "Brady" }],
      [p("n1", ["lela"], {}), p("n2", ["lela"], { lela: 2 }), p("n3", [], { brady: 1 }), p("n4", [], { ensamble: 1 }), p("n5", [], {}, 4)],
    );
    expect(g.map((x) => x.nombre)).toEqual(["Lela", "Brady", "Ensamble", "Sin personaje"]);
    expect(g[0].personas.map((x) => x.id)).toEqual(["n2", "n1"]);
    expect(g[0].personas[0].marcasAqui).toBe(2);
    expect(g[1].personas.map((x) => x.id)).toEqual(["n3"]);
    expect(g[3].personas.map((x) => x.id)).toEqual(["n5"]);
  });

  it("validar el callback", () => {
    const ahora = new Date("2026-11-01T12:00:00Z");
    expect(validarCallback("hoy", null, 0, ahora)).toMatch(/al menos/);
    expect(validarCallback("hoy", null, 2, ahora)).toBeNull();
    expect(validarCallback("otra_fecha", "2026-10-30T10:00", 2, ahora)).toMatch(/fecha/);
    expect(validarCallback("otra_fecha", "2026-11-08T10:00", 2, ahora)).toBeNull();
  });
});
