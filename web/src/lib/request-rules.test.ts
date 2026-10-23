import { describe, expect, it } from "vitest";
import { horaMx, llegadaIso, montoValido, periodoDeMes, puedeAvisarFalta, puedeAvisarLlegada, resumenSolicitud, textoLimite, textoLlegada } from "./request-rules";

describe("puedeAvisarFalta", () => {
  const inicia = "2026-10-20T18:00:00-06:00";
  it("hasta el límite sí, después no", () => {
    expect(puedeAvisarFalta(inicia, 24, new Date("2026-10-19T17:59:00-06:00"))).toBe(true);
    expect(puedeAvisarFalta(inicia, 24, new Date("2026-10-19T18:00:00-06:00"))).toBe(true);
    expect(puedeAvisarFalta(inicia, 24, new Date("2026-10-19T18:01:00-06:00"))).toBe(false);
  });
  it("con 0 horas, hasta que empiece", () => {
    expect(puedeAvisarFalta(inicia, 0, new Date("2026-10-20T17:59:00-06:00"))).toBe(true);
    expect(puedeAvisarFalta(inicia, 0, new Date("2026-10-20T18:01:00-06:00"))).toBe(false);
  });
});

describe("textos y montos", () => {
  it("textoLimite", () => {
    expect(textoLimite(0)).toBe("antes de que empiece el ensayo");
    expect(textoLimite(24)).toBe("1 día antes");
    expect(textoLimite(48)).toBe("2 días antes");
    expect(textoLimite(12)).toBe("12 horas antes");
  });
  it("periodoDeMes", () => {
    expect(periodoDeMes("2026-10")).toBe("2026-10-01");
    expect(periodoDeMes("2026-13")).toBeNull();
    expect(periodoDeMes("")).toBeNull();
  });
  it("montoValido", () => {
    expect(montoValido("$ 1,200.50")).toBe(1200.5);
    expect(montoValido("0")).toBeNull();
    expect(montoValido("-5")).toBeNull();
    expect(montoValido("abc")).toBeNull();
  });
  it("resumenSolicitud", () => {
    const mes = () => "octubre";
    const base = { doc_nombre: null, concepto: null, periodo: null, ensayos: [] };
    expect(resumenSolicitud({ ...base, tipo: "falta", ensayos: [{ id: "1", titulo: "Coreo", inicia: "" }] }, mes)).toBe("Falta a Coreo");
    expect(resumenSolicitud({ ...base, tipo: "pago", concepto: "mensualidad", periodo: "2026-10-01" }, mes)).toBe("Pago de octubre");
    expect(resumenSolicitud({ ...base, tipo: "documento", doc_nombre: "Acta" }, mes)).toBe("Acta");
  });
});

describe("llegada tarde (0126)", () => {
  it("se avisa hasta que empieza el ensayo", () => {
    expect(puedeAvisarLlegada("2027-03-10T01:00:00Z", new Date("2027-03-10T00:59:00Z"))).toBe(true);
    expect(puedeAvisarLlegada("2027-03-10T01:00:00Z", new Date("2027-03-10T01:00:00Z"))).toBe(false);
  });
  it("la hora del formulario es del mismo día del ensayo, en hora de México", () => {
    // Ensayo el 9 de marzo a las 7:00 p.m. (México) = 10 de marzo 01:00 UTC.
    expect(llegadaIso("2027-03-10T01:00:00Z", "19:30")).toBe("2027-03-09T19:30:00-06:00");
    expect(llegadaIso("2027-03-10T01:00:00Z", "7:30")).toBeNull();
    expect(horaMx("2027-03-09T19:30:00-06:00")).toBe("7:30 p.m.");
  });
  it("el aviso dice desde qué hora cuenta el retardo", () => {
    expect(textoLlegada("2027-03-09T19:30:00-06:00", 10)).toBe("Tu hora de entrada será las 7:30 p.m.; tienes 10 minutos de tolerancia. Si llegas después de las 7:40 p.m., cuenta como retardo y los minutos se cuentan desde las 7:30 p.m.");
    expect(textoLlegada(null, 10)).toContain("La hora que pongas será tu hora de entrada");
  });
  it("resumen", () => {
    expect(resumenSolicitud({ tipo: "llegada", doc_nombre: null, concepto: null, periodo: null, ensayos: [{ id: "r", titulo: "Ensayo general", inicia: "2027-03-10T01:00:00Z" }], llegada_hora: "2027-03-09T19:30:00-06:00" }, () => ""))
      .toBe("Llegada tarde a Ensayo general · 7:30 p.m.");
  });
});
