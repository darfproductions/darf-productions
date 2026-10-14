import { describe, expect, it } from "vitest";
import { passJson } from "./apple-wallet";
import { conEstado, paseBoleto } from "./wallet-pases";

const c = { passTypeId: "pass.com.darfproductions.wallet", teamId: "ABCDE12345" };
const p = paseBoleto({
  ticketId: "11111111-1111-1111-1111-111111111111", qrToken: "22222222-2222-2222-2222-222222222222", obra: "Showman",
  startsAt: "2026-11-15T02:00:00Z", lugar: "Teatro", asiento: "B-12", orden: "DARF-AB12CD", comprador: "Ana",
  estilo: { fondo: "#13235c", superficie: "#1d2f73", texto: "#ffffff", acento: "#f5c518", logo: null },
});

describe("pass.json de Apple", () => {
  it("sin servicio: no lleva webServiceURL ni voided", () => {
    const j = passJson(c, p, { estilo: "eventTicket" });
    expect(j.webServiceURL).toBeUndefined();
    expect(j.voided).toBeUndefined();
    expect(j.serialNumber).toBe("boleto-11111111-1111-1111-1111-111111111111");
  });
  it("con servicio: el iPhone puede registrarse para recibir cambios", () => {
    const j = passJson(c, p, { estilo: "eventTicket" }, { url: "https://www.darfproductions.com/wallet/apple", token: "x".repeat(64) });
    expect(j.webServiceURL).toBe("https://www.darfproductions.com/wallet/apple");
    expect(j.authenticationToken).toBe("x".repeat(64));
  });
  it("boleto cancelado: voided y el estado al frente", () => {
    const j = passJson(c, conEstado(p, { anulado: true, motivo: "Cancelado" }), { estilo: "eventTicket", franjaConNombre: true });
    expect(j.voided).toBe(true);
    expect((j.eventTicket as { secondaryFields: { value: string }[] }).secondaryFields[0].value).toBe("Cancelado");
  });
});
