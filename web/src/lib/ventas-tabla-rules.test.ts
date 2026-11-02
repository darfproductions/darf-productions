import { describe, expect, it } from "vitest";
import { filasTabla, filtrarTabla, resumenZonas, totalesTabla, type OrdenTabla } from "./ventas-tabla-rules";

const zonas = [{ id: "vip", nombre: "VIP", orden: 1 }, { id: "pre", nombre: "Preferente", orden: 2 }, { id: "gen", nombre: "General", orden: 3 }];
const orden = (o: Partial<OrdenTabla> & Pick<OrdenTabla, "id" | "boletos" | "total">): OrdenTabla => ({
  order_code: `DARF-${o.id}`, performance_id: "f1", status: "aprobado", created_at: "2026-10-26T16:00:00Z", buyer_nombre: "Ana",
  buyer_telefono: "4421818825", metodo_pago: "transferencia", referencia: null, vendedor: null, ...o,
});
const b = (zona_id: string, precio: number, n: number) => Array.from({ length: n }, () => ({ zona_id, precio }));

describe("tabla de ventas", () => {
  it("una fila por orden y tipo de boleto, como la hoja de Excel", () => {
    const filas = filasTabla([orden({ id: "A", total: 2550, boletos: [...b("gen", 250, 6), ...b("pre", 350, 3)] })], zonas);
    expect(filas.map((f) => [f.zona, f.cantidad, f.precio, f.bruto, f.neto])).toEqual([["Preferente", 3, 350, 1050, 1050], ["General", 6, 250, 1500, 1500]]);
  });

  it("con descuento: el neto se reparte por precio y la orden suma exacto", () => {
    const filas = filasTabla([orden({ id: "B", total: 1000, boletos: [...b("vip", 400, 1), ...b("pre", 350, 2)] })], zonas);
    expect(filas.reduce((s, f) => s + f.neto, 0)).toBe(1000);
    expect(filas[0].neto).toBe(363.64);
    expect(totalesTabla(filas).descuentos).toBe(100);
  });

  it("filtra por función y por aprobadas / por aprobar; los totales cuadran por método de pago", () => {
    const filas = filasTabla([
      orden({ id: "C", total: 4800, metodo_pago: "deposito", boletos: b("vip", 400, 12) }),
      orden({ id: "D", total: 1200, metodo_pago: "efectivo", boletos: b("vip", 400, 3), performance_id: "f2" }),
      orden({ id: "E", total: 7200, status: "pendiente", metodo_pago: null, boletos: b("vip", 400, 18) }),
      orden({ id: "F", total: 0, status: "rechazado", boletos: [] }),
    ], zonas);
    const aprobadas = totalesTabla(filtrarTabla(filas, { funcion: "", pendientes: false }));
    expect([aprobadas.boletos, aprobadas.neto, aprobadas.ordenes]).toEqual([15, 6000, 2]);
    expect(aprobadas.porMetodo).toEqual([{ metodo: "deposito", boletos: 12, neto: 4800 }, { metodo: "efectivo", boletos: 3, neto: 1200 }]);
    expect(totalesTabla(filtrarTabla(filas, { funcion: "", pendientes: true })).neto).toBe(13200);
    expect(totalesTabla(filtrarTabla(filas, { funcion: "f2", pendientes: true })).boletos).toBe(3);
  });
});

describe("resumen por zona", () => {
  it("cada zona con sus órdenes; cortesías y por aprobar aparte; zonas sin venta en cero", () => {
    const filas = filasTabla([
      orden({ id: "A", total: 800, boletos: b("vip", 400, 2) }),
      orden({ id: "B", total: 0, metodo_pago: "cortesia", boletos: b("vip", 400, 1) }),
      orden({ id: "C", total: 350, status: "pendiente", metodo_pago: null, boletos: b("pre", 350, 1) }),
    ], zonas);
    const r = resumenZonas(filas, zonas);
    expect(r.map((z) => [z.nombre, z.boletos, z.cortesias, z.porAprobar, z.dinero, z.filas.length])).toEqual([
      ["VIP", 2, 1, 0, 800, 2], ["Preferente", 0, 0, 1, 350, 1], ["General", 0, 0, 0, 0, 0],
    ]);
  });
});
