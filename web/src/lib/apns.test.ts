import { describe, expect, it } from "vitest";
import { tokenInvalido } from "./apns";

describe("APNs", () => {
  it("da de baja solo los teléfonos que Apple ya no reconoce", () => {
    expect(tokenInvalido(410, "Unregistered")).toBe(true);
    expect(tokenInvalido(400, "BadDeviceToken")).toBe(true);
    expect(tokenInvalido(400, "BadTopic")).toBe(false);
    expect(tokenInvalido(429, "TooManyRequests")).toBe(false);
    expect(tokenInvalido(500, null)).toBe(false);
  });
});
