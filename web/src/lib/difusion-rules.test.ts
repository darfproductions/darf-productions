import { describe, expect, it } from "vitest";
import { DISENOS, diasFaltan, fechaLarga, hora, rangoFechas, textoDifusion, tipoValido } from "./difusion-rules";

// Funciones a las 5 p.m. de CDMX (23:00 UTC).
const f1 = { starts_at: "2026-11-07T23:00:00Z", venue: "Teatro Diana" };
const f2 = { starts_at: "2026-11-22T23:00:00Z", venue: "Teatro Diana" };
const f3 = { starts_at: "2026-12-06T23:00:00Z", venue: "Teatro Diana" };
const hoy = new Date("2026-11-02T18:00:00Z");

describe("difusión (0111)", () => {
  it("diez diseños y tipos válidos", () => {
    expect(DISENOS).toHaveLength(10);
    expect(tipoValido("faltan")).toBe("faltan");
    expect(tipoValido("x")).toBeNull();
  });
  it("días que faltan en hora de México", () => {
    expect(diasFaltan(f1.starts_at, hoy)).toBe(5);
    // 11:30 p.m. del día 6 en CDMX ya es día 7 en UTC: sigue faltando 1 día.
    expect(diasFaltan(f1.starts_at, new Date("2026-11-07T05:30:00Z"))).toBe(1);
    expect(diasFaltan(f1.starts_at, new Date("2026-11-07T18:00:00Z"))).toBe(0);
  });
  it("fechas", () => {
    expect(fechaLarga(f1.starts_at)).toBe("Sábado 7 de noviembre");
    expect(hora(f1.starts_at)).toBe("5:00 p.m.");
    expect(rangoFechas([f2, f1])).toBe("7 al 22 de noviembre");
    expect(rangoFechas([f1, f3])).toBe("7 de noviembre al 6 de diciembre");
    expect(rangoFechas([f1])).toBe("Sábado 7 de noviembre");
    expect(rangoFechas([])).toBe("Próximamente");
  });
  it("faltan X días: número grande, mañana y hoy", () => {
    const t = textoDifusion("faltan", { funcion: f1, funciones: [f1], hoy });
    expect(t).toMatchObject({ arriba: "Faltan", grande: "5", numero: true, abajo: "días", banda: "Adquiere tus boletos" });
    expect(t.detalle).toBe("Sábado 7 de noviembre · 5:00 p.m.");
    expect(t.lugar).toBe("Teatro Diana");
    expect(textoDifusion("faltan", { funcion: f1, funciones: [f1], hoy: new Date("2026-11-06T18:00:00Z") }).grande).toBe("¡Es mañana!");
    expect(textoDifusion("faltan", { funcion: f1, funciones: [f1], hoy: new Date("2026-11-07T18:00:00Z") }).grande).toBe("¡Es hoy!");
    // Sin funciones todavía: no inventa una cuenta regresiva.
    expect(textoDifusion("faltan", { funciones: [] }).grande).toBe("Muy pronto");
  });
  it("temporada, preventa, agotadas y gracias", () => {
    expect(textoDifusion("venta", { funciones: [f1, f2], venue: "Teatro Diana" }).detalle).toBe("7 al 22 de noviembre");
    const p = textoDifusion("preventa", { funcion: { ...f1, preventa_hasta: "2026-11-01T06:00:00Z" }, funciones: [f1] });
    expect(p).toMatchObject({ grande: "Preventa\nClub Fan", oro: true, abajo: "Exclusiva hasta el domingo 1 de noviembre" });
    expect(textoDifusion("agotadas", { funciones: [f1, f2] }).grande).toBe("Funciones\nagotadas");
    expect(textoDifusion("agotadas", { funcion: f1, funciones: [f1, f2] }).grande).toBe("Función\nagotada");
    expect(textoDifusion("hoy", { funcion: f1, funciones: [f1] }).detalle).toBe("5:00 p.m.");
    expect(textoDifusion("gracias", { funcion: f1, funciones: [f1, f2] }).detalle).toBe("7 al 22 de noviembre");
  });
});
