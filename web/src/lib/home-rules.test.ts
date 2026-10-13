import { describe, expect, it } from "vitest";
import { agrupar, clasificar, elegirPortada, estadoPublico, lastPerformanceDates, ordenarObras } from "./home-rules";

const ahora = new Date("2026-10-12T12:00:00Z");
const prod = (id: string, concluded: boolean, created_at = "2026-01-01T00:00:00Z", destacada = false) => ({ id, concluded, created_at, destacada });
const fun = (production_id: string, starts_at: string | null, on_sale = true) => ({ production_id, starts_at, on_sale });

describe("estado público de una obra", () => {
  it("cartelera solo con funciones a la venta; próximamente si no; archivo si concluyó", () => {
    expect(estadoPublico(prod("showman", false), [fun("showman", "2026-11-01T02:00:00Z")], ahora)).toBe("cartelera");
    expect(estadoPublico(prod("tbm", false), [fun("tbm", "2027-03-01T02:00:00Z", false)], ahora)).toBe("proximamente");
    expect(estadoPublico(prod("tbm", false), [fun("tbm", null)], ahora)).toBe("proximamente");
    expect(estadoPublico(prod("x", false), [fun("x", "2026-09-01T02:00:00Z")], ahora)).toBe("proximamente");
    expect(estadoPublico(prod("hsm", true), [fun("hsm", "2026-11-01T02:00:00Z")], ahora)).toBe("archivo");
  });
});

describe("orden y portada", () => {
  const obras = [prod("hsm", true, "2025-01-01T00:00:00Z"), prod("tbm", false, "2026-09-01T00:00:00Z"), prod("showman", false), prod("mm", false), prod("otra", true, "2024-01-01T00:00:00Z")];
  const funciones = [
    fun("showman", "2026-11-20T02:00:00Z"),
    fun("mm", "2026-10-20T02:00:00Z"),
    fun("hsm", "2025-06-30T02:00:00Z", false),
    fun("tbm", "2027-03-01T02:00:00Z", false),
  ];
  it("cartelera (la más cercana primero) → próximamente → archivo", () => {
    const xs = ordenarObras(clasificar(obras, funciones, ahora));
    expect(xs.map((p) => p.id)).toEqual(["mm", "showman", "tbm", "hsm", "otra"]);
    const g = agrupar(xs);
    expect(g.cartelera.map((p) => p.id)).toEqual(["mm", "showman"]);
    expect(g.proximamente.map((p) => p.id)).toEqual(["tbm"]);
  });
  it("portada: la destacada; si no, la función más cercana", () => {
    expect(elegirPortada(ordenarObras(clasificar(obras, funciones, ahora)))?.production.id).toBe("mm");
    const conDestacada = obras.map((o) => (o.id === "showman" ? { ...o, destacada: true } : o));
    const f = elegirPortada(ordenarObras(clasificar(conDestacada, funciones, ahora)));
    expect(f?.production.id).toBe("showman");
    expect(f?.mode).toBe("cartelera");
  });
  it("sin cartelera: próximamente; sin nada activo: lo último del archivo", () => {
    expect(elegirPortada(ordenarObras(clasificar([prod("tbm", false), prod("hsm", true)], [], ahora)))?.mode).toBe("proximamente");
    const solo = elegirPortada(ordenarObras(clasificar([prod("a", true, "2025-01-01T00:00:00Z"), prod("b", true, "2026-01-01T00:00:00Z")], [], ahora)));
    expect(solo?.production.id).toBe("b");
    expect(elegirPortada([])).toBeNull();
  });
  it("última función por obra", () => {
    expect(lastPerformanceDates([fun("a", "2026-01-01T00:00:00Z"), fun("a", "2026-02-01T00:00:00Z"), fun("b", null)]).get("a")).toBe("2026-02-01T00:00:00Z");
  });
});
