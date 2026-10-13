import { describe, expect, it } from "vitest";
import { paseCredencial, type CredencialMia } from "./credencial-rules";

const base: CredencialMia & { nombre: string; fotoUrl: null } = {
  token: "t", codigo: "DRF-ABCD", nivel: "cuenta", desde: "2025-03-01T00:00:00Z", franja: null, papel: null, socio: null,
  compartir_telefono: false, compartir_correo: false, compartir_instagram: false, compartir_perfil: false, nombre: "Ana Pérez", fotoUrl: null,
};
const hoy = new Date("2026-10-12T12:00:00Z");
const socio = { numero: 7, desde: "2026-01-01T00:00:00Z", fundador: true };

describe("credencial única (0083)", () => {
  it("cuenta: pase básico con el mismo código", () => {
    const p = paseCredencial(base, hoy);
    expect(p.titulo).toBe("Cuenta DARF");
    expect(p.banda.label).toBe("SPECTATOR");
    expect(p.pie).toBe("DARF Productions · desde 2025");
    expect(p.codigo).toBe("DRF-ABCD");
  });
  it("club: credencial dorada con número de socio", () => {
    const p = paseCredencial({ ...base, nivel: "club", socio }, hoy);
    expect(p.tema).toBe("fan");
    expect(p.titulo).toBe("Socio #0007 · Fan fundador");
  });
  it("equipo: gafete; si también es socio lleva el sello", () => {
    const g = paseCredencial({ ...base, nivel: "equipo", franja: "manager", papel: "CEO" }, hoy);
    expect(g.tema).toBe("darf");
    expect(g.titulo).toBe("CEO");
    expect(g.sello).toBeUndefined();
    const s = paseCredencial({ ...base, nivel: "equipo", franja: "crew", papel: "Elenco", socio }, hoy);
    expect(s.sello).toBe("Socio #0007");
    expect(s.banda.label).toBe("CREW");
  });
});
