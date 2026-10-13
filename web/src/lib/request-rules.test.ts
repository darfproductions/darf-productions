import { describe, expect, it } from "vitest";
import { montoValido, periodoDeMes, puedeAvisarFalta, resumenSolicitud, textoLimite } from "./request-rules";

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
