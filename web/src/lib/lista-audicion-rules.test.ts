import { describe, expect, it } from "vitest";
import { armarLista, ordenValido, pasaCon, primeraDelTurno, type ListaApp } from "./lista-audicion-rules";

const app = (p: Partial<ListaApp> & { id: string; nombre: string }): ListaApp => ({
  numero: null, edad: null, estado: "convocado", horario: null, personajes: [], grupo: null, conRespuesta: null, grupoTurno: null, ...p,
});
const ana = app({ id: "a", nombre: "Ana", numero: 2, grupo: "Grupo B", personajes: ["Sandy"], grupoTurno: "g1" });
const caro = app({ id: "c", nombre: "Caro", numero: 2, grupo: "Grupo A", personajes: ["Rizzo", "Sandy"], grupoTurno: "g1" });
const luis = app({ id: "l", nombre: "Luis", numero: 1, grupo: "Grupo 10", personajes: ["Danny"], conRespuesta: "con mi hermano Beto" });
const beto = app({ id: "b", nombre: "Beto", numero: 3, conRespuesta: "Solo" });
const todos = [ana, caro, luis, beto];

describe("lista de audición", () => {
  it("con quién pasa: grupo de turno, luego la respuesta, luego Solo", () => {
    expect(pasaCon(ana, todos)).toBe("Caro");
    expect(pasaCon(luis, todos)).toBe("con mi hermano Beto");
    expect(pasaCon(beto, todos)).toBe("Solo");
  });
  it("por turno ordena por número y luego por nombre", () => {
    expect(armarLista(todos, "turno")[0].filas.map((f) => f.nombre)).toEqual(["Luis", "Ana", "Caro", "Beto"]);
  });
  it("por grupo usa orden natural y deja al final a quien no tiene grupo", () => {
    const s = armarLista(todos, "grupo");
    expect(armarLista([app({ id: "x", nombre: "X", grupo: "Grupo 10" }), app({ id: "y", nombre: "Y", grupo: "Grupo 2" })], "grupo").map((x) => x.titulo)).toEqual(["Grupo 2", "Grupo 10"]);
    expect(s.at(-1)?.titulo).toBe("Sin grupo");
    expect(s.at(-1)?.filas.map((f) => f.nombre)).toEqual(["Beto"]);
  });
  it("por personaje repite a quien audiciona para varios", () => {
    const s = armarLista(todos, "personaje");
    expect(s.find((x) => x.titulo === "Sandy")?.filas.map((f) => f.nombre)).toEqual(["Ana", "Caro"]);
    expect(s.find((x) => x.titulo === "Rizzo")?.filas.map((f) => f.nombre)).toEqual(["Caro"]);
  });
  it("el turno compartido se escribe una sola vez", () => {
    const f = armarLista(todos, "turno")[0].filas;
    expect(f.map((_, i) => primeraDelTurno(f, i))).toEqual([true, true, false, true]);
  });
  it("orden desconocido cae en turno", () => {
    expect(ordenValido("x")).toBe("turno");
    expect(ordenValido("grupo")).toBe("grupo");
  });
});
