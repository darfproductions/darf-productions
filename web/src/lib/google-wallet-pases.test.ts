import { describe, expect, it } from "vitest";
import { paseCredencialFan } from "./credencial-fan-rules";
import { claseBoleto, idGoogle, isoMx, objetoBoleto, objetoCredencial } from "./google-wallet-pases";
import { paseBoleto, paseCredencialWallet } from "./wallet-pases";

const ISS = "3388000000023203308";
const p = paseBoleto({
  ticketId: "11111111-1111-1111-1111-111111111111", qrToken: "22222222-2222-2222-2222-222222222222", obra: "Showman",
  startsAt: "2026-11-15T02:00:00Z", lugar: "Teatro", asiento: "B-12", orden: "DARF-AB12CD", comprador: "Ana",
  estilo: { fondo: "#13235c", superficie: "#1d2f73", texto: "#ffffff", acento: "#f5c518", logo: null },
});

describe("Google Wallet", () => {
  it("los IDs llevan el emisor y solo caracteres válidos", () => {
    expect(idGoogle(ISS, "boleto-a b/c")).toBe(`${ISS}.boleto-a_b_c`);
  });
  it("clase por función con obra, lugar, fecha, logo y color", () => {
    const c = claseBoleto(ISS, "f1", p, "Showman", "Teatro", { logo: "https://x/logo.png", hero: "https://x/hero.png" });
    expect(c).toMatchObject({ id: `${ISS}.funcion-f1`, reviewStatus: "UNDER_REVIEW", hexBackgroundColor: "#13235c", dateTime: { start: "2026-11-14T20:00:00-06:00" } });
    expect(c.eventName.defaultValue.value).toBe("Showman");
    expect(c.heroImage?.sourceUri.uri).toBe("https://x/hero.png");
  });
  it("la hora va en hora de México (no UTC)", () => {
    expect(isoMx("2026-10-21T03:00:00Z")).toBe("2026-10-20T21:00:00-06:00");
  });
  it("objeto por boleto con el mismo QR de la puerta y vencimiento", () => {
    const o = objetoBoleto(ISS, `${ISS}.funcion-f1`, p, { asiento: "B-12", comprador: "Ana", orden: "DARF-AB12CD" });
    expect(o.id).toBe(`${ISS}.boleto-11111111-1111-1111-1111-111111111111`);
    expect(o.barcode).toEqual({ type: "QR_CODE", value: "22222222-2222-2222-2222-222222222222", alternateText: "DARF-AB12CD" });
    expect(o.validTimeInterval?.end.date).toBe(p.vence);
    expect(o.seatInfo.seat.defaultValue.value).toBe("B-12");
  });
  it("credencial: nombre, socio y QR de la credencial", () => {
    const c = paseCredencialWallet({ userId: "u1", liga: "https://x/g/abc", codigo: "FAN-AB12", pase: paseCredencialFan({ nombre: "Ana", fotoUrl: null, numero: 7, fundador: true, desde: "2026-10-14T00:00:00Z" }) });
    const o = objetoCredencial(ISS, c, { logo: "https://x/fan.png" });
    expect(o.header.defaultValue.value).toBe("Ana");
    expect(o.subheader.defaultValue.value).toBe("Socio #0007 · Fan fundador");
    expect(o.barcode.value).toBe("https://x/g/abc");
    expect(o.classId).toBe(`${ISS}.credencial-darf`);
  });
});
