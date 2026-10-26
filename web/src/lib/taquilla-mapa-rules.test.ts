import { describe, expect, it } from "vitest";
import { planoTaquilla, textoQuedan, tintaSobre, type AsientoTaquilla } from "./taquilla-mapa-rules";

const a = (id: string, fila: string, numero: number, lado = "central"): AsientoTaquilla => ({ id, x: null, y: null, fila, numero, lado, zona: "z" });

describe("mapa de la taquilla", () => {
  it("cuadrícula: cada asiento conserva su número y la fila lleva su letra a los dos lados", () => {
    const p = planoTaquilla([a("1", "A", 1), a("2", "A", 2), a("3", "B", 1), a("4", "B", 2), a("5", "B", 3)], [], 20);
    expect(p.puntos).toHaveLength(5);
    expect(p.puntos.find((x) => x.id === "4")).toMatchObject({ fila: "B", numero: 2 });
    const letrasA = p.filas.filter((f) => f.fila === "A");
    const enA = p.puntos.filter((x) => x.fila === "A");
    expect(letrasA).toHaveLength(2);
    expect(Math.min(...letrasA.map((f) => f.x))).toBeLessThan(Math.min(...enA.map((x) => x.x)) - 20);
    expect(Math.max(...letrasA.map((f) => f.x))).toBeGreaterThan(Math.max(...enA.map((x) => x.x)) + 20);
    // Los círculos no se tocan: entre vecinos hay al menos un diámetro.
    const b = p.puntos.filter((x) => x.fila === "B").sort((m, n) => m.x - n.x);
    expect(b[1].x - b[0].x).toBeGreaterThanOrEqual(40);
    expect(p.ancho).toBeGreaterThan(Math.max(...p.puntos.map((x) => x.x)));
    expect(p.escenarioArriba).toBe(true);
  });

  it("mapa libre en ángulo: la letra sigue la dirección de la fila", () => {
    // Fila diagonal (bloque girado 45°): las letras quedan en la prolongación de la fila, no a la izquierda/derecha.
    const diag: AsientoTaquilla[] = [0, 1, 2].map((i) => ({ id: String(i), x: i * 30, y: i * 30, fila: "B", numero: i + 1, lado: null, zona: null, grupo: "izq" }));
    const p = planoTaquilla(diag, [], 18);
    const [a, b] = p.filas;
    expect(p.filas).toHaveLength(2);
    expect(a.y).toBeLessThan(p.puntos[0].y);
    expect(b.y).toBeGreaterThan(p.puntos[2].y);
  });

  it("mapa libre: escala para que no se encimen", () => {
    const libre: AsientoTaquilla[] = [0, 1, 2].map((i) => ({ id: String(i), x: i * 3, y: 0, fila: "A", numero: i + 1, lado: null, zona: null }));
    const p = planoTaquilla(libre, [], 18);
    expect(p.puntos[1].x - p.puntos[0].x).toBeCloseTo(42, 0);
    expect(p.escenarioArriba).toBe(false);
  });

  it("textos y tinta", () => {
    expect(textoQuedan(132, 400)).toBe("Quedan 132 de 400");
    expect(textoQuedan(0, 400)).toBe("Agotado");
    expect(tintaSobre("#84CC16")).toBe("#111018");
    expect(tintaSobre("#8B5CF6")).toBe("#ffffff");
  });
});
