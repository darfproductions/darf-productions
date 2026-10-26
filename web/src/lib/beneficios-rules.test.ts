import { describe, expect, it } from "vitest";
import { aplicaEnFuncion, cuentaComoPendiente, mensajeEntrega, horaAcceso, lineaWhatsapp, lineasDesdeBoletos, minutosAcceso, momentoPorOmision, ORDEN_ESTADO, porZona, textoBeneficio, textoCupo, textoEntrega, textoLimite, textosBoleto, type Beneficio, type EstadoEntrega, textoConNota } from "./beneficios-rules";

const b = (x: Partial<Beneficio>): Beneficio => ({ id: "b", tipo: "otro", nombre: "X", detalle: null, minutos_antes: null, cupo: null, funciones: null, orden: 0, activo: true, zonas: [], entrega: "dia_despues", entrega_dias: null, ...x });

describe("beneficios por zona (0122)", () => {
  it("textos", () => {
    expect(textoBeneficio(b({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 }))).toBe("Acceso anticipado (15 min antes)");
    expect(textoBeneficio(b({ tipo: "souvenir", nombre: "Póster firmado" }))).toBe("Póster firmado");
    expect(textoCupo(20)).toBe("Solo los primeros 20");
    expect(textoCupo(null)).toBeNull();
  });
  it("WhatsApp", () => {
    expect(lineaWhatsapp("VIP", [b({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 }), b({ nombre: "Póster firmado", cupo: 20 })]))
      .toBe("Incluye (VIP): Acceso anticipado (15 min antes), Póster firmado (primeros 20, al terminar la función)");
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
  it("el boleto dice cuándo se entrega o cuándo se entregó (0125)", () => {
    const r = textosBoleto([
      bb({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15, entrega: "dia_antes" }),
      bb({ beneficio_id: "2", nombre: "Póster", entrega: "dia_despues", estado: "pendiente" }),
      bb({ beneficio_id: "3", nombre: "Foto", entrega: "despues", entrega_dias: 3, estado: "entregado", entregado_at: "2027-03-12T18:00:00Z" }),
    ], null);
    expect(r.incluye).toEqual(["Acceso anticipado (15 min antes)", "Póster. Se entrega al terminar la función", "Foto. Entregado el 12 de marzo"]);
  });
  it("WhatsApp desde boletos sin repetir", () => {
    expect(lineasDesdeBoletos([bb({ nombre: "Póster" }), bb({ nombre: "Póster" }), bb({ beneficio_id: "9", zona: "Pista", nombre: "Pulsera" })]))
      .toEqual(["Incluye (VIP): Póster", "Incluye (Pista): Pulsera"]);
  });
});

describe("entrega de beneficios (0125)", () => {
  it("momento por omisión según el tipo", () => {
    expect(momentoPorOmision("acceso")).toBe("dia_antes");
    expect(momentoPorOmision("souvenir")).toBe("dia_despues");
  });
  it("texto para el comprador", () => {
    expect(textoEntrega({ entrega: "dia_despues", entrega_dias: null, limite: null })).toBe("Se entrega al terminar la función");
    expect(textoEntrega({ entrega: "antes", entrega_dias: 3, limite: null })).toBe("Se entrega antes de la función (desde 3 días antes)");
    // Límite: medianoche del 18 de marzo (hora de México) = último día el 17.
    expect(textoEntrega({ entrega: "despues", entrega_dias: 7, limite: "2027-03-18T06:00:00Z" })).toBe("Te lo entregamos a más tardar el 17 de marzo");
    expect(textoEntrega({ entrega: "despues", entrega_dias: 7, limite: null, estado: "entregado", entregado_at: "2027-03-12T18:00:00Z" })).toBe("Entregado el 12 de marzo");
  });
  it("límite para el panel", () => {
    expect(textoLimite("2027-03-11T02:00:00Z", "dia_antes")).toBe("Antes de las 8:00 p.m. del 10 de marzo");
    expect(textoLimite("2027-03-11T06:00:00Z", "dia_despues")).toBe("Hasta el 10 de marzo");
  });
  it("WhatsApp dice cuándo se entrega (menos el acceso)", () => {
    expect(lineaWhatsapp("VIP", [
      { tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15, cupo: null, entrega: "dia_antes" },
      { tipo: "souvenir", nombre: "Póster firmado", minutos_antes: null, cupo: 20, entrega: "dia_despues" },
    ])).toBe("Incluye (VIP): Acceso anticipado (15 min antes), Póster firmado (primeros 20, al terminar la función)");
  });
  it("orden de la lista y pendientes", () => {
    const xs: EstadoEntrega[] = ["entregado", "pendiente", "vencido", "hoy"];
    expect([...xs].sort((a, b) => ORDEN_ESTADO[a] - ORDEN_ESTADO[b])).toEqual(["vencido", "hoy", "pendiente", "entregado"]);
    expect(cuentaComoPendiente("sin_cupo")).toBe(false);
    expect(cuentaComoPendiente("hoy")).toBe(true);
  });
});

describe("WhatsApp de entrega (0125)", () => {
  it("mensaje para coordinar", () => {
    expect(mensajeEntrega({ comprador: "Ana López", beneficio: "Póster firmado", obra: "Showman", lugar: "VIP-A-1", limite: "2027-03-18T06:00:00Z", entrega: "despues" }))
      .toBe("Hola Ana, te escribimos de DARF Productions por tu póster firmado de Showman (lugar VIP-A-1). Queremos coordinar la entrega (hasta el 17 de marzo). ¿Cómo te queda mejor?");
  });
});

describe("nota del beneficio", () => {
  it("se agrega al nombre", () => {
    expect(textoConNota({ tipo: "souvenir", nombre: "Póster firmado por el elenco", minutos_antes: null, cupo: null, detalle: "Uno por compra, no por boleto." }))
      .toBe("Póster firmado por el elenco — uno por compra, no por boleto");
    expect(textoConNota({ tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 30, cupo: null, detalle: "  " })).toBe("Acceso anticipado (30 min antes)");
  });
});

describe("uno por compra (0130)", () => {
  it("agrega el aviso sin repetirlo si la nota ya lo dice", async () => {
    const { notaBeneficio, textoConNota } = await import("./beneficios-rules");
    expect(notaBeneficio({ por_compra: true, detalle: null })).toBe("Uno por compra, no por boleto");
    expect(notaBeneficio({ por_compra: true, detalle: "Firmado por el elenco." })).toBe("Uno por compra, no por boleto. Firmado por el elenco");
    expect(notaBeneficio({ por_compra: true, detalle: "Uno por compra, no por boleto" })).toBe("Uno por compra, no por boleto");
    expect(notaBeneficio({ por_compra: false, detalle: null })).toBeNull();
    expect(textoConNota({ tipo: "souvenir", nombre: "Póster firmado", minutos_antes: null, cupo: null, por_compra: true })).toBe("Póster firmado — uno por compra, no por boleto");
  });

  it("en los otros boletos de la orden dice con cuál va", async () => {
    const { textosBoleto } = await import("./beneficios-rules");
    const t = textosBoleto([{ beneficio_id: "p", tipo: "souvenir", nombre: "Póster firmado", minutos_antes: null, cupo: null, por_compra: true,
      alcanza: false, entregado_at: null, zona: "VIP", estado: "otro_boleto", con_boleto: "A1" }], null);
    expect(t.incluye).toEqual(["Póster firmado — uno por compra: va con tu boleto A1"]);
  });
});
