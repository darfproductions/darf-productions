import { describe, expect, it } from "vitest";
import { modoSugerido, rangoCorto, sitioCorto, textoPreventaCodigo, textoPreventaFan } from "./difusion-preventa-rules";

// 24 oct 2026 12:55 p.m. CDMX = 18:55Z; 26 oct 12:55 p.m. = 18:55Z.
const D = "2026-10-24T18:55:00Z", H = "2026-10-26T18:55:00Z";

describe("diseños de preventa", () => {
  it("rango corto", () => {
    expect(rangoCorto(D, H)).toBe("Del 24 al 26 de octubre");
    expect(rangoCorto("2026-10-30T18:00:00Z", "2026-11-02T18:00:00Z")).toBe("Del 30 de octubre al 2 de noviembre");
    expect(rangoCorto(D, null)).toBe("Desde el sábado 24 de octubre");
    expect(rangoCorto(null, null)).toBe("Muy pronto");
  });
  it("modo sugerido", () => {
    expect(modoSugerido(D, H, new Date("2026-10-25T12:00:00Z"))).toBe("ahora");
    expect(modoSugerido(D, H, new Date("2026-10-23T18:00:00Z"))).toBe("manana");
    expect(modoSugerido(D, H, new Date("2026-10-10T18:00:00Z"))).toBe("fechas");
    expect(modoSugerido(D, H, new Date("2026-10-28T18:00:00Z"))).toBe("fechas");
  });
  it("textos del Club Fan", () => {
    expect(textoPreventaFan("ahora", D, H, "darfproductions.com").abajo).toBe("Hasta el lunes 26 de octubre · 12:55 p.m.");
    expect(textoPreventaFan("manana", D, H, "darfproductions.com").abajo).toBe("Abre mañana a las 12:55 p.m.");
    expect(textoPreventaFan("fechas", D, H, "darfproductions.com")).toMatchObject({ abajo: "Del 24 al 26 de octubre", banda: "Únete gratis en darfproductions.com/fan-zone" });
  });
  it("texto del código", () => {
    const t = textoPreventaCodigo({ nombre: "Familias del elenco", codigo: "DARF-3RHPS", desde: "2026-10-22T17:55:00Z", hasta: D, sitio: "darfproductions.com" });
    expect(t.grande).toBe("Familias\ndel elenco");
    expect(t.liga).toBe("darfproductions.com/preventa/DARF-3RHPS");
    expect(t.abajo).toBe("Del 22 al 24 de octubre");
    expect(textoPreventaCodigo({ nombre: "Prensa", codigo: "X", sitio: "s" }).grande).toBe("Prensa");
  });
  it("sitio corto", () => {
    expect(sitioCorto("https://darfproductions.com/")).toBe("darfproductions.com");
    expect(sitioCorto("")).toBe("darfproductions.com");
    expect(sitioCorto("https://www.darfproductions.com")).toBe("darfproductions.com");
  });
});
