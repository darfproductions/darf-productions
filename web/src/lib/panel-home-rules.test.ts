import { describe, expect, it } from "vitest";
import { cuando, cumplesProximos, ordenarPendientes, pendienteHref, pendienteTexto } from "./panel-home-rules";

describe("pendientes del inicio", () => {
  it("texto en singular y plural", () => {
    expect(pendienteTexto({ tipo: "ordenes", production_id: "mm", n: 1 })).toBe("1 orden por aprobar");
    expect(pendienteTexto({ tipo: "documentos", production_id: "mm", n: 3 })).toBe("3 documentos por recibir");
  });
  it("cada pendiente lleva a donde se resuelve", () => {
    expect(pendienteHref({ tipo: "ordenes", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/boletos?estado=pendiente");
    expect(pendienteHref({ tipo: "solicitudes", production_id: null, n: 1 })).toBe("/panel/audiciones");
    expect(pendienteHref({ tipo: "evaluaciones", production_id: "hsm", n: 1 })).toBe("/panel/producciones/hsm/evaluaciones");
  });
  it("órdenes primero; sin ceros", () => {
    const r = ordenarPendientes([
      { tipo: "advertencias", production_id: "mm", n: 2 },
      { tipo: "ordenes", production_id: "mm", n: 0 },
      { tipo: "ordenes", production_id: "hsm", n: 4 },
    ]);
    expect(r.map((x) => `${x.tipo}:${x.production_id}`)).toEqual(["ordenes:hsm", "advertencias:mm"]);
  });
});

describe("fechas", () => {
  const ahora = new Date("2026-10-12T18:00:00Z"); // 12:00 en CDMX
  it("hoy, mañana o el día", () => {
    expect(cuando("2026-10-13T01:00:00Z", ahora)).toBe("Hoy · 19:00");
    expect(cuando("2026-10-13T16:00:00Z", ahora)).toBe("Mañana · 10:00");
    expect(cuando("2026-10-15T01:00:00Z", ahora)).toMatch(/^mié 14 oct · 19:00$/);
  });
  it("cumpleaños de la semana, sin repetir", () => {
    const hoy = new Date(2026, 9, 12);
    const xs = [
      { user_id: "a", nombre: "Ana", dia: 14, mes: 10 },
      { user_id: "b", nombre: "Beto", dia: 12, mes: 10 },
      { user_id: "a", nombre: "Ana", dia: 14, mes: 10 },
      { user_id: "c", nombre: "Carla", dia: 30, mes: 10 },
      { user_id: "d", nombre: "Dani", dia: 11, mes: 10 },
    ];
    expect(cumplesProximos(xs, 7, hoy).map((x) => `${x.nombre}:${x.faltan}`)).toEqual(["Beto:0", "Ana:2"]);
  });
});
