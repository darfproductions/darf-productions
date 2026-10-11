import { describe, expect, it } from "vitest";
import { citados, porcentaje } from "./rehearsal-rules";

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
});
