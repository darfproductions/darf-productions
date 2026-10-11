import { describe, expect, it } from "vitest";
import { can, globalSections, hasAnyAccess, myProductionIds, productionTabs, roleIdFromName, type PanelAccessData } from "./panel-nav";

const director: PanelAccessData = { isDirector: true, byProduction: {} };
const fan: PanelAccessData = { isDirector: false, byProduction: {} };
const taquillaMM: PanelAccessData = {
  isDirector: false,
  byProduction: { mm: ["obra.ver", "ventas.ver", "ventas.operar", "descuentos.gestionar", "reportes.ver"] },
};
const juezMM: PanelAccessData = { isDirector: false, byProduction: { mm: ["audiciones.evaluar"] } };

const ids = (a: PanelAccessData, p: string) => productionTabs(a, p).map((t) => t.id);

describe("acceso al panel", () => {
  it("un fan no entra; taquilla y Director sí", () => {
    expect(hasAnyAccess(fan)).toBe(false);
    expect(hasAnyAccess(taquillaMM)).toBe(true);
    expect(hasAnyAccess(director)).toBe(true);
  });
  it("los permisos son por obra", () => {
    expect(can(taquillaMM, "mm", "ventas.operar")).toBe(true);
    expect(can(taquillaMM, "hsm", "ventas.operar")).toBe(false);
    expect(can(director, "hsm", "permisos.gestionar")).toBe(true);
    expect(myProductionIds(taquillaMM)).toEqual(["mm"]);
  });
});

describe("pestañas de la obra", () => {
  it("taquilla ve Resumen y Funciones, no Audiciones ni Permisos", () => {
    expect(ids(taquillaMM, "mm")).toEqual(["resumen", "boletos"]);
  });
  it("un juez solo ve Resumen y Audiciones", () => {
    expect(ids(juezMM, "mm")).toEqual(["resumen", "audiciones"]);
  });
  it("sin permisos en la obra no hay pestañas", () => {
    expect(ids(taquillaMM, "hsm")).toEqual([]);
  });
  it("el Director ve todas, con Permisos al final", () => {
    const tabs = ids(director, "hsm");
    expect(tabs[0]).toBe("resumen");
    expect(tabs.at(-1)).toBe("permisos");
    expect(tabs).toHaveLength(12);
  });
});

describe("secciones generales", () => {
  it("Usuarios, Roles y Bitácora solo para el Director", () => {
    expect(globalSections(taquillaMM).map((s) => s.label)).toEqual(["Inicio", "Producciones"]);
    expect(globalSections(director).map((s) => s.label)).toContain("Bitácora");
  });
});

describe("id de rol personalizado", () => {
  it("quita acentos y espacios", () => {
    expect(roleIdFromName("Vestuario y Utilería")).toBe("vestuario_y_utileria");
    expect(roleIdFromName("  Coreografía!! ")).toBe("coreografia");
  });
});
