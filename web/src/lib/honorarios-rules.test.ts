import { describe, expect, it } from "vitest";
import { bolsaCompartida, bolsaCreativa, calcularCierre, calcularMes, diaDePago, mesDeReparto, sabadoDelMes, type Asignacion, type GastoComun, type HonGlobal, type ObraReglas } from "./honorarios-rules";

// Los datos del documento de especificación (18 nov 2026), configurados por obra (0151).
const global: HonGlobal = { redondeo: 10, umbralAlumnos: 10, fondoPct: 30 };
const G = "grease", E = "encanto", C = "c1";
const reglas: ObraReglas = { reservaPct: 10, emergenciaPct: 5, creativoPct: 60, compartidaPct: 40, compartida: C, gastosPropios: 0, enFondo: true };
const gastos: GastoComun[] = [{ id: "renta", nombre: "Renta del salón", monto: 8000, obras: [G, E] }, { id: "varios", nombre: "Gastos varios", monto: 1500, obras: [G, E] }];
const a = (bolsa: string, persona: string, pct: number): Asignacion => ({ bolsa, persona, nombre: persona, pct });
const CO = bolsaCompartida(C);
const asignaciones: Asignacion[] = [
  a(bolsaCreativa(G), "Diego", 29), a(bolsaCreativa(G), "Ana Fer", 28), a(bolsaCreativa(G), "Regina", 28), a(bolsaCreativa(G), "Patricio", 9), a(bolsaCreativa(G), "Juan Pablo", 6),
  a(bolsaCreativa(E), "Adriana", 21.5), a(bolsaCreativa(E), "Emiliano C.", 21.5), a(bolsaCreativa(E), "Valeria", 21.5), a(bolsaCreativa(E), "Camila Cedillo", 21.5),
  a(bolsaCreativa(E), "Diego", 5), a(bolsaCreativa(E), "Ana Fer", 3), a(bolsaCreativa(E), "Regina", 2), a(bolsaCreativa(E), "Patricio", 2), a(bolsaCreativa(E), "Juan Pablo", 2),
  a(CO, "Diego", 9), a(CO, "Ana Fer", 7.2), a(CO, "Juan Pablo", 22), a(CO, "Patricio", 21.8), a(CO, "Valentina", 14), a(CO, "Mía", 13), a(CO, "Camila Bauer", 13),
];
const obra = (id: string, nombre: string, n: number, uso = 0, r: Partial<ObraReglas> = {}, mensualidad = 1200) =>
  ({ id, nombre, cobrado: n * mensualidad, alumnos: n, emergenciaUso: uso, reglas: { ...reglas, ...r } });
const mes = (ag: number, ae: number, usoE = 0, fondo = false) => calcularMes({
  global, gastos, asignaciones, fondoComun: fondo, obras: [obra(G, "Grease", ag), obra(E, "Encanto", ae, usoE)],
});
const pagos = (r: ReturnType<typeof mes>) => Object.fromEntries(r.personas.map((p) => [p.persona, p.pago]));

