import { describe, expect, it } from "vitest";
import { limiteTexto, recordatorio, tiempoRestante } from "./expiry-rules";

const ahora = new Date("2026-10-12T18:00:00Z"); // 12 oct, 12:00 en CDMX

describe("vencimiento", () => {
  it("tiempo restante", () => {
    expect(tiempoRestante("2026-10-13T17:10:00Z", ahora)).toBe("23 h 10 min");
    expect(tiempoRestante("2026-10-12T18:45:00Z", ahora)).toBe("45 min");
    expect(tiempoRestante("2026-10-12T20:00:00Z", ahora)).toBe("2 h");
    expect(tiempoRestante("2026-10-12T17:00:00Z", ahora)).toBeNull();
    expect(tiempoRestante(null, ahora)).toBeNull();
  });
  it("límite en palabras", () => {
    expect(limiteTexto("2026-10-12T23:00:00Z", ahora)).toMatch(/^hoy /);
    expect(limiteTexto("2026-10-13T17:00:00Z", ahora)).toMatch(/^mañana /);
  });
});

describe("recordatorio", () => {
  it("solo los próximos 7 días", () => {
    expect(recordatorio("2026-10-13T02:00:00Z", ahora)).toBe("Hoy"); // 12 oct 8 pm CDMX
    expect(recordatorio("2026-10-14T02:00:00Z", ahora)).toBe("Mañana");
    expect(recordatorio("2026-10-16T02:00:00Z", ahora)).toBe("En 3 días");
    expect(recordatorio("2026-10-30T02:00:00Z", ahora)).toBeNull();
    expect(recordatorio("2026-10-10T02:00:00Z", ahora)).toBeNull();
    expect(recordatorio(null, ahora)).toBeNull();
  });
});
