import { describe, expect, it } from "vitest";
import { capaDifusion } from "./obra-capa-rules";

// Difusión (2026-10-25): los diseños usan los pósters y datos del borrador (Showman los tenía sin publicar).
describe("Difusión con cambios sin publicar", () => {
  it("usa los pósters y datos del borrador y dice cuáles", () => {
    const pub = { nombre: "Showman", venue: "Teatro", poster_alt_3x4_path: null as string | null, poster_3x4_path: null as string | null, logo_path: "a.png" };
    const r = capaDifusion(pub, { poster: { poster_alt_3x4_path: "showman/kit/alt.jpg", poster_3x4_path: "showman/kit/p.jpg", raro: "x" }, datos: { venue: "Teatro IMSS" } as never, canciones: { actos: [] } });
    expect(r.obra.poster_alt_3x4_path).toBe("showman/kit/alt.jpg");
    expect(r.obra.poster_3x4_path).toBe("showman/kit/p.jpg");
    expect((r.obra as Record<string, unknown>).raro).toBeUndefined();
    expect(r.obra.venue).toBe("Teatro IMSS");
    expect(r.obra.logo_path).toBe("a.png");
    expect(r.usa).toEqual(["poster", "datos"]);
    expect(capaDifusion(pub, {}).usa).toEqual([]);
  });
});
