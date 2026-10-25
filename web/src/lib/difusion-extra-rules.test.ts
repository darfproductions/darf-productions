import { describe, expect, it } from "vitest";
import { funcionesPorDia, pasosComprar, precioCorto, precioZona, zonasIncluye, puntosMapa, renglonesCalendario, telefonoLegible, textoInvitacion, textosPreparate } from "./difusion-extra-rules";
import { ACCESO_TARDIO_OMISION, LOGISTICA_OMISION } from "./logistica-rules";

describe("más diseños de difusión", () => {
  it("mapa por filas: cabe en el lienzo y deja lugar al escenario", () => {
    const asientos = ["A", "B"].flatMap((f) => [1, 2, 3, 4].map((n) => ({ x: null, y: null, fila: f, numero: n, lado: "central", zona: "z" })));
    const r = puntosMapa(asientos, [], 1000, 500);
    expect(r.puntos).toHaveLength(8);
    expect(r.escenarioArriba).toBe(true);
    for (const p of r.puntos) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1000); expect(p.y).toBeGreaterThanOrEqual(70); expect(p.y).toBeLessThanOrEqual(500); }
  });
  it("mapa libre: usa posiciones y escala el escenario", () => {
    const r = puntosMapa([{ x: 0, y: 100, fila: "A", numero: 1, lado: null, zona: "z" }, { x: 200, y: 100, fila: "A", numero: 2, lado: null, zona: "z" }],
      [{ id: "e", tipo: "rect", etiqueta: "Escenario", x: 100, y: 0, ancho: 200, alto: 40, rot: 0 }], 400, 400);
    expect(r.escenarioArriba).toBe(false);
    expect(r.formas[0].ancho).toBeCloseTo(r.puntos[1].x - r.puntos[0].x, 0);
  });
  it("textos", () => {
    expect(precioCorto(1350)).toBe("$1,350");
    expect(telefonoLegible("524465220560")).toBe("446 522 0560");
    const p = pasosComprar({ whatsapp: "524465220560", liga: "darfproductions.com/producciones/showman", modo: "hibrido" });
    expect(p.map((x) => x.titulo)).toEqual(["Por WhatsApp", "En la página"]);
    expect(p[0].pasos[0]).toBe("Escríbenos al 446 522 0560");
    expect(pasosComprar({ whatsapp: "", liga: "x", modo: "whatsapp" })).toHaveLength(1);
  });
  it("calendario e invitación", () => {
    const fs = ["2026-12-05T02:00:00Z", "2026-12-06T02:00:00Z", "2026-12-07T02:00:00Z"].map((starts_at) => ({ starts_at }));
    const r = renglonesCalendario(fs, 2, new Date("2026-11-01T00:00:00Z"));
    expect(r.renglones[0]).toEqual({ fecha: "Viernes 4 de diciembre", hora: "8:00 p.m." });
    expect(r.mas).toBe(1);
    expect(textoInvitacion({ funcion: fs[0], rango: "x" })).toEqual({ fecha: "Viernes 4 de diciembre", hora: "8:00 p.m." });
    expect(textoInvitacion({ funcion: null, rango: "4 al 6 de diciembre" }).hora).toBeNull();
  });
});

describe("Prepárate para tu función (0127)", () => {
  const h = { puertas: "2027-01-24T01:30:00Z", inicio: "2027-01-24T02:00:00Z", termina: "2027-01-24T04:10:00Z", intermedio: 15 };
  it("tres horas y recordatorios con la logística de la obra", () => {
    const x = textosPreparate(h, { ...LOGISTICA_OMISION, acceso_tardio: "Después de iniciar no hay acceso.", indicaciones: "\n Estacionamiento gratis en la explanada \nNo se permiten alimentos" });
    expect(x.horas.map((y) => `${y.etiqueta} ${y.hora}`)).toEqual(["Puertas 7:30 p.m.", "Función 8:00 p.m.", "Salida aprox. 10:10 p.m."]);
    expect(x.recordatorios).toEqual(["Ten tu boleto con QR a la mano: en tu cuenta, PDF o Wallet.", "Después de iniciar no hay acceso.", "Estacionamiento gratis en la explanada"]);
  });
  it("sin textos: los de omisión", () => {
    const x = textosPreparate(h, null);
    expect(x.recordatorios[1]).toBe(ACCESO_TARDIO_OMISION);
    expect(x.recordatorios[2]).toContain("señal");
  });

  it("lo que incluye: primero las zonas con beneficios (VIP arriba), las demás juntas", () => {
    const z = (nombre: string, precio: number, n: number) => ({ nombre, precio, beneficios: Array.from({ length: n }, (_, i) => i) });
    // El orden de Showman: Discapacitados, General, Orquesta, Preferente A, VIP.
    const zonas = [z("Discapacitados", 300, 0), z("General", 350, 0), z("Orquesta", 450, 0), z("Preferente A", 600, 1), z("VIP", 900, 3)];
    const r = zonasIncluye(zonas, 3);
    expect(r.conBeneficios.map((x) => x.nombre)).toEqual(["VIP", "Preferente A"]);
    expect(r.resto.map((x) => x.nombre)).toEqual(["Orquesta", "General", "Discapacitados"]);
    expect(zonasIncluye(zonas, 1).resto[0].nombre).toBe("Preferente A");
  });
  it("precio de zona: fijo o desde", () => {
    expect(precioZona({ precio: 350, precioMax: 350 })).toBe("$350");
    expect(precioZona({ precio: 350, precioMax: 450 })).toBe("Desde $350");
    expect(precioZona({ precio: null, precioMax: null })).toBe("");
  });
  it("invitación: funciones agrupadas por día", () => {
    const hoy = new Date("2026-10-25T12:00:00Z");
    const fs = ["2027-01-23T22:00:00Z", "2027-01-24T01:00:00Z", "2027-01-30T22:00:00Z", "2027-01-31T22:00:00Z"].map((starts_at) => ({ starts_at }));
    const r = funcionesPorDia(fs, 2, hoy);
    expect(r.dias).toHaveLength(2);
    // 4:00 p.m. y 7:00 p.m. de México caen el mismo sábado 23.
    expect(r.dias[0].fecha).toMatch(/23 de enero/);
    expect(r.dias[0].horas).toBe("4:00 p.m. y 7:00 p.m.");
    expect(r.mas).toBe(1);
  });
});
