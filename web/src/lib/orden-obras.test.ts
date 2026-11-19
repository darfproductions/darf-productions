import { describe, expect, it } from "vitest";
import { anioObra, ordenarObras } from "./orden-obras";

describe("orden de obras", () => {
  it("toma el año de la temporada; si no hay, el de creación", () => {
    expect(anioObra({ temporada: "Temporada 2027" })).toBe(2027);
    expect(anioObra({ temporada: "2025-2026" })).toBe(2025);
    expect(anioObra({ temporada: null, created_at: "2026-03-01T00:00:00Z" })).toBe(2026);
  });
  it("ordena como lo pidió Diego", () => {
    const obras = [
      { n: "Showman", temporada: "2027", created_at: "2026-01-01T00:00:00Z" },
      { n: "High School Musical", temporada: "2025", created_at: "2026-01-02T00:00:00Z" },
      { n: "Mamma Mia!", temporada: "2026", created_at: "2026-01-03T00:00:00Z" },
      { n: "Teen Beach Movie", temporada: "2027", created_at: "2026-05-01T00:00:00Z" },
      { n: "La Familia Madrigal", temporada: "2027", created_at: "2026-06-01T00:00:00Z" },
      { n: "Greased Lightning", temporada: "2027", created_at: "2026-07-01T00:00:00Z" },
    ];
    expect(ordenarObras(obras).map((o) => o.n)).toEqual(["High School Musical", "Mamma Mia!", "Showman", "Teen Beach Movie", "La Familia Madrigal", "Greased Lightning"]);
  });
});
