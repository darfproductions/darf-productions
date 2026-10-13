import { describe, expect, it } from "vitest";
import { ageAt, criteriosFromText, dayStatus, daySummary, lugares, minutos, score, videoSource } from "./audition-rules";
import { EN_BLANCO, PLANTILLAS, REGISTRO_PERMANENTE } from "./audition-templates";

describe("audiciones", () => {
  it("edad cumplida a la fecha de la audición", () => {
    expect(ageAt("2010-05-20", new Date("2027-05-19T12:00:00Z"))).toBe(16);
    expect(ageAt("2010-05-20", new Date("2027-05-20T12:00:00Z"))).toBe(17);
    expect(ageAt("20/05/2010")).toBeNull();
  });
  it("lugares disponibles nunca negativos", () => {
    expect(lugares(10, 3)).toBe(7);
    expect(lugares(1, 2)).toBe(0);
  });
  it("promedios legibles", () => {
    expect(score("4.50")).toBe("4.5");
    expect(score(4)).toBe("4");
    expect(score(null)).toBe("—");
  });
});

describe("audiciones 2.0", () => {
  const base = { checked_in_at: null, entered_at: null, finished_at: null, estado: "inscrito" };
  it("paso del día", () => {
    expect(dayStatus(base)).toBe("pendiente");
    expect(dayStatus({ ...base, checked_in_at: "x" })).toBe("llego");
    expect(dayStatus({ ...base, checked_in_at: "x", entered_at: "y" })).toBe("en_sala");
    expect(dayStatus({ ...base, checked_in_at: "x", entered_at: "y", finished_at: "z" })).toBe("termino");
    expect(dayStatus({ ...base, estado: "no_cumple" })).toBe("no_cumple");
  });
  it("resumen y quién sigue (el primero en espera de la lista)", () => {
    const rows = [
      { ...base, n: 1, checked_in_at: "a", entered_at: "b", finished_at: "c" },
      { ...base, n: 2, checked_in_at: "a", entered_at: "b" },
      { ...base, n: 3 },
      { ...base, n: 4, checked_in_at: "a" },
      { ...base, n: 5, checked_in_at: "a" },
    ];
    const s = daySummary(rows);
    expect([s.termino, s.en_sala, s.pendiente, s.llego]).toEqual([1, 1, 1, 2]);
    expect(s.sigue?.n).toBe(4);
  });
  it("minutos en sala", () => {
    expect(minutos("2026-10-11T10:00:00Z", "2026-10-11T10:07:20Z")).toBe(7);
    expect(minutos(null, "2026-10-11T10:00:00Z")).toBeNull();
  });
  it("enlaces de video: solo https", () => {
    expect(videoSource("https://youtu.be/abc")).toBe("youtube");
    expect(videoSource("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(videoSource("https://drive.google.com/file/d/x")).toBe("drive");
    expect(videoSource("http://youtu.be/abc")).toBeNull();
    expect(videoSource("javascript:alert(1)")).toBeNull();
  });
  it("la plantilla de escuela no pide tutor pero deja constancia de la autorización", () => {
    expect(PLANTILLAS.escuela.opciones.pedir_tutor).toBe(false);
    expect(PLANTILLAS.escuela.opciones.autorizacion_escuela).toBe(true);
  });
  it("todas las plantillas cumplen las reglas de la base (0037, 0038)", () => {
    for (const t of [...Object.values(PLANTILLAS), EN_BLANCO, REGISTRO_PERMANENTE]) {
      expect(t.opciones.pedir_tutor || t.opciones.autorizacion_escuela).toBe(true);
      expect(!t.opciones.solo_invitados || t.opciones.visibilidad === "enlace").toBe(true);
      expect(t.criterios.length).toBeGreaterThan(0);
      expect(t.criterios.length).toBeLessThanOrEqual(8);
      expect(new Set(t.criterios.map((c) => c.k)).size).toBe(t.criterios.length);
      for (const c of t.criterios) expect(c.k).toMatch(/^[a-z0-9_]{1,30}$/);
      for (const q of t.preguntas) if (q.tipo === "opcion") expect((q.opciones ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("las 3 principales son abierta, escuela y cerrada", () => {
    expect(Object.entries(PLANTILLAS).filter(([, t]) => t.grupo === "principal").map(([k]) => k)).toEqual(["abierta", "escuela", "cerrada"]);
  });
  it("criterios escritos a mano", () => {
    expect(criteriosFromText("Técnica, Fuerza,\nPresencia escénica, técnica")).toEqual([
      { k: "tecnica", l: "Técnica" }, { k: "fuerza", l: "Fuerza" }, { k: "presencia_escenica", l: "Presencia escénica" },
    ]);
    expect(criteriosFromText("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
    expect(criteriosFromText(" , ")).toEqual([]);
  });
});
