import { describe, expect, it } from "vitest";
import { can, globalSections, groupMembers, hasAnyAccess, myProductionIds, productionIdFrom, productionTabs, roleDiff, roleIdFromName, type PanelAccessData } from "./panel-nav";

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

describe("varios roles por persona", () => {
  const rows = [
    { id: "1", user_id: "u1", nombre: "Ana", email: "a@x.mx", role_id: "registro", role_nombre: "Mesa de registro" },
    { id: "2", user_id: "u2", nombre: "Beto", email: "b@x.mx", role_id: "taquilla", role_nombre: "Taquilla" },
    { id: "3", user_id: "u1", nombre: "Ana", email: "a@x.mx", role_id: "puerta", role_nombre: "Puerta" },
  ];
  it("agrupa los roles de cada persona", () => {
    const g = groupMembers(rows);
    expect(g).toHaveLength(2);
    expect(g[0].roles.map((r) => r.role_id)).toEqual(["registro", "puerta"]);
  });
  it("calcula qué agregar y qué quitar", () => {
    expect(roleDiff(["registro", "puerta"], ["puerta", "staff"])).toEqual({ agregar: ["staff"], quitar: ["registro"] });
    expect(roleDiff(["staff"], ["staff"])).toEqual({ agregar: [], quitar: [] });
  });
});

describe("identificador de obra", () => {
  it("arma una dirección web válida", () => {
    expect(productionIdFrom("Teen Beach Movie", "2027")).toBe("teen-beach-movie-2027");
    expect(productionIdFrom("¡Mamma Mía!")).toBe("mamma-mia");
    expect(productionIdFrom("x".repeat(60))).toHaveLength(40);
  });
});
