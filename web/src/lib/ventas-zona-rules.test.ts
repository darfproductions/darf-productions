import { describe, expect, it } from "vitest";
import { desglosePorZona, type FilaVentaZona } from "./ventas-zona-rules";

const zonas = [{ id: "vip", nombre: "VIP" }, { id: "gen", nombre: "General" }, { id: "bal", nombre: "Balcón" }];
const filas: FilaVentaZona[] = [
  { performance_id: "f1", zona_id: "vip", vendidos: 10, cortesias: 1, apartados: 2, ingresos: 3000 },
  { performance_id: "f1", zona_id: "gen", vendidos: 20, cortesias: 0, apartados: 0, ingresos: 1999.99 },
  { performance_id: "f2", zona_id: "vip", vendidos: 5, cortesias: 0, apartados: 1, ingresos: 1500.01 },
  { performance_id: "f2", zona_id: null, vendidos: 1, cortesias: 0, apartados: 0, ingresos: 100 },
];

describe("desglose de ventas por zona", () => {
  it("todas las funciones: suma cada zona y el total", () => {
    const d = desglosePorZona(filas, zonas, "");
    expect(d.zonas.map((z) => [z.nombre, z.vendidos, z.ingresos])).toEqual([["VIP", 15, 4500.01], ["General", 20, 1999.99], ["Balcón", 0, 0], ["Sin zona", 1, 100]]);
    expect(d.total).toEqual({ vendidos: 36, cortesias: 1, apartados: 3, ingresos: 6600 });
  });
  it("una función: solo sus boletos; las zonas sin venta salen en cero", () => {
    const d = desglosePorZona(filas, zonas, "f2");
    expect(d.zonas.map((z) => [z.nombre, z.vendidos, z.apartados])).toEqual([["VIP", 5, 1], ["General", 0, 0], ["Balcón", 0, 0], ["Sin zona", 1, 0]]);
    expect(d.total.ingresos).toBe(1600.01);
  });
  it("sin ventas: ceros", () => {
    expect(desglosePorZona([], zonas, "").total).toEqual({ vendidos: 0, cortesias: 0, apartados: 0, ingresos: 0 });
  });
});
