import { describe, expect, it } from "vitest";
import { listoParaVender, type DatosVenta } from "./listo-vender";

const ahora = new Date("2026-10-13T12:00:00Z");
const base: DatosVenta = {
  pid: "obra", estado: "publicada", kitFaltan: [], whatsapp: true, posterDestacado: false, ahora,
  fecha: (iso) => iso.slice(0, 10),
  zonas: [{ id: "vip", nombre: "VIP", is_active: true, cupo: null }, { id: "pista", nombre: "Pista", is_active: true, cupo: 80 }],
  asientos: { total: 100, sinZona: 0, zonas: ["vip"] },
  funciones: [{ id: "f1", starts_at: "2026-10-20T01:00:00Z", on_sale: true, cancelada_at: null, prices: [{ categoryId: "vip" }, { categoryId: "pista" }] }],
};
const punto = (d: DatosVenta, c: string) => listoParaVender(d).puntos.find((p) => p.clave === c)!;

describe("listo para vender", () => {
  it("todo en orden: lista (el póster es opcional)", () => {
    const r = listoParaVender(base);
    expect(r.listo).toBe(true);
    expect(r.faltan).toBe(0);
    expect(punto(base, "poster").ok).toBe(false);
  });
  it("señala la función a la que le falta precio en una zona", () => {
    const d = { ...base, funciones: [{ ...base.funciones[0], prices: [{ categoryId: "vip" }] }] };
    expect(punto(d, "precios").ok).toBe(false);
    expect(punto(d, "precios").detalle).toBe("2026-10-20: falta Pista");
    expect(listoParaVender(d).listo).toBe(false);
  });
  it("las funciones pasadas o canceladas no cuentan", () => {
    const d = { ...base, funciones: [{ ...base.funciones[0], starts_at: "2026-10-01T01:00:00Z" }, { ...base.funciones[0], id: "f2", cancelada_at: "2026-10-10T00:00:00Z" }] };
    expect(punto(d, "funciones").ok).toBe(false);
    expect(punto(d, "venta").ok).toBe(false);
  });
  it("borrador, asientos sin zona, sin lugares y sin WhatsApp", () => {
    const d = { ...base, estado: "borrador", whatsapp: false, zonas: [], asientos: { total: 0, sinZona: 0, zonas: [] } };
    const r = listoParaVender(d);
    expect(r.puntos.filter((p) => !p.ok).map((p) => p.clave)).toEqual(["publicada", "lugares", "precios", "whatsapp", "poster"]);
    expect(punto({ ...base, asientos: { total: 100, sinZona: 3, zonas: ["vip"] } }, "zonas").detalle).toBe("3 asientos sin zona.");
  });
});
