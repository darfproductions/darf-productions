import { describe, expect, it } from "vitest";
import type { SaleOrder } from "@/lib/sales";
import { asistenciaTotal, conteo, descuentosUsados, ventasPorCanal } from "./report-rules";

const order = (o: Partial<SaleOrder>): SaleOrder => ({
  id: "o", order_code: "A", performance_id: "f1", status: "aprobado", buyer_nombre: "x", buyer_telefono: "1",
  total: 100, discount_codigo: null, discount_amount: 0, created_at: "2026-10-01", created_by_staff_id: null,
  tickets: [{ id: "t", is_active: true, checked_in_at: null, seat_label: null }], ...o,
});

describe("descuentosUsados", () => {
  it("cuenta solo órdenes aprobadas y ordena por usos", () => {
    const r = descuentosUsados([
      order({ discount_codigo: "AMIGOS", discount_amount: 20, total: 80 }),
      order({ discount_codigo: "AMIGOS", discount_amount: 20, total: 180 }),
      order({ discount_codigo: "PRENSA", discount_amount: 50, total: 50 }),
      order({ discount_codigo: "PRENSA", status: "pendiente" }),
      order({}),
    ]);
    expect(r).toEqual([
      { codigo: "AMIGOS", usos: 2, descontado: 40, ingresos: 260 },
      { codigo: "PRENSA", usos: 1, descontado: 50, ingresos: 50 },
    ]);
  });
});

describe("ventasPorCanal", () => {
  it("separa en línea y taquilla, sin boletos cancelados", () => {
    const r = ventasPorCanal([
      order({ total: 200, tickets: [{ id: "a", is_active: true, checked_in_at: null, seat_label: null }, { id: "b", is_active: false, checked_in_at: null, seat_label: null }] }),
      order({ created_by_staff_id: "u", total: 50 }),
      order({ status: "rechazado" }),
    ]);
    expect(r.web).toEqual({ ordenes: 1, boletos: 1, ingresos: 200 });
    expect(r.taquilla).toEqual({ ordenes: 1, boletos: 1, ingresos: 50 });
  });
});

describe("asistenciaTotal y conteo", () => {
  it("suma la asistencia", () => {
    expect(asistenciaTotal([{ presentes: 3, retardos: 1, faltas: 0, justificadas: 1 }, { presentes: 1, retardos: 0, faltas: 2, justificadas: 0 }]))
      .toEqual({ presentes: 4, retardos: 1, faltas: 2, justificadas: 1 });
  });
  it("cuenta por estado", () => {
    const m = conteo<string>([{ estado: "inscrito" }, { estado: "inscrito" }, { estado: "callback" }]);
    expect(m.get("inscrito")).toBe(2);
    expect(m.get("callback")).toBe(1);
    expect(m.get("cancelado")).toBeUndefined();
  });
});
