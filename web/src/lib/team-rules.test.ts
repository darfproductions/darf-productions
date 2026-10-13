import { describe, expect, it } from "vitest";
import { acuerdosTexto, espacioId, espacioPid, parseAcuerdos, parseNoteTargets, parseTeamAudience, teamAudienceLabel, teamFilePath } from "./team-rules";

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const ROLES = ["productor", "direccion", "maestro", "staff", "integrante"];

describe("a quién va (equipo)", () => {
  it("todo el equipo, roles o personas", () => {
    expect(parseTeamAudience(fd({}), ROLES)).toEqual({ audiencia: "todos", roles: [], personas: [] });
    expect(parseTeamAudience(fd({ audiencia: "roles", roles: ["maestro", "integrante", "x"] }), ROLES)).toEqual({ audiencia: "roles", roles: ["maestro"], personas: [] });
    expect(parseTeamAudience(fd({ audiencia: "roles" }), ROLES)).toEqual({ error: "Marca al menos un rol." });
    expect(parseTeamAudience(fd({ audiencia: "personas", personas: "u1" }), ROLES)).toMatchObject({ personas: ["u1"] });
  });
  it("etiqueta legible", () => {
    expect(teamAudienceLabel({ audiencia: "roles", roles: ["maestro", "staff"], personas: [] }, new Map([["maestro", "Maestro"], ["staff", "Staff"]]))).toBe("Maestro, Staff");
    expect(teamAudienceLabel({ audiencia: "todos", roles: [], personas: [] })).toBe("Todo el equipo");
  });
  it("notas: al menos un rol o persona", () => {
    expect(parseNoteTargets(fd({}), ROLES)).toEqual({ error: "Elige al menos un rol o una persona." });
    expect(parseNoteTargets(fd({ para_roles: "staff", para_personas: "u2" }), ROLES)).toEqual({ para_roles: ["staff"], para_personas: ["u2"] });
  });
});

describe("juntas", () => {
  it("acuerdos por renglón con responsable y fecha", () => {
    const a = parseAcuerdos("- Mandar rider | Staff | 20 oct\n\nRevisar vestuario\n• Pagar luces | Producción");
    expect(a).toEqual([
      { texto: "Mandar rider", responsable: "Staff", fecha: "20 oct" },
      { texto: "Revisar vestuario" },
      { texto: "Pagar luces", responsable: "Producción" },
    ]);
    expect(acuerdosTexto(a)).toBe("Mandar rider | Staff | 20 oct\nRevisar vestuario\nPagar luces | Producción");
  });
  it("espacio general y rutas de archivos", () => {
    expect(espacioId(null)).toBe("general");
    expect(espacioPid("general")).toBeNull();
    expect(espacioPid("mm")).toBe("mm");
    expect(teamFilePath(null, "juntas", "Transcripción junta #1.txt", "abc")).toBe("general/juntas/abc-Transcripcion-junta-1.txt");
  });
});

describe("separar juntas", () => {
  it("próximas en orden y pasadas al final", async () => {
    const { separarJuntas } = await import("./team-rules");
    const ahora = new Date("2026-10-12T12:00:00Z");
    const xs = [
      { id: "a", estado: "programada", inicia: "2026-10-14T10:00:00Z" },
      { id: "b", estado: "realizada", inicia: "2026-10-10T10:00:00Z" },
      { id: "c", estado: "programada", inicia: "2026-10-13T10:00:00Z" },
      { id: "d", estado: "programada", inicia: "2026-10-01T10:00:00Z" },
    ];
    const r = separarJuntas(xs, ahora);
    expect(r.proximas.map((x) => x.id)).toEqual(["c", "a"]);
    expect(r.pasadas.map((x) => x.id)).toEqual(["b", "d"]);
  });
});
