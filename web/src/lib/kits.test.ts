import { describe, expect, it } from "vitest";
import { THEMES, themeProblems } from "./themes";

// La regla del kit vale para TODAS las producciones: si una no la cumple, CI falla.
describe("kit de producción", () => {
  for (const [id, t] of Object.entries(THEMES)) {
    it(`${id}: colores legibles y piezas obligatorias`, () => {
      expect(themeProblems(t)).toEqual([]);
      expect(t.logo).toBeTruthy();
      expect(t.ambiente).toBeTruthy();
    });
  }
});
