import { describe, expect, it } from "vitest";
import { esMetodo, estadoOrden, funcionVendible, mensajeOrden, metodoLabel, puedeExtender, textoBusqueda } from "./ventas-rules";

describe("estadoOrden", () => {
  it("nombra cada caso", () => {
    expect(estadoOrden({ status: "pendiente" })).toBe("Por aprobar");
    expect(estadoOrden({ status: "pendiente" }, "comprador")).toBe("Apartada");
    expect(estadoOrden({ status: "aprobado" }, "comprador")).toBe("Pagada");
    expect(estadoOrden({ status: "rechazado", vencida_at: "2026-10-01" })).toBe("Vencida");
    expect(estadoOrden({ status: "rechazado", cancelada_por_comprador_at: "x" })).toBe("La canceló el comprador");
    expect(estadoOrden({ status: "rechazado", cancelada_por_comprador_at: "x" }, "comprador")).toBe("La cancelaste");
    expect(estadoOrden({ status: "rechazado" })).toBe("Cancelada");
  });
});

describe("puedeExtender", () => {
  it("pendiente o vencida, nunca la que canceló el comprador", () => {
    expect(puedeExtender({ status: "pendiente" })).toBe(true);
    expect(puedeExtender({ status: "rechazado", vencida_at: "x" })).toBe(true);
    expect(puedeExtender({ status: "rechazado" })).toBe(false);
    expect(puedeExtender({ status: "rechazado", vencida_at: "x", cancelada_por_comprador_at: "y" })).toBe(false);
    expect(puedeExtender({ status: "aprobado" })).toBe(false);
  });
});

describe("métodos", () => {
  it("etiquetas y validación", () => {
    expect(metodoLabel("efectivo")).toBe("Efectivo");
    expect(metodoLabel(null)).toBeNull();
    expect(esMetodo("cortesia")).toBe(true);
    expect(esMetodo("bitcoin")).toBe(false);
  });
});

describe("funcionVendible", () => {
  const ahora = new Date("2026-10-13T20:00:00Z");
  it("solo futuras, en venta y de obras vigentes", () => {
    expect(funcionVendible({ on_sale: true, starts_at: "2026-10-14T02:00:00Z" }, false, ahora)).toBe(true);
    expect(funcionVendible({ on_sale: true, starts_at: "2026-10-13T19:00:00Z" }, false, ahora)).toBe(false);
    expect(funcionVendible({ on_sale: false, starts_at: "2026-10-14T02:00:00Z" }, false, ahora)).toBe(false);
    expect(funcionVendible({ on_sale: true, starts_at: null }, false, ahora)).toBe(false);
    expect(funcionVendible({ on_sale: true, starts_at: "2026-10-14T02:00:00Z" }, true, ahora)).toBe(false);
  });
});

describe("mensajes de WhatsApp de una orden", () => {
  const o = { order_code: "DARF-AB12CD", buyer_nombre: "Ana López", total: 450 };
  it("recordar el pago y confirmar", () => {
    const r = mensajeOrden("recordar", o, { obra: "Showman", funcion: "Viernes, 22 de noviembre", limite: "hoy 8:00 p.m.", liga: "https://darfproductions.com/cuenta" });
    expect(r).toContain("¡Hola Ana!");
    expect(r).toContain("$450");
    expect(r).toContain("hasta hoy 8:00 p.m. ¿Nos");
    expect(mensajeOrden("aprobada", o, { obra: "Showman", funcion: "Viernes", liga: "https://darfproductions.com/cuenta" })).toContain("quedó confirmado");
  });
  it("búsqueda limpia", () => {
    expect(textoBusqueda(" Ana,(López)* ")).toBe("Ana López");
  });
});