describe("honorarios · mes (pruebas del documento)", () => {
  it("prueba A: mes normal", () => {
    const r = mes(20, 20);
    expect(r.errores).toEqual([]);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal, o.empresa])).toEqual([[16850, 10110, 0], [16850, 10110, 0]]);
    expect(r.obras[0].descuentos).toEqual([{ nombre: "Renta del salón", monto: 4000 }, { nombre: "Gastos varios", monto: 750 }]);
    expect(r.compartidas).toEqual([{ id: C, monto: 13480 }]);
    expect(pagos(r)).toEqual({ Diego: 4650, "Ana Fer": 4100, Patricio: 4050, "Juan Pablo": 3770, Regina: 3030, Valentina: 1880, Mía: 1750, "Camila Cedillo": 2170, "Camila Bauer": 1750, Adriana: 2170, "Emiliano C.": 2170, Valeria: 2170 });
    expect([r.totalPagado, r.sobranteRedondeo]).toEqual([33660, 40]);
    expect(r.alertaFondo).toBe(false);
    expect(r.personas.find((p) => p.persona === "Diego")!.partes.map((x) => x.monto)).toEqual([2931.9, 505.5, 1213.2]);
  });
  it("prueba B: Encanto usó 800 de emergencia", () => {
    const r = mes(20, 20, 800);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal])).toEqual([[16850, 10110], [16050, 9630]]);
    expect(r.compartidas[0].monto).toBe(13160);
    expect(pagos(r)).toEqual({ Diego: 4590, "Ana Fer": 4060, Patricio: 3970, "Juan Pablo": 3690, Regina: 3020, Valentina: 1840, Mía: 1710, "Camila Cedillo": 2070, "Camila Bauer": 1710, Adriana: 2070, "Emiliano C.": 2070, Valeria: 2070 });
    expect([r.totalPagado, r.sobranteRedondeo]).toEqual([32870, 30]);
  });
  it("prueba C: fondo creativo común aprobado", () => {
    const r = mes(35, 15, 0, true);
    expect(r.alertaFondo).toBe(true);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal])).toEqual([[33050, 17886], [11450, 8814]]);
    expect(r.compartidas[0].monto).toBe(17800);
    expect(pagos(r)).toEqual({ Diego: 7220, "Ana Fer": 6550, Patricio: 5660, "Juan Pablo": 5160, Regina: 5180, Valentina: 2490, Mía: 2310, "Camila Cedillo": 1890, "Camila Bauer": 2310, Adriana: 1890, "Emiliano C.": 1890, Valeria: 1890 });
    expect([r.totalPagado, r.sobranteRedondeo]).toEqual([44440, 60]);
  });
  it("el uso de emergencia no pasa del tope y un neto negativo no reparte", () => {
    const r = mes(3, 20, 99999);
    expect(r.obras[1].emergenciaUso).toBe(1200);
    expect(r.obras[0].sinReparto).toBe(true);
    expect(r.obras[0].creativa).toBe(0);
    expect(r.errores.some((e) => e.includes("no reparte"))).toBe(true);
  });
  it("si una bolsa no suma 100 %, lo marca como error", () => {
    const r = calcularMes({ global, gastos, fondoComun: false, asignaciones: asignaciones.filter((x) => x.persona !== "Valeria"), obras: [obra(G, "Grease", 0), obra(E, "Encanto", 0)] });
    expect(r.errores[0]).toContain("Creativa Encanto suman 78.5");
  });
  it("la reserva del mes suma la de cada obra, recargos y redondeo", () => {
    const r = calcularMes({ global, gastos, asignaciones, fondoComun: false, recargos: 400, obras: [obra(G, "Grease", 20), obra(E, "Encanto", 20)] });
    expect(r.reservaMes).toBe(2400 + 2400 + 400 + 40);
  });
});

describe("honorarios · por obra (0151)", () => {
  const T = "taller";
  const asigT = [...asignaciones, a(bolsaCreativa(T), "Maestra", 100)];
  it("un taller con otra mensualidad, sus propias reglas y su propia renta no cambia lo de Grease y Encanto", () => {
    const r = calcularMes({
      global, asignaciones: asigT, fondoComun: false,
      gastos: [...gastos, { id: "renta-t", nombre: "Renta del estudio", monto: 3000, obras: [T] }],
      obras: [obra(G, "Grease", 20), obra(E, "Encanto", 20), obra(T, "Taller", 10, 0, { reservaPct: 5, creativoPct: 100, compartidaPct: 0, compartida: null, enFondo: false }, 900)],
    });
    expect(r.errores).toEqual([]);
    // Grease y Encanto: exactamente la prueba A.
    expect(r.obras.slice(0, 2).map((o) => o.neto)).toEqual([16850, 16850]);
    expect(r.compartidas).toEqual([{ id: C, monto: 13480 }]);
    // Taller: 9,000 − 450 de reserva − 3,000 de su renta = 5,550, todo a su bolsa creativa.
    const t = r.obras[2];
    expect([t.cobrado, t.reserva, t.neto, t.creativaFinal, t.aporteCompartida]).toEqual([9000, 450, 5550, 5550, 0]);
    expect(r.personas.find((p) => p.persona === "Maestra")!.pago).toBe(5550);
  });
  it("si el taller comparte el salón, la renta se divide entre las tres", () => {
    const r = calcularMes({
      global, asignaciones: asigT, fondoComun: false,
      gastos: [{ id: "renta", nombre: "Renta del salón", monto: 9000, obras: [G, E, T] }],
      obras: [obra(G, "Grease", 20), obra(E, "Encanto", 20), obra(T, "Taller", 10, 0, { creativoPct: 100, compartidaPct: 0, compartida: null, enFondo: false })],
    });
    expect(r.obras.map((o) => o.descuentos[0].monto)).toEqual([3000, 3000, 3000]);
  });
  it("lo que no va a creativa ni a compartida se queda en la empresa", () => {
    const r = calcularMes({ global, gastos: [], asignaciones: asigT, fondoComun: false, obras: [obra(T, "Taller", 10, 0, { reservaPct: 0, emergenciaPct: 0, creativoPct: 70, compartidaPct: 0, compartida: null })] });
    expect([r.obras[0].creativa, r.obras[0].empresa]).toEqual([8400, 3600]);
  });
  it("el fondo común solo entre las obras que participan", () => {
    const r = calcularMes({
      global, asignaciones: asigT, fondoComun: true, gastos,
      obras: [obra(G, "Grease", 35), obra(E, "Encanto", 15), obra(T, "Taller", 1, 0, { reservaPct: 0, emergenciaPct: 0, creativoPct: 100, compartidaPct: 0, compartida: null, enFondo: false })],
    });
    expect(r.obras.slice(0, 2).map((o) => o.creativaFinal)).toEqual([17886, 8814]);
    expect(r.obras[2].creativaFinal).toBe(1200);
  });
  it("dos bolsas compartidas: cada obra aporta a la suya", () => {
    const asig2 = [...asignaciones, a(bolsaCompartida("c2"), "Otra", 100), a(bolsaCreativa(T), "Maestra", 100)];
    const r = calcularMes({
      global, asignaciones: asig2, fondoComun: false, gastos,
      obras: [obra(G, "Grease", 20), obra(E, "Encanto", 20), obra(T, "Taller", 10, 0, { reservaPct: 0, emergenciaPct: 0, creativoPct: 50, compartidaPct: 50, compartida: "c2", enFondo: false })],
    });
    expect(r.compartidas).toEqual([{ id: C, monto: 13480 }, { id: "c2", monto: 6000 }]);
  });
  it("% compartido sin bolsa compartida es un error", () => {
    const r = calcularMes({ global, gastos: [], asignaciones: asigT, fondoComun: false, obras: [obra(T, "Taller", 1, 0, { compartida: null })] });
    expect(r.errores.some((e) => e.includes("no pertenece a ninguna bolsa compartida"))).toBe(true);
  });
});

