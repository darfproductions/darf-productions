import { describe, expect, it } from "vitest";
import { audienceLabel, parseAudience } from "./audience";

const fd = (pairs: [string, string][]) => { const f = new FormData(); for (const [k, v] of pairs) f.append(k, v); return f; };

describe("a quién va", () => {
  it("lee el formulario", () => {
    expect(parseAudience(fd([]))).toEqual({ audiencia: "todos", grupos: [], personas: [] });
    expect(parseAudience(fd([["audiencia", "grupos"], ["grupos", "ensamble"], ["grupos", "hackers"]]))).toEqual({ audiencia: "grupos", grupos: ["ensamble"], personas: [] });
    expect(parseAudience(fd([["audiencia", "personas"]]))).toEqual({ error: "Marca al menos a una persona." });
  });
  it("etiqueta", () => {
    expect(audienceLabel({ audiencia: "grupos", grupos: ["reparto", "crew"], personas: [] })).toBe("Reparto y Crew");
    expect(audienceLabel({ audiencia: "personas", grupos: [], personas: ["a"] }, new Map([["a", "Ana"]]))).toBe("Ana");
  });
});
