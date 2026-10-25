import { describe, expect, it } from "vitest";
import { conteoLocal, esFallaDeRed, marcarEntrada, resultadoSubida, unirLista, validarLocal, type ListaPuerta } from "./sin-conexion-rules";

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const lista: ListaPuerta = {
  funcion: "f1",
  descargada: "2026-10-25T01:00:00Z",
  boletos: [
    { t: T1, lugar: "A1", nombre: "Ana", entro: null },
    { t: T2, lugar: "A2", nombre: "Beto", entro: "2026-10-25T01:05:00Z" },
  ],
};

describe("puerta sin internet", () => {
  it("valida contra la lista: válido, ya entró y no está en la lista", () => {
    expect(validarLocal(lista, [], ` ${T1.toUpperCase()} `)).toEqual({ result: "ok", lugar: "A1", nombre: "Ana" });
    expect(validarLocal(lista, [], T2)).toMatchObject({ result: "ya_usado", entro: "2026-10-25T01:05:00Z" });
    expect(validarLocal(lista, [], "33333333-3333-3333-3333-333333333333")).toEqual({ result: "no_en_lista" });
  });

  it("no deja pasar dos veces en el mismo celular aunque aún no se suba", () => {
    const fila = [{ token: T1, funcion: "f1", at: "2026-10-25T01:10:00Z" }];
    expect(validarLocal(lista, fila, T1)).toMatchObject({ result: "ya_usado", entro: "2026-10-25T01:10:00Z" });
    // Una entrada de otra función no cuenta.
    expect(validarLocal(lista, [{ ...fila[0], funcion: "f2" }], T1).result).toBe("ok");
  });

  it("marca, une la lista nueva con lo pendiente y cuenta", () => {
    const m = marcarEntrada(lista, T1, "2026-10-25T01:11:00Z");
    expect(m.boletos[0].entro).toBe("2026-10-25T01:11:00Z");
    expect(marcarEntrada(m, T1, "2026-10-25T02:00:00Z").boletos[0].entro).toBe("2026-10-25T01:11:00Z");
    const fila = [{ token: T1, funcion: "f1", at: "2026-10-25T01:12:00Z" }];
    expect(unirLista(lista, fila).boletos[0].entro).toBe("2026-10-25T01:12:00Z");
    expect(conteoLocal(lista, [])).toEqual({ vendidos: 2, entraron: 1 });
    expect(conteoLocal(lista, fila)).toEqual({ vendidos: 2, entraron: 2 });
  });

  it("al subir: registrada, doble entrada de otro celular o rechazada", () => {
    const at = "2026-10-25T01:20:00Z";
    expect(resultadoSubida({ result: "ok" }, at)).toBe("subida");
    // La base la tiene de unos segundos después: fue este celular (la validación en línea llegó tarde).
    expect(resultadoSubida({ result: "ya_usado", checked_in_at: "2026-10-25T01:20:02Z" }, at)).toBe("subida");
    expect(resultadoSubida({ result: "ya_usado", checked_in_at: "2026-10-25T01:02:00Z" }, at)).toBe("doble");
    expect(resultadoSubida({ result: "cancelado" }, at)).toBe("rechazada");
  });

  it("distingue fallas de red de respuestas de la base", () => {
    expect(esFallaDeRed(null)).toBe(true);
    expect(esFallaDeRed({ result: "error", message: "No se pudo validar. Revisa la conexión e intenta de nuevo." })).toBe(true);
    expect(esFallaDeRed({ result: "error", message: "Este boleto no es de una obra en la que puedas validar." })).toBe(false);
    expect(esFallaDeRed({ result: "ok" })).toBe(false);
  });
});
