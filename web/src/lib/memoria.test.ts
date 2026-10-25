import { afterEach, describe, expect, it, vi } from "vitest";
import { memoriaCorta } from "./memoria";

describe("memoria corta por persona", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("calcula una vez por clave dentro del plazo (también si llegan juntas) y de nuevo después", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T18:00:00Z") });
    const m = memoriaCorta<number>(30_000);
    let n = 0;
    const calc = async () => ++n;
    expect(await Promise.all([m.get("u1", calc), m.get("u1", calc)])).toEqual([1, 1]);
    expect(await m.get("u2", calc)).toBe(2);
    vi.setSystemTime(new Date("2026-10-25T18:00:29Z"));
    expect(await m.get("u1", calc)).toBe(1);
    vi.setSystemTime(new Date("2026-10-25T18:00:31Z"));
    expect(await m.get("u1", calc)).toBe(3);
  });

  it("no guarda los errores y se puede olvidar", async () => {
    const m = memoriaCorta<string>(60_000);
    await expect(m.get("u1", async () => { throw new Error("base"); })).rejects.toThrow("base");
    expect(await m.get("u1", async () => "ok")).toBe("ok");
    m.olvidar("u1");
    expect(await m.get("u1", async () => "nuevo")).toBe("nuevo");
  });
});
