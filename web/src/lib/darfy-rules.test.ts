import { describe, expect, it } from "vitest";
import { detectarObra, mejorFaq, normalizar, responder, whatsappAskUrl, type DarfyContexto } from "./darfy-rules";

const ctx: DarfyContexto = {
  faq: [
    { id: "f1", pregunta: "¿Cómo compro boletos?", respuesta: "Entra a Cartelera…", palabras: ["comprar", "compro", "boleto", "boletos"], liga: "/cartelera" },
    { id: "f2", pregunta: "¿Qué edad necesito para audicionar?", respuesta: "Depende de la convocatoria.", palabras: ["edad", "años", "niño"], liga: "/audiciones" },
    { id: "f3", pregunta: "¿Cuánto tiempo tengo para pagar?", respuesta: "Hasta 24 horas.", palabras: ["tiempo", "plazo", "vence"], liga: null },
  ],
  obras: [
    { id: "hsm", nombre: "High School Musical", estado: "cartelera", venue: "Teatro Metropolitano", funciones: ["sábado 14 de noviembre, 18:00 · Teatro Metropolitano"], precios: "VIP $500 · General $350" },
    { id: "tbm", nombre: "Teen Beach Movie", estado: "proximamente", venue: null, funciones: [], precios: null },
    { id: "sho", nombre: "Showman", estado: "archivo", venue: null, funciones: [], precios: null },
  ],
  audiciones: [{ id: "a1", titulo: "Audición Teen Beach Movie", obra: "Teen Beach Movie", cierra: "30 de octubre" }],
  registro: { id: "reg" },
};

describe("normalizar", () => {
  it("quita acentos, signos y palabras vacías", () => {
    expect(normalizar("¿Cuándo es la AUDICIÓN?")).toEqual(["cuando", "audicion"]);
  });
});

describe("detectarObra", () => {
  it("por nombre, sin acentos ni mayúsculas", () => {
    expect(detectarObra("cuanto cuesta high school", ctx.obras)?.id).toBe("hsm");
  });
  it("por siglas", () => {
    expect(detectarObra("funciones de HSM?", ctx.obras)?.id).toBe("hsm");
  });
  it("sin obra", () => {
    expect(detectarObra("como compro boletos", ctx.obras)).toBeNull();
  });
});

describe("responder", () => {
  it("pregunta frecuente", () => {
    const r = responder("¿Cómo compro mis boletos?", ctx);
    expect(r.tipo).toBe("faq");
    expect(r.ligas[0].href).toBe("/cartelera");
  });
  it("cartelera con datos en vivo", () => {
    const r = responder("¿qué obras hay?", ctx);
    expect(r.tipo).toBe("dato");
    expect(r.texto).toContain("En cartelera: High School Musical");
    expect(r.texto).toContain("Próximamente: Teen Beach Movie");
    expect(r.texto).not.toContain("Showman");
  });
  it("precios y funciones de una obra", () => {
    const r = responder("cuánto cuestan los boletos de high school musical", ctx);
    expect(r.texto).toContain("VIP $500");
    expect(r.texto).toContain("sábado 14 de noviembre");
    expect(r.ligas[0].href).toBe("/producciones/hsm#funciones");
  });
  it("precios sin obra: la cartelera con precios", () => {
    expect(responder("precios", ctx).texto).toContain("High School Musical (VIP $500");
  });
  it("lugar de una obra", () => {
    expect(responder("¿dónde es hsm?", ctx).texto).toContain("Teatro Metropolitano");
  });
  it("obra próximamente y obra concluida", () => {
    expect(responder("teen beach movie", ctx).texto).toContain("Todavía no hay boletos");
    expect(responder("showman", ctx).texto).toContain("concluyó");
  });
  it("audiciones abiertas y por obra", () => {
    expect(responder("hay audiciones abiertas?", ctx).texto).toContain("Audición Teen Beach Movie");
    expect(responder("audiciones para high school musical", ctx).texto).toContain("no hay convocatoria abierta para High School Musical");
    expect(responder("audiciones para high school musical", ctx).ligas[0].href).toBe("/audiciones/reg");
  });
  it("la pregunta frecuente fuerte gana a la intención", () => {
    expect(responder("qué edad necesito para la audición", ctx).tipo).toBe("faq");
    expect(responder("cuanto tiempo tengo para pagar", ctx).texto).toBe("Hasta 24 horas.");
  });
  it("saludo y gracias", () => {
    expect(responder("Hola!", ctx).texto).toContain("DARFY");
    expect(responder("gracias", ctx).texto).toContain("gusto");
  });
  it("si no sabe, lo dice", () => {
    expect(responder("¿tienen estacionamiento para bicicletas?", ctx).tipo).toBe("nose");
    expect(responder("", ctx).tipo).toBe("nose");
  });
});

describe("mejorFaq y WhatsApp", () => {
  it("plural y singular cuentan igual", () => {
    expect(mejorFaq("comprar boleto", ctx.faq)?.item.id).toBe("f1");
  });
  it("enlace con la pregunta escrita", () => {
    expect(whatsappAskUrl("", "x")).toBe("");
    expect(whatsappAskUrl("5214465220560", "¿Hay estacionamiento?")).toContain(encodeURIComponent("¿Hay estacionamiento?"));
  });
});
