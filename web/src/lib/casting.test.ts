import { describe, expect, it } from "vitest";
import { offerLabel } from "./casting-rules";

describe("ofertas", () => {
  it("etiqueta legible", () => {
    expect(offerLabel({ tipo: "reparto", papel: "Jenny Lind" })).toBe("Reparto · Jenny Lind");
    expect(offerLabel({ tipo: "ensamble", papel: null })).toBe("Ensamble");
  });
});
