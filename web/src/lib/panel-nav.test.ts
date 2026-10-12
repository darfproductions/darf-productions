import { describe, expect, it } from "vitest";
import { activeNav, can, canAudition, canSeeAudition, globalSections, groupMembers, hasAnyAccess, myProductionIds, productionIdFrom, panelMenu, productionTabs, roleDiff, roleIdFromName, type PanelAccessData } from "./panel-nav";

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
  it("taquilla ve Resumen, Funciones y Reportes; no Audiciones ni Permisos", () => {
    expect(ids(taquillaMM, "mm")).toEqual(["resumen", "boletos", "reportes", "cierre"]);
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
    expect(tabs).toHaveLength(16);
  });
});

describe("secciones generales", () => {
  it("taquilla: Inicio, Proyectos y Reportes por obra; el Director todo", () => {
    expect(globalSections(taquillaMM).map((s) => s.label)).toEqual(["Inicio", "Proyectos", "Reportes"]);
    expect(globalSections(juezMM).map((s) => s.label)).toEqual(["Inicio", "Proyectos"]);
    expect(globalSections(director).map((s) => s.label)).toEqual(["Inicio", "Proyectos", "Personas", "Reportes", "Ajustes"]);
  });
  it("subpestañas según permisos", () => {
    const t = panelMenu(taquillaMM);
    expect(t.find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toEqual(["Obras"]);
    expect(t.find((s) => s.id === "reportes")?.href).toBe("/panel/reportes/obras");
    expect(panelMenu(juezMM).find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toEqual(["Obras", "Audiciones"]);
    expect(panelMenu(director).find((s) => s.id === "personas")?.subs.map((x) => x.label)).toEqual(["Directorio", "Cumpleaños"]);
  });
  it("sección activa: las direcciones viejas caen en su sección nueva", () => {
    const m = panelMenu(director);
    expect(activeNav(m, "/panel").section?.id).toBe("inicio");
    expect(activeNav(m, "/panel/talento/abc").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/usuarios").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/producciones/mm/boletos").section?.id).toBe("proyectos");
    expect(activeNav(m, "/panel/reportes/obras").sub?.label).toBe("Por obra");
    expect(activeNav(m, "/panel/bitacora").showSubs).toBe(true);
    expect(activeNav(m, "/panel/producciones/mm").showSubs).toBe(false);
    expect(activeNav(m, "/panel/producciones-x").section).toBeNull();
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

describe("convocatorias de obra y generales (0037)", () => {
  const general = { id: "g1", production_id: null };
  const deObra = { id: "a1", production_id: "mm" };
  const juezGeneral: PanelAccessData = { isDirector: false, byProduction: {}, byAudition: { g1: ["audiciones.evaluar"] } };
  it("una general solo la ve el Director o su equipo propio", () => {
    expect(canSeeAudition(director, general)).toBe(true);
    expect(canSeeAudition(juezMM, general)).toBe(false);
    expect(canAudition(juezGeneral, general, "audiciones.evaluar")).toBe(true);
    expect(canAudition(juezGeneral, general, "audiciones.gestionar")).toBe(false);
  });
  it("la de obra la ve el equipo de la obra", () => {
    expect(canAudition(juezMM, deObra, "audiciones.evaluar")).toBe(true);
    expect(canSeeAudition(juezGeneral, deObra)).toBe(false);
  });
  it("el equipo propio entra al panel y ve Audiciones en el menú", () => {
    expect(hasAnyAccess(juezGeneral)).toBe(true);
    expect(globalSections(juezGeneral)).toEqual([{ href: "/panel", label: "Inicio" }, { href: "/panel/audiciones", label: "Proyectos" }]);
    expect(panelMenu(juezMM).find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toContain("Audiciones");
  });
});
