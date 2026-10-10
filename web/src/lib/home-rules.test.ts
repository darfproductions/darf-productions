import { describe, expect, it } from "vitest";
import { lastPerformanceDates, pickFeatured, sortForHome } from "./home-rules";

const prod = (id: string, concluded: boolean, created_at = "2026-01-01T00:00:00Z") => ({
  id,
  concluded,
  created_at,
});

describe("portada: producción destacada", () => {
  it("destaca la obra en cartelera aunque haya archivo más reciente", () => {
    const list = [prod("hsm", true), prod("showman", false), prod("mm", true)];
    const dates = lastPerformanceDates([
      { production_id: "mm", starts_at: "2026-05-22T19:00:00Z" },
      { production_id: "showman", starts_at: null },
    ]);
    const f = pickFeatured(sortForHome(list, dates));
    expect(f).toEqual({ production: list[1], mode: "cartelera" });
  });

  it("sin obra en cartelera, el spot se lo lleva la más reciente del archivo", () => {
    const list = [prod("hsm", true), prod("mm", true), prod("showman", true)];
    const dates = lastPerformanceDates([
      { production_id: "hsm", starts_at: "2025-06-30T19:30:00Z" },
      { production_id: "mm", starts_at: "2026-05-22T19:00:00Z" },
      { production_id: "showman", starts_at: "2027-03-01T20:00:00Z" },
      { production_id: "showman", starts_at: "2027-03-02T18:00:00Z" },
    ]);
    const f = pickFeatured(sortForHome(list, dates));
    expect(f?.production.id).toBe("showman");
    expect(f?.mode).toBe("archivo");
  });

  it("sin funciones con fecha, ordena por fecha de alta", () => {
    const list = [prod("a", true, "2025-01-01T00:00:00Z"), prod("b", true, "2026-01-01T00:00:00Z")];
    expect(pickFeatured(sortForHome(list, new Map()))?.production.id).toBe("b");
  });

  it("sin producciones no destaca nada", () => {
    expect(pickFeatured([])).toBeNull();
  });

  it("ordena: cartelera primero, luego archivo del más reciente al más antiguo", () => {
    const list = [prod("hsm", true, "2025-01-01T00:00:00Z"), prod("mm", true, "2026-01-01T00:00:00Z"), prod("showman", false)];
    expect(sortForHome(list, new Map()).map((p) => p.id)).toEqual(["showman", "mm", "hsm"]);
  });
});
