import { describe, expect, it } from "vitest";
import { companeros, enLaFila, esperando, gruposCierre, mencionados, nombreTurno, quienSigue, sugerirGrupos, textoCallback, validarCallback, type FilaVivo, type PersonaCierre } from "./audicion-vivo-rules";

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

describe("grupos que pasan juntos (0133)", () => {
  it("Siguiente no toma a quien va en el grupo que está en escena; el nombre del turno junta al grupo", () => {
    const rows = [
      { ...f("a", 1, { entered_at: "x", grupo: "g" }), nombre: "Ana López" },
      { ...f("b", 2), nombre: "Beto Ruiz" },
      { ...f("c", 3, { entered_at: "x", grupo: "g" }), nombre: "Caro Díaz" },
    ];
    expect(quienSigue(rows, "a", "audicion")?.id).toBe("b");
    expect(companeros(rows, rows[2]).map((r) => r.id)).toEqual(["a", "c"]);
    expect(nombreTurno(rows, rows[0])).toBe("Nº 1 · Ana + Caro");
    expect(nombreTurno(rows, rows[1])).toBe("Nº 2 · Beto Ruiz");
  });
});

describe("¿con quién pasas? → grupos sugeridos (0136)", () => {
  const P = [
    { id: "ana", nombre: "Ana López", con: "Con Beto Ruiz y Caro" },
    { id: "beto", nombre: "Beto Ruiz", con: "con mi hermana Ana" },
    { id: "caro", nombre: "Caro Díaz", con: null },
    { id: "dani", nombre: "Daniela Pérez", con: "Sola" },
    { id: "eli", nombre: "Elisa Mora", con: "con Sofía Herrera" },
    { id: "sofi1", nombre: "Sofía Herrera", con: "" },
    { id: "sofi2", nombre: "Sofía Torres", con: null },
  ];
  it("reconoce nombre completo, nombre + apellido y nombre de pila único; no adivina entre dos Sofías", () => {
    expect(mencionados(P, P[0])).toEqual(["beto", "caro"]);
    expect(mencionados(P, P[1])).toEqual(["ana"]);
    expect(mencionados(P, P[4])).toEqual(["sofi1"]);
    expect(mencionados(P, { id: "x", nombre: "X", con: "con Sofía" })).toEqual([]);
    expect(mencionados(P, P[3])).toEqual([]);
  });
  it("junta cadenas y deja fuera a quien pasa solo", () => {
    const g = sugerirGrupos(P);
    expect(g.map((x) => x.ids)).toEqual([["ana", "beto", "caro"], ["eli", "sofi1"]]);
    expect(g[0].porque[0]).toContain("Ana dijo");
  });
});
