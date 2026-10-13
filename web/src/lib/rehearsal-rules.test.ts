import { describe, expect, it } from "vitest";
import { citados, fechasRecurrentes, porcentaje } from "./rehearsal-rules";

describe("ensayos", () => {
  it("a quién se cita", () => {
    expect(citados({ convocatoria: "todos", grupos: [], personas: [] })).toBe("Todo el elenco");
    expect(citados({ convocatoria: "grupos", grupos: ["ensamble", "crew"], personas: [] })).toBe("Ensamble y Crew");
    expect(citados({ convocatoria: "personas", grupos: [], personas: ["a", "b"] })).toBe("2 personas");
  });
  it("porcentaje de asistencia", () => {
    expect(porcentaje({ presentes: 6, retardos: 2, faltas: 2, justificadas: 3 })).toBe(80);
    expect(porcentaje({ presentes: 0, retardos: 0, faltas: 0, justificadas: 1 })).toBeNull();
  });
  it("ensayos recurrentes: todos los sábados de noviembre", () => {
    expect(fechasRecurrentes("2026-11-01", "2026-11-30", [6])).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"]);
    expect(fechasRecurrentes("2026-11-01", "2026-11-08", [2, 4])).toEqual(["2026-11-03", "2026-11-05"]);
    expect(fechasRecurrentes("2026-11-10", "2026-11-01", [6])).toEqual([]);
    expect(fechasRecurrentes("2026-01-01", "2030-12-31", [0, 1, 2, 3, 4, 5, 6])).toHaveLength(120);
  });
});
