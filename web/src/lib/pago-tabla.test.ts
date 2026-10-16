import { describe, expect, it } from "vitest";
import { columnas, fila, leerCasilla, valorCasilla } from "./pago-tabla";

const fee = { monto: 600, desde: "2026-09-01", hasta: "2027-01-01", dia_limite: 10, inscripcion: 600, vence_sabado: true };
const hoy = new Date("2026-10-15T18:00:00Z");
const libre = { beca: false, cuota_especial: null };

describe("tabla de pagos (0112)", () => {
  it("columnas: inscripción y los meses del taller", () => {
    expect(columnas(fee).map((c) => c.clave)).toEqual(["insc", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(columnas({ ...fee, inscripcion: 0 })[0].clave).toBe("2026-09-01");
  });
  it("estado de cada casilla como la hoja", () => {
    const pagos = [{ periodo: "2026-08-01", monto: 600, concepto: "inscripcion" as const }, { periodo: "2026-09-01", monto: 600, concepto: "mensualidad" as const }];
    const f = fila(fee, columnas(fee), libre, pagos, { ingreso: "2026-08-22", baja_at: null }, hoy);
    expect(f[0]).toEqual({ tipo: "pagado" });
    expect(f[1]).toEqual({ tipo: "pagado" });
    expect(f[2]).toEqual({ tipo: "pendiente", monto: 600, vencido: true });
    expect(f[3]).toMatchObject({ tipo: "pendiente", vencido: false });
  });
  it("baja, beca e ingreso tarde", () => {
    const baja = fila(fee, columnas(fee), libre, [], { ingreso: "2026-08-22", baja_at: "2026-09-30" }, hoy);
    expect(baja.map((c) => c.tipo)).toEqual(["pendiente", "pendiente", "no_aplica", "no_aplica", "no_aplica", "no_aplica"]);
    const beca = fila(fee, columnas(fee), { beca: true, cuota_especial: null, sin_inscripcion: true }, [], null, hoy);
    expect(beca.map((c) => c.tipo)).toEqual(["no_aplica", "beca", "beca", "beca", "beca", "beca"]);
    const tarde = fila(fee, columnas(fee), libre, [], { ingreso: "2026-10-03", baja_at: null }, hoy);
    expect(tarde[1].tipo).toBe("no_aplica");
  });
  it("casillas: ida y vuelta, y rechaza basura", () => {
    const c = columnas(fee)[2];
    const v = valorCasilla("f:00000000-0000-0000-0000-00000000a101", c, 600);
    expect(leerCasilla(v)).toEqual({ quien: "f", id: "00000000-0000-0000-0000-00000000a101", concepto: "mensualidad", periodo: "2026-10-01", monto: 600 });
    expect(leerCasilla("x|mensualidad|2026-10-01|600")).toBeNull();
    expect(leerCasilla("u:00000000-0000-0000-0000-00000000a101|mensualidad|2026-10-01|-5")).toBeNull();
  });
});
