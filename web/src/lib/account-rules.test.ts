import { describe, expect, it } from "vitest";
import { funcionPasada, cuandoCumple, cumpleAnios, cumplesDelMes, emailOk, fechaNacimientoOk, passwordOk } from "./account-rules";

const hoy = new Date(2026, 9, 12); // 12 oct 2026

describe("datos de la cuenta", () => {
  it("revisa contraseña y correo", () => {
    expect(passwordOk("abc12345")).toBe(true);
    expect(passwordOk("abcdefgh")).toBe(false);
    expect(passwordOk("a1")).toBe(false);
    expect(emailOk("ana@darf.mx")).toBe(true);
    expect(emailOk("ana@darf")).toBe(false);
  });
  it("revisa la fecha de nacimiento", () => {
    expect(fechaNacimientoOk("2010-02-28", hoy)).toBe(true);
    expect(fechaNacimientoOk("2010-02-30", hoy)).toBe(false);
    expect(fechaNacimientoOk("2027-01-01", hoy)).toBe(false);
    expect(fechaNacimientoOk("1899-12-31", hoy)).toBe(false);
    expect(fechaNacimientoOk("10/02/2010", hoy)).toBe(false);
  });
});

describe("cumpleaños", () => {
  const xs = [
    { user_id: "a", nombre: "Beto", dia: 20, mes: 10 },
    { user_id: "b", nombre: "Ana", dia: 3, mes: 10 },
    { user_id: "c", nombre: "Caro", dia: 1, mes: 11 },
  ];
  it("filtra y ordena los del mes", () => {
    expect(cumplesDelMes(xs, 10).map((x) => x.nombre)).toEqual(["Ana", "Beto"]);
  });
  it("calcula edad y cuándo", () => {
    expect(cumpleAnios("2010-10-20", hoy)).toBe(16);
    expect(cumpleAnios(null, hoy)).toBeNull();
    expect(cuandoCumple({ dia: 12, mes: 10 }, hoy)).toBe("¡Hoy!");
    expect(cuandoCumple({ dia: 13, mes: 10 }, hoy)).toBe("Mañana");
    expect(cuandoCumple({ dia: 1, mes: 11 }, hoy)).toBe("En 20 días");
    expect(cuandoCumple({ dia: 3, mes: 10 }, hoy)).toBeNull();
  });
});

describe("funciones pasadas", () => {
  it("cuenta 6 horas después del inicio", () => {
    const ahora = new Date("2026-10-12T20:00:00Z");
    expect(funcionPasada("2026-10-12T15:00:00Z", ahora)).toBe(false);
    expect(funcionPasada("2026-10-12T13:00:00Z", ahora)).toBe(true);
    expect(funcionPasada(null, ahora)).toBe(false);
  });
});
