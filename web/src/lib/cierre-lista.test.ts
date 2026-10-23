import { describe, expect, it } from "vitest";
import { listaCierre, type DatosCierre } from "./cierre-lista";

const limpio: DatosCierre = { pid: "obra", ordenesPendientes: 0, funcionesPorVenir: 0, reembolsos: 0, adeudos: 0, ofertasSinResponder: 0, documentosPorRevisar: 0, fotosGaleria: 12, creditos: 30 };

describe("lista antes del cierre", () => {
  it("todo resuelto", () => {
    const r = listaCierre(limpio);
    expect(r.puedeCerrar).toBe(true);
    expect(r.pendientes).toBe(0);
  });
  it("solo las órdenes por aprobar impiden cerrar", () => {
    const r = listaCierre({ ...limpio, ordenesPendientes: 2, adeudos: 1, fotosGaleria: 0 });
    expect(r.puedeCerrar).toBe(false);
    expect(r.pendientes).toBe(3);
    expect(r.puntos.find((p) => p.clave === "ordenes")!.detalle).toContain("2 órdenes esperan");
    expect(r.puntos.find((p) => p.clave === "adeudos")!.detalle).toBe("1 persona con pagos vencidos.");
    expect(listaCierre({ ...limpio, adeudos: 5, reembolsos: 1 }).puedeCerrar).toBe(true);
  });
  it("beneficios pagados sin entregar impiden cerrar (0125)", () => {
    const r = listaCierre({ ...limpio, beneficiosPendientes: 3, beneficiosVencidos: 1 });
    expect(r.puedeCerrar).toBe(false);
    expect(r.puntos.find((p) => p.clave === "beneficios")!.detalle).toContain("3 beneficios pagados faltan por entregar (1 ya venció)");
  });
});
