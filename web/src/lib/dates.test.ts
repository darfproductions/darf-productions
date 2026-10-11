import { describe, expect, it } from "vitest";
import { isoToLocalMx, localMxToIso } from "./dates";

describe("fechas en hora de CDMX", () => {
  it("ida y vuelta", () => {
    const iso = localMxToIso("2027-05-22T19:00");
    expect(iso).toBe("2027-05-22T19:00:00-06:00");
    expect(isoToLocalMx(iso)).toBe("2027-05-22T19:00");
    expect(isoToLocalMx("2027-05-23T01:00:00+00:00")).toBe("2027-05-22T19:00");
  });
  it("rechaza fechas mal escritas", () => {
    expect(localMxToIso("22/05/2027")).toBeNull();
    expect(isoToLocalMx(null)).toBe("");
  });
});
