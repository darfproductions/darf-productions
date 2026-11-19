import { describe, expect, it } from "vitest";
import { COMPARTIDA, bolsaCreativa, calcularCierre, calcularMes, diaDePago, mesDeReparto, sabadoDelMes, type Asignacion, type HonConfig } from "./honorarios-rules";

// Los datos del documento de especificación (18 nov 2026).
const config: HonConfig = { reservaPct: 10, emergenciaPct: 5, renta: 8000, gastos: 1500, creativoPct: 60, redondeo: 10, umbralAlumnos: 10, fondoPct: 30 };
const G = "grease", E = "encanto";
const a = (bolsa: string, persona: string, pct: number): Asignacion => ({ bolsa, persona, nombre: persona, pct });
const asignaciones: Asignacion[] = [
  a(bolsaCreativa(G), "Diego", 29), a(bolsaCreativa(G), "Ana Fer", 28), a(bolsaCreativa(G), "Regina", 28), a(bolsaCreativa(G), "Patricio", 9), a(bolsaCreativa(G), "Juan Pablo", 6),
  a(bolsaCreativa(E), "Adriana", 21.5), a(bolsaCreativa(E), "Emiliano C.", 21.5), a(bolsaCreativa(E), "Valeria", 21.5), a(bolsaCreativa(E), "Camila Cedillo", 21.5),
  a(bolsaCreativa(E), "Diego", 5), a(bolsaCreativa(E), "Ana Fer", 3), a(bolsaCreativa(E), "Regina", 2), a(bolsaCreativa(E), "Patricio", 2), a(bolsaCreativa(E), "Juan Pablo", 2),
  a(COMPARTIDA, "Diego", 9), a(COMPARTIDA, "Ana Fer", 7.2), a(COMPARTIDA, "Juan Pablo", 22), a(COMPARTIDA, "Patricio", 21.8), a(COMPARTIDA, "Valentina", 14), a(COMPARTIDA, "Mía", 13), a(COMPARTIDA, "Camila Bauer", 13),
];
const mes = (ag: number, ae: number, usoE = 0, fondo = false) => calcularMes({
  config, asignaciones, fondoComun: fondo,
  obras: [{ id: G, nombre: "Grease", cobrado: ag * 1200, alumnos: ag, emergenciaUso: 0 }, { id: E, nombre: "Encanto", cobrado: ae * 1200, alumnos: ae, emergenciaUso: usoE }],
});
const pagos = (r: ReturnType<typeof mes>) => Object.fromEntries(r.personas.map((p) => [p.persona, p.pago]));