describe("honorarios · fechas", () => {
  it("sábados, corte y día de pago", () => {
    expect(sabadoDelMes(2026, 11, 1)).toBe("2026-11-07");
    expect(sabadoDelMes(2026, 11, 2)).toBe("2026-11-14");
    expect(sabadoDelMes(2027, 3, 2)).toBe("2027-03-13");
    expect(diaDePago(2026, 11)).toBe("2026-11-16");
  });
  it("un pago cuenta para su mes hasta el 2.º sábado; después, para el siguiente", () => {
    expect(mesDeReparto("2027-03-13")).toBe("2027-03");
    expect(mesDeReparto("2027-03-14")).toBe("2027-04");
    expect(mesDeReparto("2026-12-20")).toBe("2027-01");
  });
});

describe("honorarios · cierre de temporada", () => {
  const cabezas = ["Diego", "Ana Fer", "Patricio", "Juan Pablo"].map((x) => ({ persona: x, nombre: x }));
  const otros = ["Regina", "Valentina", "Mía", "Camila Cedillo", "Camila Bauer"].map((x) => ({ persona: x, nombre: x }));
  it("prueba D: Encanto deja 50,000", () => {
    const r = calcularCierre({
      obra: { id: E, nombre: "Encanto" }, entrada: { boletos: 50000, patrocinios: 0, costos: 0, prestamos: 0 },
      reparto: { empresaPct: 40, creativosPct: 25, compartidaPct: 20, casaPct: 15, casaCabezasPct: 60 },
      asignaciones, compartida: C, cabezas, otros, redondeo: 10,
    });
    expect(r.errores).toEqual([]);
    expect(r.partes).toMatchObject({ empresa: 20000, creativos: 12500, compartida: 10000, casa: 7500, casaCabezas: 4500, casaOtros: 3000 });
    const monto = (persona: string, bolsa: string) => r.personas.find((p) => p.persona === persona)!.partes.find((x) => x.bolsa === bolsa)!.monto;
    expect(monto("Adriana", bolsaCreativa(E))).toBe(2687.5);
    expect([monto("Diego", bolsaCreativa(E)), monto("Ana Fer", bolsaCreativa(E)), monto("Regina", bolsaCreativa(E))]).toEqual([625, 375, 250]);
    expect([monto("Juan Pablo", CO), monto("Patricio", CO), monto("Valentina", CO), monto("Diego", CO), monto("Ana Fer", CO)]).toEqual([2200, 2180, 1400, 900, 720]);
    expect(monto("Diego", "casa:cabezas")).toBe(1125);
    expect(monto("Regina", "casa:otros")).toBe(600);
    // Redondeo hacia abajo a 10 (acordado con Diego): Adriana 2,687.50 → 2,680.
    expect(r.personas.find((p) => p.persona === "Adriana")!.pago).toBe(2680);
  });
  it("sin ganancia no hay reparto", () => {
    const r = calcularCierre({ obra: { id: E, nombre: "Encanto" }, entrada: { boletos: 10000, patrocinios: 0, costos: 12000, prestamos: 0 }, reparto: { empresaPct: 40, creativosPct: 25, compartidaPct: 20, casaPct: 15, casaCabezasPct: 60 }, asignaciones, compartida: C, cabezas: [], otros: [], redondeo: 10 });
    expect([r.sinReparto, r.personas.length]).toEqual([true, 0]);
  });
});
