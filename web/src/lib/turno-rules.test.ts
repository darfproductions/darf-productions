import { describe, expect, it } from "vitest";
import { diasAudicion, mensajeTurno, telefonoWa, textoHorario, turnoWhatsAppUrl } from "./turno-rules";

describe("turnos por WhatsApp (0140)", () => {
  it("teléfono para wa.me", () => {
    expect(telefonoWa("442 123 45 67")).toBe("524421234567");
    expect(telefonoWa("+52 442 123 4567")).toBe("524421234567");
    expect(telefonoWa("52 1 442 123 4567")).toBe("524421234567");
    expect(telefonoWa("123")).toBeNull();
    expect(telefonoWa(null)).toBeNull();
  });
  it("horario con hora de fin opcional", () => {
    expect(textoHorario("2026-11-08T17:50:00Z", "2026-11-08T18:10:00Z")).toBe("Domingo 8 de noviembre, 11:50 a.m. a 12:10 p.m.");
    expect(textoHorario("2026-11-08T17:50:00Z")).toBe("Domingo 8 de noviembre, 11:50 a.m.");
    expect(textoHorario(null)).toBeNull();
  });
  it("mensaje corto con nombre de pila, turno, horario y lugar", () => {
    const m = mensajeTurno({ nombre: "Ana López", titulo: "Teen Beach Movie", numero: 7, horario: "Domingo 8 de noviembre, 11:50 a.m. a 12:10 p.m.", sede: "Foro DARF" });
    expect(m).toBe("Hola Ana, tu turno para la audición de Teen Beach Movie es el Nº 7. Tu horario: Domingo 8 de noviembre, 11:50 a.m. a 12:10 p.m. Lugar: Foro DARF. Llega 15 minutos antes con tu QR de inscripción.");
    expect(mensajeTurno({ nombre: "Beto", titulo: "X", numero: 2 })).toBe("Hola Beto, tu turno para la audición de X es el Nº 2. Llega 15 minutos antes con tu QR de inscripción.");
  });
  it("liga de WhatsApp o nada si el teléfono no sirve", () => {
    expect(turnoWhatsAppUrl("4421234567", { nombre: "Ana", titulo: "X", numero: 1 })?.startsWith("https://wa.me/524421234567?text=Hola%20Ana")).toBe(true);
    expect(turnoWhatsAppUrl("", { nombre: "Ana", titulo: "X", numero: 1 })).toBeNull();
  });
});

describe("días de audición desde los horarios", () => {
  it("un día con varios bloques: del primer inicio al último fin", () => {
    expect(diasAudicion([
      { inicia: "2027-02-13T15:00:00Z", termina: "2027-02-13T15:20:00Z" },
      { inicia: "2027-02-13T14:00:00Z", termina: "2027-02-13T14:20:00Z" },
      { inicia: "2027-02-13T19:40:00Z", termina: "2027-02-13T20:00:00Z" },
    ])).toEqual(["Sábado 13 de febrero, 8:00 a.m. a 2:00 p.m."]);
  });
  it("dos días, y bloques sin hora de fin", () => {
    expect(diasAudicion([{ inicia: "2027-02-13T14:00:00Z" }, { inicia: "2027-02-14T16:00:00Z" }, { inicia: "2027-02-14T18:00:00Z" }]))
      .toEqual(["Sábado 13 de febrero, 8:00 a.m.", "Domingo 14 de febrero, 10:00 a.m. a 12:00 p.m."]);
    expect(diasAudicion([])).toEqual([]);
  });
});
