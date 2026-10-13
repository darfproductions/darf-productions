import { describe, expect, it } from "vitest";
import { mensajeError, pareceEspanol } from "./errores";

describe("mensajeError", () => {
  it("deja pasar los avisos en español de la base", () => {
    expect(mensajeError({ message: "La función no está disponible para venta", code: "P0001" })).toBe("La función no está disponible para venta");
    expect(mensajeError({ message: "Ya tienes 3 solicitudes pendientes de pago", code: "P0001" })).toMatch(/^Ya tienes/);
  });
  it("traduce lo técnico", () => {
    expect(mensajeError({ message: "TypeError: fetch failed" })).toMatch(/conexión/);
    expect(mensajeError({ message: "JWT expired", code: "PGRST301" })).toMatch(/sesión expiró/);
    expect(mensajeError({ message: 'new row violates row-level security policy for table "x"', code: "42501" })).toMatch(/permiso/);
    expect(mensajeError({ message: 'duplicate key value violates unique constraint "x"', code: "23505" })).toMatch(/ya estaba/);
    expect(mensajeError("The object exceeded the maximum allowed size")).toMatch(/demasiado grande/);
    expect(mensajeError({ message: "Something odd happened" })).toMatch(/Algo salió mal/);
    expect(mensajeError(null, "Otro general")).toBe("Otro general");
  });
  it("detecta español", () => {
    expect(pareceEspanol("Elige cuántos boletos")).toBe(true);
    expect(pareceEspanol("permission denied for table orders")).toBe(false);
  });
});
