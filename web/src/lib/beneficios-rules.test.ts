import { describe, expect, it } from "vitest";
import { aplicaEnFuncion, horaAcceso, lineaWhatsapp, lineasDesdeBoletos, minutosAcceso, porZona, textoBeneficio, textoCupo, textosBoleto, type Beneficio } from "./beneficios-rules";

const b = (x: Partial<Beneficio>): Beneficio => ({ id: "b", tipo: "otro", nombre: "X", detalle: null, minutos_antes: null, cupo: null, funciones: null, orden: 0, activo: true, zonas: [], ...x });

describe("beneficios por zona (0122)", () => {
  it("textos", () => {
    expect(textoBeneficio(b({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 }))).toBe("Acceso anticipado (15 min antes)");
    expect(textoBeneficio(b({ tipo: "souvenir", nombre: "Póster firmado" }))).toBe("Póster firmado");
    expect(textoCupo(20)).toBe("Solo los primeros 20");
    expect(textoCupo(null)).toBeNull();
  });
  it("WhatsApp", () => {
    expect(lineaWhatsapp("VIP", [b({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 }), b({ nombre: "Póster firmado", cupo: 20 })]))
      .toBe("Incluye (VIP): Acceso anticipado (15 min antes), Póster firmado (primeros 20)");
    expect(lineaWhatsapp("VIP", [])).toBeNull();
  });
  it("hora de acceso y minutos", () => {
    expect(horaAcceso("2026-12-05T02:00:00Z", 15)).toBe("7:45 p.m.");
    expect(horaAcceso(null, 15)).toBeNull();
    expect(minutosAcceso([b({ tipo: "acceso", minutos_antes: 15 }), b({ tipo: "acceso", minutos_antes: 30 }), b({})])).toBe(30);
    expect(minutosAcceso([b({})])).toBeNull();
  });
  it("funciones y agrupado por zona", () => {
    expect(aplicaEnFuncion({ funciones: null }, "f1")).toBe(true);
    expect(aplicaEnFuncion({ funciones: ["f2"] }, "f1")).toBe(false);
    const m = porZona([b({ id: "2", orden: 2, zonas: ["vip"] }), b({ id: "1", orden: 1, zonas: ["vip", "gen"] }), b({ id: "3", activo: false, zonas: ["vip"] }), b({ id: "4", funciones: ["f2"], zonas: ["vip"] })], "f1");
    expect(m.get("vip")?.map((x) => x.id)).toEqual(["1", "2"]);
    expect(m.get("gen")?.map((x) => x.id)).toEqual(["1"]);
    expect(porZona([b({ id: "4", funciones: ["f2"], zonas: ["vip"] })]).get("vip")?.length).toBe(1);
  });
});

describe("beneficios en el boleto (0122)", () => {
  const bb = (x: Partial<import("./beneficios-rules").BeneficioBoleto>) => ({ beneficio_id: "1", tipo: "otro" as const, nombre: "X", minutos_antes: null, cupo: null, alcanza: true, entregado_at: null, zona: "VIP", ...x });
  it("incluye, cupo y hora", () => {
    const r = textosBoleto([bb({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 }), bb({ beneficio_id: "2", nombre: "Póster", cupo: 20, alcanza: false }), bb({ beneficio_id: "3", nombre: "Foto", cupo: 5, alcanza: null })], "2026-12-05T02:00:00Z");
    expect(r.incluye).toEqual(["Acceso anticipado (15 min antes)", "Foto (sujeto a cupo)"]);
    expect(r.acceso).toBe("Puertas para ti: 7:45 p.m.");
  });
  it("WhatsApp desde boletos sin repetir", () => {
    expect(lineasDesdeBoletos([bb({ nombre: "Póster" }), bb({ nombre: "Póster" }), bb({ beneficio_id: "9", zona: "Pista", nombre: "Pulsera" })]))
      .toEqual(["Incluye (VIP): Póster", "Incluye (Pista): Pulsera"]);
  });
});
