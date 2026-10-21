import { describe, expect, it } from "vitest";
import { capacidadFuncion, ingresoPotencial, occupancy, summarizeSales, type SaleOrder } from "./sales";

const t = (id: string, active = true, checked: string | null = null) => ({ id, is_active: active, checked_in_at: checked, seat_label: id });
const base: Omit<SaleOrder, "id" | "status" | "total" | "tickets" | "performance_id"> = {
  order_code: "DARF-1", buyer_nombre: "A", buyer_telefono: "1", discount_codigo: null, discount_amount: 0, created_at: "2026-10-11", created_by_staff_id: null,
};

describe("resumen de ventas", () => {
  it("suma aprobadas, aparta pendientes e ignora rechazadas", () => {
    const s = summarizeSales([
      { ...base, id: "1", performance_id: "f1", status: "aprobado", total: 500, tickets: [t("A1", true, "x"), t("A2")] },
      { ...base, id: "2", performance_id: "f1", status: "pendiente", total: 250, tickets: [t("A3")] },
      { ...base, id: "3", performance_id: "f2", status: "rechazado", total: 999, tickets: [t("A4", false)] },
      { ...base, id: "4", performance_id: "f2", status: "aprobado", total: 250, tickets: [t("B1"), t("B2", false)] },
    ]);
    expect(s.ingresos).toBe(750);
    expect(s.pendiente).toBe(250);
    expect(s.vendidos).toBe(3);
    expect(s.apartados).toBe(1);
    expect(s.validados).toBe(1);
    expect(s.ordenesPendientes).toBe(1);
    expect(s.porFuncion.get("f1")).toEqual({ vendidos: 2, apartados: 1, ingresos: 500, validados: 1 });
  });
  it("ocupación legible", () => {
    expect(occupancy(120, 400)).toBe("120 de 400 (30 %)");
    expect(occupancy(5, 0)).toBe("5");
  });
});

describe("capacidad con entrada general", () => {
  it("suma asientos y cupo de zonas generales con precio; el cupo de la función manda", () => {
    const zonas = [{ id: "pref", cupo: null, is_active: true }, { id: "pista", cupo: 80, is_active: true }, { id: "gradas", cupo: 50, is_active: false }];
    expect(capacidadFuncion(200, [{ categoryId: "pref", cupo: null }], zonas)).toBe(200);
    expect(capacidadFuncion(200, [{ categoryId: "pref", cupo: null }, { categoryId: "pista", cupo: null }], zonas)).toBe(280);
    expect(capacidadFuncion(200, [{ categoryId: "pista", cupo: 30 }], zonas)).toBe(230);
    expect(capacidadFuncion(200, [{ categoryId: "gradas", cupo: null }], zonas)).toBe(200);
  });
});

describe("ingreso si se vende todo (0117)", () => {
  it("asientos × precio y entrada general con su cupo", () => {
    const asientos = new Map([["vip", 10], ["gen", 40], ["sin", 5]]);
    const zonas = [
      { id: "vip", cupo: null, is_active: true }, { id: "gen", cupo: null, is_active: true }, { id: "sin", cupo: null, is_active: true },
      { id: "pista", cupo: 80, is_active: true }, { id: "off", cupo: 20, is_active: false },
    ];
    const precios = [
      { categoryId: "vip", price: 500, cupo: null }, { categoryId: "gen", price: 250, cupo: null },
      { categoryId: "pista", price: 100, cupo: 60 }, { categoryId: "off", price: 50, cupo: null },
    ];
    expect(ingresoPotencial(asientos, precios, zonas)).toEqual({ lugares: 110, total: 10 * 500 + 40 * 250 + 60 * 100, sinPrecio: 5 });
  });
});