describe("honorarios · mes", () => {
  it("prueba A: mes normal", () => {
    const r = mes(20, 20);
    expect(r.errores).toEqual([]);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal])).toEqual([[16850, 10110], [16850, 10110]]);
    expect(r.compartida).toBe(13480);
    expect(pagos(r)).toEqual({ Diego: 4650, "Ana Fer": 4100, Patricio: 4050, "Juan Pablo": 3770, Regina: 3030, Valentina: 1880, Mía: 1750, "Camila Cedillo": 2170, "Camila Bauer": 1750, Adriana: 2170, "Emiliano C.": 2170, Valeria: 2170 });
    expect([r.totalPagado, r.sobranteRedondeo]).toEqual([33660, 40]);
    expect(r.alertaFondo).toBe(false);
    // Desglose de ejemplo del documento: "Creativa Grease 29 % = 2,931.90 + Compartida 9 % = 1,213.20".
    const d = r.personas.find((p) => p.persona === "Diego")!;
    expect(d.partes.map((x) => x.monto)).toEqual([2931.9, 505.5, 1213.2]);
  });
  it("prueba B: Encanto usó 800 de emergencia", () => {
    const r = mes(20, 20, 800);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal])).toEqual([[16850, 10110], [16050, 9630]]);
    expect(r.compartida).toBe(13160);
    expect(pagos(r)).toEqual({ Diego: 4590, "Ana Fer": 4060, Patricio: 3970, "Juan Pablo": 3690, Regina: 3020, Valentina: 1840, Mía: 1710, "Camila Cedillo": 2070, "Camila Bauer": 1710, Adriana: 2070, "Emiliano C.": 2070, Valeria: 2070 });
    expect([r.totalPagado, r.sobranteRedondeo]).toEqual([32870, 30]);
  });
  it("prueba C: fondo creativo común aprobado", () => {
    const r = mes(35, 15, 0, true);
    expect(r.alertaFondo).toBe(true);
    expect(r.obras.map((o) => [o.neto, o.creativaFinal])).toEqual([[33050, 17886], [11450, 8814]]);
    expect(r.compartida).toBe(17800);
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
    const r = calcularMes({ config, asignaciones: asignaciones.filter((x) => x.persona !== "Valeria"), fondoComun: false, obras: [{ id: G, nombre: "Grease", cobrado: 0, alumnos: 0, emergenciaUso: 0 }, { id: E, nombre: "Encanto", cobrado: 0, alumnos: 0, emergenciaUso: 0 }] });
    expect(r.errores[0]).toContain("Creativa Encanto suman 78.5");
  });
  it("la reserva del mes suma 10 %, recargos y redondeo", () => {
    const r = calcularMes({ config, asignaciones, fondoComun: false, recargos: 400, obras: [{ id: G, nombre: "Grease", cobrado: 24000, alumnos: 20, emergenciaUso: 0 }, { id: E, nombre: "Encanto", cobrado: 24000, alumnos: 20, emergenciaUso: 0 }] });
    expect(r.reservaMes).toBe(2400 + 2400 + 400 + 40);
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
  it("prueba D: Encanto deja 50,000", () => {
    const cabezas = ["Diego", "Ana Fer", "Patricio", "Juan Pablo"].map((x) => ({ persona: x, nombre: x }));
    const otros = ["Regina", "Valentina", "Mía", "Camila Cedillo", "Camila Bauer"].map((x) => ({ persona: x, nombre: x }));
    const r = calcularCierre({
      obra: { id: E, nombre: "Encanto" }, entrada: { boletos: 50000, patrocinios: 0, costos: 0, prestamos: 0 },
      reparto: { empresaPct: 40, creativosPct: 25, compartidaPct: 20, casaPct: 15, casaCabezasPct: 60 },
      asignaciones, cabezas, otros, redondeo: 10,
    });
    expect(r.errores).toEqual([]);
    expect(r.partes).toMatchObject({ empresa: 20000, creativos: 12500, compartida: 10000, casa: 7500, casaCabezas: 4500, casaOtros: 3000 });
    const monto = (persona: string, bolsa: string) => r.personas.find((p) => p.persona === persona)!.partes.find((x) => x.bolsa === bolsa)!.monto;
    expect(monto("Adriana", bolsaCreativa(E))).toBe(2687.5);
    expect([monto("Diego", bolsaCreativa(E)), monto("Ana Fer", bolsaCreativa(E)), monto("Regina", bolsaCreativa(E))]).toEqual([625, 375, 250]);
    expect([monto("Juan Pablo", COMPARTIDA), monto("Patricio", COMPARTIDA), monto("Valentina", COMPARTIDA), monto("Diego", COMPARTIDA), monto("Ana Fer", COMPARTIDA)]).toEqual([2200, 2180, 1400, 900, 720]);
    expect(monto("Diego", "casa:cabezas")).toBe(1125);
    expect(monto("Regina", "casa:otros")).toBe(600);
    // Redondeo hacia abajo a 10 (acordado con Diego): Adriana 2,687.50 → 2,680.
    expect(r.personas.find((p) => p.persona === "Adriana")!.pago).toBe(2680);
  });
  it("sin ganancia no hay reparto", () => {
    const r = calcularCierre({ obra: { id: E, nombre: "Encanto" }, entrada: { boletos: 10000, patrocinios: 0, costos: 12000, prestamos: 0 }, reparto: { empresaPct: 40, creativosPct: 25, compartidaPct: 20, casaPct: 15, casaCabezasPct: 60 }, asignaciones, cabezas: [], otros: [], redondeo: 10 });
    expect([r.sinReparto, r.personas.length]).toEqual([true, 0]);
  });
});
