import { describe, expect, it } from "vitest";
import { esPaseClub, etiquetaBoleto, funcionDePuerta } from "./door-rules";

const f = [
  { id: "a", starts_at: "2026-11-02T00:00:00Z" },
  { id: "b", starts_at: "2026-11-03T19:00:00Z" },
  { id: "c", starts_at: "2026-11-26T01:30:00Z" },
];

describe("funcionDePuerta", () => {
  it("la de hoy", () => expect(funcionDePuerta(f, new Date("2026-11-03T17:00:00Z"))).toBe("b"));
  it("la siguiente si hoy no hay", () => expect(funcionDePuerta(f, new Date("2026-11-10T12:00:00Z"))).toBe("c"));
  it("la última si todas pasaron", () => expect(funcionDePuerta(f, new Date("2027-01-01T00:00:00Z"))).toBe("c"));
  it("sin funciones", () => expect(funcionDePuerta([], new Date())).toBeNull());
});

describe("etiquetaBoleto", () => {
  it("no repite la zona", () => expect(etiquetaBoleto("General · Pista", "Pista")).toBe("General · Pista"));
  it("asiento con zona", () => expect(etiquetaBoleto("C-8", "Preferente")).toBe("C-8 · Preferente"));
});

describe("pase del Club Fan o boleto (0110)", () => {
  it("distingue boletos y pases", () => {
    expect(esPaseClub("3f2a9c1e-8b7d-4c6a-9e5f-1a2b3c4d5e6f")).toBe(false);
    expect(esPaseClub("https://darfproductions.com/g/" + "a".repeat(64))).toBe(true);
    expect(esPaseClub("drf-k7m2")).toBe(true);
    expect(esPaseClub("FAN-AB23")).toBe(true);
    expect(esPaseClub("b".repeat(64))).toBe(true);
    expect(esPaseClub("hola")).toBe(false);
  });
});
