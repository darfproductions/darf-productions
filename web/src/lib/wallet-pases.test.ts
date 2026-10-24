import { describe, expect, it } from "vitest";
import { paseCredencialFan } from "./credencial-fan-rules";
import { paseGafete } from "./gafete-rules";
import { ESTILO_DARF } from "./ticket-design";
import { colorBase, colorEtiqueta, conEstado, contraste, estadoBoleto, hex, paseBoleto, paseCredencialWallet, rgb, serialCredencial, venceBoleto } from "./wallet-pases";

const boleto = {
  ticketId: "11111111-1111-1111-1111-111111111111",
  qrToken: "22222222-2222-2222-2222-222222222222",
  obra: "Showman",
  startsAt: "2026-11-15T02:00:00Z", // 14 nov, 8:00 p.m. en CDMX
  lugar: "Teatro Metropolitano",
  asiento: "B-12",
  orden: "DARF-AB12CD",
  comprador: "Ana López",
  estilo: { fondo: "#13235c", superficie: "#1d2f73", texto: "#ffffff", acento: "#f5c518", logo: null },
};

describe("colores", () => {
  it("normaliza hex y convierte a rgb", () => {
    expect(hex("#ABC")).toBe("#aabbcc");
    expect(hex("rojo")).toBeNull();
    expect(rgb("#340feb")).toBe("rgb(52, 15, 235)");
  });
  it("toma el primer color de un degradado", () => {
    expect(colorBase("linear-gradient(120deg,#8a6b1f,#d7bb5f 50%)")).toBe("#8a6b1f");
    expect(colorBase("#d20122")).toBe("#d20122");
  });
  it("usa el acento solo si se lee sobre el fondo", () => {
    expect(colorEtiqueta("#13235c", "#f5c518", "#ffffff")).toBe("#f5c518");
    expect(colorEtiqueta("#ffffff", "#fefefe", "#13235c")).toBe("#13235c");
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});

describe("paseBoleto", () => {
  const p = paseBoleto(boleto);
  it("lleva el mismo QR de la puerta y el folio", () => {
    expect(p.qr).toBe(boleto.qrToken);
    expect(p.qrTexto).toBe("DARF-AB12CD");
    expect(p.serial).toBe(`boleto-${boleto.ticketId}`);
  });
  it("muestra fecha y hora de México, obra, asiento y lugar", () => {
    expect(p.cabecera[0].label).toBe("Sáb 14 de nov");
    expect(p.cabecera[0].value).toMatch(/^8:00\s?p\.\s?m\.$/);
    expect(p.primarios[0].value).toBe("Showman");
    expect(p.secundarios.map((c) => c.value)).toEqual(["B-12", "Teatro Metropolitano"]);
  });
  it("aparece en la pantalla de bloqueo y vence 6 horas después", () => {
    expect(p.fecha).toBe(boleto.startsAt);
    expect(p.vence).toBe(venceBoleto(boleto.startsAt));
    expect(new Date(p.vence!).getTime() - new Date(boleto.startsAt).getTime()).toBe(6 * 3600 * 1000);
  });
  it("usa los colores del kit de la obra", () => {
    expect(p.colores).toEqual({ fondo: "#13235c", texto: "#ffffff", etiqueta: "#f5c518" });
  });
  it("sin fecha: por anunciar y sin vencimiento", () => {
    const s = paseBoleto({ ...boleto, startsAt: null, lugar: null });
    expect(s.cabecera[0].value).toBe("Por anunciar");
    expect(s.vence).toBeUndefined();
    expect(s.secundarios[1].value).toBe("Por anunciar");
  });
  it("0127: puertas y dirección al reverso", () => {
    const r = paseBoleto({ ...boleto, puertas: "2027-01-24T01:30:00Z", direccion: "Av. Siempre Viva 742" }).reverso;
    expect(r.find((c) => c.key === "puertas")?.value).toBe("Abren 7:30 p.m.");
    expect(r.find((c) => c.key === "direccion")?.value).toBe("Av. Siempre Viva 742");
    expect(paseBoleto(boleto).reverso.some((c) => c.key === "puertas")).toBe(false);
  });
  it("obra sin kit: colores de DARF", () => {
    expect(paseBoleto({ ...boleto, estilo: ESTILO_DARF }).colores.fondo).toBe("#0b0910");
  });
});

describe("paseCredencialWallet", () => {
  const liga = "https://www.darfproductions.com/g/abc123";
  it("Club Fan: dorada, número de socio y el QR de la credencial", () => {
    const pase = paseCredencialFan({ nombre: "Ana", fotoUrl: null, numero: 1, fundador: true, desde: "2026-10-14T00:00:00Z" });
    const p = paseCredencialWallet({ userId: "u1", liga, codigo: "FAN-AB12", pase });
    expect(p.titulo).toBe("DARF Fan Zone");
    expect(p.primarios[0]).toMatchObject({ label: "Socio #0001 · Fan fundador", value: "Ana" });
    expect(p.colores.etiqueta).toBe("#d7bb5f");
    expect(p.qr).toBe(liga);
    expect(p.qrTexto).toBe("FAN-AB12");
    // 0111: el reverso ya no lleva el nivel de DARF Loyalty ni de Fan Zone.
    expect(p.auxiliares.map((x) => x.key)).not.toContain("lealtad");
    expect(p.auxiliares.map((x) => x.key)).not.toContain("fanzone");
  });
  it("Casa DARF: acento azul del holográfico", () => {
    const pase = paseGafete({ nombre: "Diego", fotoUrl: null, franja: "casa", papel: "Dirección General", casaDesde: 2019 });
    expect(paseCredencialWallet({ userId: "u1", liga, codigo: "DRF-AB12", pase }).colores.etiqueta).toBe("#9fe2ff");
  });
  it("Gafete: papel, banda y sello del club", () => {
    const pase = { ...paseGafete({ nombre: "Luis", fotoUrl: null, franja: "produccion", papel: "Director" }), sello: "Socio #0002" };
    const p = paseCredencialWallet({ userId: "u2", liga, codigo: "DRF-XY34", pase });
    expect(p.descripcion).toBe("Gafete DARF");
    expect(p.cabecera[0].value).toBe("PRODUCCIÓN");
    expect(p.primarios[0]).toMatchObject({ label: "Director", value: "Luis" });
    expect(p.secundarios.map((c) => c.value)).toEqual(["DRF-XY34", "Socio #0002"]);
  });
  it("el serial es estable por cuenta y no muestra el id", () => {
    expect(serialCredencial("u1")).toBe(serialCredencial("u1"));
    expect(serialCredencial("u1")).not.toContain("u1");
    expect(serialCredencial("u1")).not.toBe(serialCredencial("u2"));
  });
});

describe("estado del boleto (se actualiza solo)", () => {
  const base = { status: "aprobado", activo: true, cancelado: false, funcionCancelada: false, ingreso: false };
  it("activo: sin cambios", () => {
    const e = estadoBoleto(base);
    expect(e).toEqual({ anulado: false, motivo: null });
    expect(conEstado(paseBoleto(boleto), e)).toEqual(paseBoleto(boleto));
  });
  it("cancelado, rechazado o vencido: anulado", () => {
    expect(estadoBoleto({ ...base, activo: false }).motivo).toBe("Cancelado");
    expect(estadoBoleto({ ...base, status: "rechazado" }).motivo).toBe("Cancelado");
    expect(estadoBoleto({ ...base, cancelado: true }).anulado).toBe(true);
  });
  it("función cancelada gana sobre lo demás", () => {
    expect(estadoBoleto({ ...base, activo: false, funcionCancelada: true }).motivo).toBe("Función cancelada");
  });
  it("ya ingresó: anulado y lo dice al frente y atrás", () => {
    const p = conEstado(paseBoleto(boleto), estadoBoleto({ ...base, ingreso: true }));
    expect(p.anulado).toBe(true);
    expect(p.secundarios[0]).toEqual({ key: "estado", label: "Estado", value: "Ya ingresó" });
    expect(p.reverso[0].value).toBe("Ya ingresó");
    // Apple ignora campos con llave repetida en el mismo pase.
    const llaves = [...p.cabecera, ...p.primarios, ...p.secundarios, ...p.auxiliares, ...p.reverso].map((c) => c.key);
    expect(new Set(llaves).size).toBe(llaves.length);
  });
});
