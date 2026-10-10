import { describe, expect, it } from "vitest";
import { formatMoney, groupSeatsByRow, previewDiscount, whatsappPayUrl } from "./tickets";

describe("pago por WhatsApp", () => {
  it("sin número configurado no genera enlace (DEV)", () => {
    expect(whatsappPayUrl("", { prodName: "Showman", orderCode: "DARF-1", seats: [], total: 0 })).toBe("");
  });

  it("arma el mismo mensaje que la 1.0", () => {
    const url = whatsappPayUrl("5210000000000", {
      prodName: "Showman",
      orderCode: "DARF-ABC123",
      seats: ["VIP-B-12", "VIP-B-13"],
      total: 800,
      buyerPhone: "4420000000",
    });
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(url.startsWith("https://wa.me/5210000000000?text=")).toBe(true);
    expect(text).toContain("Código de orden: DARF-ABC123");
    expect(text).toContain("Asientos: VIP-B-12, VIP-B-13");
    expect(text).toContain(`Total: ${formatMoney(800)}`);
    expect(text).toContain("Teléfono: 4420000000");
  });
});

describe("vista previa de descuento", () => {
  const prices: Record<string, number> = { vip: 400, gen: 250 };
  const priceOf = (id: string) => prices[id];

  it("aplica el porcentaje solo a las zonas del código", () => {
    const d = { codigo: "X", percent: 10, max_tickets_per_order: null, category_ids: ["vip"] };
    expect(previewDiscount(d, [{ price_category_id: "vip" }, { price_category_id: "gen" }], priceOf)).toEqual({ amount: 40, note: "" });
  });

  it("sin zonas en el código aplica a todas", () => {
    const d = { codigo: "X", percent: 10, max_tickets_per_order: null, category_ids: null };
    expect(previewDiscount(d, [{ price_category_id: "vip" }, { price_category_id: "gen" }], priceOf).amount).toBe(65);
  });

  it("respeta el máximo de boletos por compra", () => {
    const d = { codigo: "X", percent: 10, max_tickets_per_order: 1, category_ids: null };
    const r = previewDiscount(d, [{ price_category_id: "vip" }, { price_category_id: "gen" }], priceOf);
    expect(r.amount).toBe(0);
    expect(r.note).toContain("máximo 1");
  });

  it("avisa si no aplica a los asientos elegidos", () => {
    const d = { codigo: "X", percent: 10, max_tickets_per_order: null, category_ids: ["otra"] };
    expect(previewDiscount(d, [{ price_category_id: "vip" }], priceOf).note).toContain("no aplica");
  });
});

describe("mapa de asientos", () => {
  it("agrupa por fila y bloque, ordenando por número", () => {
    const s = (id: string, row: string, n: number, lado: string) => ({ id, seat_label: id, seat_row: row, seat_number: n, lado, price_category_id: null });
    const g = groupSeatsByRow([s("b2", "B", 2, "central"), s("a1", "A", 1, "izquierda"), s("b1", "B", 1, "central")]);
    expect(g.map((r) => r.row)).toEqual(["A", "B"]);
    expect(g[1].blocks[1].map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(g[0].blocks[0].map((x) => x.id)).toEqual(["a1"]);
  });
});
