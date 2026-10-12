import { describe, expect, it } from "vitest";
import { ocupacionTemporada, pct, totales, type OverviewRow } from "./season-rules";

const row = (o: Partial<OverviewRow>): OverviewRow => ({
  production_id: "x", nombre: "X", estado: "publicada", funciones: 0, funciones_futuras: 0, asientos: 0, boletos: 0, asistieron: 0,
  ingresos: 0, pendientes: 0, cobrado_taller: 0, integrantes_activos: 0, solicitudes: 0, cerrado_at: null, ...o,
});

describe("reporte general", () => {
  it("porcentajes", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBeNull();
    expect(ocupacionTemporada(300, 200, 3)).toBe(50);
    expect(ocupacionTemporada(10, 0, 3)).toBeNull();
  });
  it("suma las obras (los montos pueden llegar como texto)", () => {
    const t = totales([row({ boletos: 10, ingresos: 1000, cobrado_taller: 500 }), row({ boletos: 5, ingresos: "250.50" as unknown as number })]);
    expect(t.boletos).toBe(15);
    expect(t.ingresos).toBe(1250.5);
    expect(t.cobrado_taller).toBe(500);
  });
});
