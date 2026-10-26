import { describe, expect, it } from "vitest";
import { preciosDistintos } from "./zona-precio-rules";

describe("precio de zona", () => {
  it("cuenta las funciones con otro precio (Showman: Orquesta a $300 con precio de zona $350)", () => {
    expect(preciosDistintos(350, [300, 300])).toEqual({ n: 2, precios: [300] });
    expect(preciosDistintos(300, [300, 300])).toEqual({ n: 0, precios: [] });
    expect(preciosDistintos(400, [300, 350, 400])).toEqual({ n: 2, precios: [300, 350] });
  });
});
