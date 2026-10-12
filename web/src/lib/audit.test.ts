import { describe, expect, it } from "vitest";
import { changedFields, describeAudit, type AuditNames, type AuditRow } from "./audit";

const names: AuditNames = {
  person: (id) => (id === "u1" ? "Ana" : "alguien"),
  role: (id) => (id === "taquilla" ? "Taquilla" : String(id)),
  production: (id) => (id === "mm" ? "Mamma Mia" : String(id)),
};
const base: AuditRow = { id: 1, at: "2026-10-11T00:00:00Z", actor: null, tabla: "", accion: "insert", registro_id: null, production_id: null, antes: null, despues: null };

describe("bitácora en lenguaje sencillo", () => {
  it("roles por obra", () => {
    const row = { user_id: "u1", role_id: "taquilla", production_id: "mm" };
    expect(describeAudit({ ...base, tabla: "production_members", despues: row }, names)).toBe("Dio a Ana el rol Taquilla en Mamma Mia");
    expect(describeAudit({ ...base, tabla: "production_members", accion: "delete", antes: row }, names)).toBe("Quitó a Ana como Taquilla en Mamma Mia");
  });
  it("cambio de rol general", () => {
    expect(describeAudit({ ...base, tabla: "profiles", accion: "update", despues: { id: "u1", rol: "admin" } }, names)).toBe(
      "Cambió el rol general de Ana a Director",
    );
  });
  it("cambios en una obra", () => {
    const antes = { nombre: "Mamma Mia", estado: "publicada", frase: "a", updated_at: "1" };
    expect(describeAudit({ ...base, tabla: "productions", accion: "update", antes, despues: { ...antes, estado: "archivada" } }, names)).toBe(
      "Cambió Mamma Mia a archivada",
    );
    expect(changedFields(antes, { ...antes, frase: "b", updated_at: "2" })).toEqual(["frase"]);
  });
});

describe("bitácora del mapa de asientos", () => {
  const names = { person: () => "Ana", role: String, production: (id: unknown) => (id === "mm" ? "Mamma Mia" : "Showman") };
  const row = (accion: string, despues: Record<string, unknown>) => ({ id: 1, at: "", actor: null, tabla: "seats", accion, registro_id: null, production_id: "mm", antes: null, despues });
  it("una línea por cambio", () => {
    expect(describeAudit(row("mapa", { asientos: 120 }), names)).toBe("Guardó el mapa de asientos de Mamma Mia (120 asientos)");
    expect(describeAudit(row("copiar", { asientos: 5, origen: "showman" }), names)).toBe("Copió a Mamma Mia el mapa de asientos de Showman (5 asientos)");
    expect(describeAudit(row("quitar", { asientos: 1 }), names)).toBe("Quitó 1 asiento del mapa de Mamma Mia");
  });
});
