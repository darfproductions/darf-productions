import { describe, expect, it } from "vitest";
import { avisoAnticipacion, precioTexto, tipoVideo, whatsappShowcaseUrl } from "./showcase-rules";

describe("showcases", () => {
  it("arma el mensaje de WhatsApp con lo que llenó", () => {
    const u = whatsappShowcaseUrl("52 446 522 0560", { plan: "Probadita", nombre: "Ana", telefono: "4421234567", fecha: "2026-12-05", personas: 120, notas: "Festival" });
    expect(u.startsWith("https://wa.me/524465220560?text=")).toBe(true);
    const t = decodeURIComponent(u.split("text=")[1]);
    expect(t).toContain("contratar el showcase *Probadita*");
    expect(t).toContain("Fecha: Sábado, 5 de diciembre de 2026");
    expect(t).toContain("Personas: 120");
    expect(t).not.toContain("Horario");
  });
  it("sin número no hay liga", () => {
    expect(whatsappShowcaseUrl("", { plan: "X", nombre: "a", telefono: "1" })).toBe("");
  });
  it("avisa la anticipación", () => {
    const hoy = new Date("2026-11-01T18:00:00Z");
    expect(avisoAnticipacion("2026-11-05", hoy)).toMatch(/menos de 2 semanas/);
    expect(avisoAnticipacion("2026-11-20", hoy)).toMatch(/1 mes/);
    expect(avisoAnticipacion("2026-12-20", hoy)).toBeNull();
    expect(avisoAnticipacion("2026-10-01", hoy)).toMatch(/ya pasó/);
  });
  it("videos y precios", () => {
    expect(tipoVideo("https://youtu.be/abc")).toBe("youtube");
    expect(tipoVideo("https://www.instagram.com/reel/x")).toBe("otro");
    expect(precioTexto(3500)).toBe("$3,500");
    expect(precioTexto(null)).toBe("A cotizar");
  });
});
