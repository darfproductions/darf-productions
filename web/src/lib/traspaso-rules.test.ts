import { describe, expect, it } from "vitest";
import { boletosPasables, correoValido, estadoLiga, ligaTraspaso, puedePasar, textoEnviado, textoRecibido, whatsappTraspasoUrl, type Traspaso } from "./traspaso-rules";

const t = (x: Partial<Traspaso>): Traspaso => ({ id: "1", order_id: "o", new_order_id: null, estado: "pendiente", token: "tok", created_at: "", resolved_at: null, direccion: "enviado", to_email: "b@b.com", to_nombre: null, from_nombre: "Ana", boletos: 2, etiquetas: ["A1", "A2"], mensaje: null, ...x });

describe("pasar boletos (0142)", () => {
  const ahora = new Date("2026-11-12T18:00:00Z");
  it("solo boletos activos y sin usar; solo órdenes pagadas de funciones por venir", () => {
    const tickets = [{ id: "a", is_active: true, checked_in_at: null }, { id: "b", is_active: false, checked_in_at: null }, { id: "c", is_active: true, checked_in_at: "2026-11-01" }];
    expect(boletosPasables(tickets).map((x) => x.id)).toEqual(["a"]);
    expect(puedePasar({ status: "aprobado", tickets }, "2026-12-01T02:00:00Z", false, ahora)).toBe(true);
    expect(puedePasar({ status: "pendiente", tickets }, "2026-12-01T02:00:00Z", false, ahora)).toBe(false);
    expect(puedePasar({ status: "aprobado", tickets }, "2026-11-12T17:00:00Z", false, ahora)).toBe(false);
    expect(puedePasar({ status: "aprobado", tickets }, "2026-12-01T02:00:00Z", true, ahora)).toBe(false);
    expect(puedePasar({ status: "aprobado", tickets: [tickets[2]] }, "2026-12-01T02:00:00Z", false, ahora)).toBe(false);
  });
  it("correo", () => {
    expect(correoValido(" ana@x.com ")).toBe(true);
    expect(correoValido("ana@x")).toBe(false);
    expect(correoValido("")).toBe(false);
  });
  it("textos para quien manda y quien recibe", () => {
    expect(textoEnviado(t({}))).toBe("Pasaste 2 boletos a b@b.com · esperando que los acepte.");
    expect(textoEnviado(t({ estado: "aceptada", to_nombre: "Beto" }))).toBe("Pasaste 2 boletos a Beto. Ya los tiene en su cuenta.");
    expect(textoEnviado(t({ estado: "cancelada", boletos: 1 }))).toBe("Cancelaste el traspaso de 1 boleto a b@b.com.");
    expect(textoRecibido(t({ direccion: "recibido", boletos: 1 }))).toBe("Te lo pasó Ana.");
    expect(textoRecibido(t({ direccion: "recibido", mensaje: "Para tu mamá" }))).toBe("Te los pasó Ana: «Para tu mamá»");
  });
  it("liga y WhatsApp", () => {
    expect(ligaTraspaso("https://darfproductions.com/", "abc")).toBe("https://darfproductions.com/cuenta/traspaso/abc");
    const u = whatsappTraspasoUrl({ obra: "Showman", funcion: "Sábado 23 de enero, 8:30 p.m.", boletos: 2, liga: "https://d.com/cuenta/traspaso/abc" });
    expect(u.startsWith("https://wa.me/?text=Te%20paso%202%20boletos%20para%20Showman")).toBe(true);
    expect(decodeURIComponent(u)).toContain("https://d.com/cuenta/traspaso/abc");
  });
  it("estado de la liga", () => {
    const base = { estado: "pendiente", vencida: false, para_mi: true, soy_quien_manda: false };
    expect(estadoLiga(base)).toBe("aceptar");
    expect(estadoLiga({ ...base, soy_quien_manda: true })).toBe("soy_yo");
    expect(estadoLiga({ ...base, estado: "aceptada" })).toBe("aceptada");
    expect(estadoLiga({ ...base, estado: "cancelada" })).toBe("cancelada");
    expect(estadoLiga({ ...base, vencida: true })).toBe("vencida");
    expect(estadoLiga({ ...base, para_mi: false })).toBe("otra_cuenta");
  });
});
