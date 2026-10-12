import { describe, expect, it } from "vitest";
import { adeudoDetalle, conceptoPago, csv, ligaWhatsApp, mensajeRecibo, sePuedeBorrar } from "./pago-rules";
import { estadoCuotas, recaudacion } from "./member-rules";

const fee = { monto: 800, desde: "2027-01-01", hasta: "2027-06-01", dia_limite: 10, cobrar: true, inscripcion: 500 };
const sin = { beca: false, cuota_especial: null };

describe("pagos y recibos (0079)", () => {
  it("un pago anulado no cuenta en el mes, la inscripción ni lo cobrado", () => {
    const pagos = [
      { periodo: "2027-01-01", monto: 800, concepto: "mensualidad" as const, anulado_at: "2027-01-05T10:00:00Z", registrado_at: "2027-01-04T10:00:00Z" },
      { periodo: "2027-01-01", monto: 500, concepto: "inscripcion" as const, anulado_at: null, registrado_at: "2027-01-04T10:00:00Z" },
    ];
    expect(estadoCuotas(fee, sin, pagos, new Date("2027-01-20T12:00:00Z"))[0].estado).toBe("vencido");
    expect(recaudacion(pagos).total).toBe(500);
  });

  it("adeudo: meses ya iniciados que faltan, vencidos o no, e inscripción", () => {
    const a = adeudoDetalle(fee, sin, [{ periodo: "2027-01-01", monto: 800, concepto: "mensualidad" }], new Date("2027-03-05T12:00:00Z"));
    expect(a.meses).toEqual([{ periodo: "2027-02-01", falta: 800, vencido: true }, { periodo: "2027-03-01", falta: 800, vencido: false }]);
    expect(a.inscripcion).toBe(500);
    expect(a.total).toBe(2100);
    expect(adeudoDetalle(fee, { beca: true, cuota_especial: null, sin_inscripcion: true }, [], new Date("2027-03-05T12:00:00Z")).total).toBe(0);
  });

  it("WhatsApp: agrega +52 a un número de 10 dígitos y escribe el mensaje", () => {
    const r = { nombre: "Ana Prueba", folio: "DARF-2027-0001", concepto: "mensualidad" as const, periodo: "2027-03-01", monto: 800, obra: "Showman", anulado_at: null };
    const l = ligaWhatsApp("442 123 4567", mensajeRecibo(r, "https://darf.mx/r"));
    expect(l?.startsWith("https://wa.me/524421234567?text=")).toBe(true);
    expect(decodeURIComponent(l!.split("text=")[1])).toContain("Hola Ana, recibimos tu pago de mensualidad de marzo de 2027 de Showman");
    expect(ligaWhatsApp("123", "x")).toBeNull();
    expect(ligaWhatsApp(null, "x")).toBeNull();
    expect(conceptoPago({ concepto: "inscripcion", periodo: "2027-01-01" })).toBe("Inscripción");
  });

  it("borrar solo en los primeros 10 minutos", () => {
    const t = Date.parse("2027-03-01T10:00:00Z");
    expect(sePuedeBorrar("2027-03-01T09:51:00Z", t)).toBe(true);
    expect(sePuedeBorrar("2027-03-01T09:49:00Z", t)).toBe(false);
  });

  it("CSV con comillas, acentos y sin fórmulas", () => {
    const s = csv([["Nombre", "Monto"], ['Ana "La" Pérez, hija', 800], ["=HYPERLINK(1)", -5]]);
    expect(s.startsWith("﻿Nombre,Monto\r\n")).toBe(true);
    expect(s).toContain('"Ana ""La"" Pérez, hija",800');
    expect(s).toContain("'=HYPERLINK(1),-5");
  });
});
