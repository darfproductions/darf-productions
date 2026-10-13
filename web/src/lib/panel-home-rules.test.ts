import { describe, expect, it } from "vitest";
import { cuando, cumplesProximos, esHoy, ordenarPendientes, pendienteHref, pendienteTexto, porObra, totalPendientes } from "./panel-home-rules";

describe("pendientes del inicio", () => {
  it("texto en singular y plural", () => {
    expect(pendienteTexto({ tipo: "ordenes", production_id: "mm", n: 1 })).toBe("1 orden de boletos por aprobar");
    expect(pendienteTexto({ tipo: "documentos", production_id: "mm", n: 3 })).toBe("3 documentos subidos por revisar");
  });
  it("cada pendiente lleva a donde se resuelve", () => {
    expect(pendienteHref({ tipo: "ordenes", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/boletos?estado=pendiente");
    expect(pendienteHref({ tipo: "solicitudes", production_id: null, n: 1 })).toBe("/panel/audiciones");
    expect(pendienteHref({ tipo: "evaluaciones", production_id: "hsm", n: 1 })).toBe("/panel/producciones/hsm/evaluaciones");
    expect(pendienteHref({ tipo: "notas_equipo", production_id: null, n: 1 })).toBe("/cuenta/equipo/general");
    expect(pendienteTexto({ tipo: "notas_equipo", production_id: "mm", n: 2 })).toBe("2 notas de dirección para ti");
  });
  it("0085: ligas directas a la acción", () => {
    expect(pendienteHref({ tipo: "pagos_evento", production_id: null, n: 2, ref_id: "e1" })).toBe("/panel/eventos#e-e1");
    expect(pendienteHref({ tipo: "solicitudes", production_id: "mm", n: 1, ref_id: "a1" })).toBe("/panel/audiciones/a1/solicitudes");
    expect(pendienteHref({ tipo: "ofertas", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/elenco");
    expect(pendienteHref({ tipo: "documentos", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/expedientes?docs=subidos");
    expect(pendienteHref({ tipo: "adeudos", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/expedientes/adeudos?ver=vencidos");
    expect(pendienteHref({ tipo: "decision", production_id: "mm", n: 1 })).toBe("/panel/producciones/mm/expedientes#decision");
  });
  it("agrupar por obra y total", () => {
    const xs = [
      { tipo: "advertencias" as const, production_id: "mm", n: 2 },
      { tipo: "pagos_evento" as const, production_id: null, n: 1, ref_id: "e" },
      { tipo: "ordenes" as const, production_id: "mm", n: 3 },
    ];
    expect(porObra(xs).map((g) => [g.production_id, g.total, g.items.map((i) => i.tipo)])).toEqual([["mm", 5, ["ordenes", "advertencias"]], [null, 1, ["pagos_evento"]]]);
    expect(totalPendientes(xs)).toBe(6);
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
  it("es hoy en CDMX", () => {
    expect(esHoy("2026-10-13T04:00:00Z", ahora)).toBe(true); // 22:00 del 12 en CDMX
    expect(esHoy("2026-10-13T07:00:00Z", ahora)).toBe(false);
  });
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
