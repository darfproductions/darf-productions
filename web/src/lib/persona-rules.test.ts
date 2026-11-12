import { describe, expect, it } from "vitest";
import { estadoDoc, pestanaValida, pestanasFicha, porObra, type PersonaFicha } from "./persona-rules";

const obra = (x: Partial<PersonaFicha["obras"][number]>): PersonaFicha["obras"][number] =>
  ({ production_id: "a", obra: "A", rol: "Integrante", integrante: true, ingreso: null, baja_at: null, baja_motivo: null, documentos: false, pagos: false, asistencia: false, incidencias: false, ...x });
const vacia: PersonaFicha = { obras: [], documentos: [], pagos: [], asistencia: [], ultimos: [], incidencias: [] };

describe("ficha de persona (0141)", () => {
  it("pestañas según permisos por obra", () => {
    expect(pestanasFicha(null).map((p) => p.id)).toEqual(["obras"]);
    expect(pestanasFicha({ ...vacia, obras: [obra({ asistencia: true }), obra({ production_id: "b", obra: "B", documentos: true, pagos: true })] }).map((p) => p.id)).toEqual(["obras", "documentos", "pagos", "asistencia"]);
    expect(pestanaValida("pagos", pestanasFicha({ ...vacia, obras: [obra({ asistencia: true })] }))).toBe("obras");
    expect(pestanaValida("asistencia", pestanasFicha({ ...vacia, obras: [obra({ asistencia: true })] }))).toBe("asistencia");
  });
  it("estado de un documento", () => {
    expect(estadoDoc({ archivo_path: "x", entregado_at: "2026-10-03T18:00:00Z" })).toEqual({ label: "Recibido el 3 de octubre", ok: true });
    expect(estadoDoc({ archivo_path: "x", entregado_at: null })).toEqual({ label: "Subido, sin revisar", ok: false });
    expect(estadoDoc({ archivo_path: null, entregado_at: null })).toEqual({ label: "Pendiente", ok: false });
  });
  it("agrupa por obra conservando el orden", () => {
    const g = porObra([{ production_id: "a", obra: "A", n: 1 }, { production_id: "b", obra: "B", n: 2 }, { production_id: "a", obra: "A", n: 3 }]);
    expect(g.map((x) => [x.obra, x.items.map((i) => i.n)])).toEqual([["A", [1, 3]], ["B", [2]]]);
  });
});
