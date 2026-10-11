import { describe, expect, it } from "vitest";
import { ageAt, lugares, score } from "./audition-rules";

describe("audiciones", () => {
  it("edad cumplida a la fecha de la audición", () => {
    expect(ageAt("2010-05-20", new Date("2027-05-19T12:00:00Z"))).toBe(16);
    expect(ageAt("2010-05-20", new Date("2027-05-20T12:00:00Z"))).toBe(17);
    expect(ageAt("20/05/2010")).toBeNull();
  });
  it("lugares disponibles nunca negativos", () => {
    expect(lugares(10, 3)).toBe(7);
    expect(lugares(1, 2)).toBe(0);
  });
  it("promedios legibles", () => {
    expect(score("4.50")).toBe("4.5");
    expect(score(4)).toBe("4");
    expect(score(null)).toBe("—");
  });
});
