import { describe, expect, it } from "vitest";
import { activeNav, can, canAudition, canConfigAudition, canSeeAudition, globalSections, groupMembers, hasAnyAccess, hasEventoAccess, myProductionIds, permisosEvento, productionGroups, productionIdFrom, panelMenu, productionTabs, tabActiva, roleDiff, roleIdFromName, type PanelAccessData } from "./panel-nav";

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
    expect(tabs).toHaveLength(19);
  });
});

describe("secciones generales", () => {
  it("taquilla: Inicio, Proyectos y Reportes por obra; el Director todo", () => {
    expect(globalSections(taquillaMM).map((s) => s.label)).toEqual(["Inicio", "Notificaciones", "Proyectos", "Reportes"]);
    expect(globalSections(juezMM).map((s) => s.label)).toEqual(["Inicio", "Notificaciones", "Proyectos"]);
    expect(globalSections(director).map((s) => s.label)).toEqual(["Inicio", "Notificaciones", "Proyectos", "Personas", "Reportes", "Ajustes"]);
  });
  it("subpestañas según permisos", () => {
    const t = panelMenu(taquillaMM);
    expect(t.find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toEqual(["Producciones", "Eventos"]) // 0084: taquilla aprueba pagos de eventos;
    expect(t.find((s) => s.id === "reportes")?.href).toBe("/panel/reportes/obras");
    expect(panelMenu(juezMM).find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toEqual(["Producciones", "Audiciones"]);
    expect(panelMenu(director).find((s) => s.id === "personas")?.subs.map((x) => x.label)).toEqual(["Directorio", "Cumpleaños", "Portal del equipo", "Contacto"]);
    expect(activeNav(panelMenu(director), "/panel/personas/equipo/portal").sub?.label).toBe("Portal del equipo");
  });
  it("sección activa: las direcciones viejas caen en su sección nueva", () => {
    const m = panelMenu(director);
    expect(activeNav(m, "/panel").section?.id).toBe("inicio");
    expect(activeNav(m, "/panel/talento/abc").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/usuarios").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/producciones/mm/boletos").section?.id).toBe("proyectos");
    expect(activeNav(m, "/panel/reportes/obras").sub?.label).toBe("Por producción");
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
    expect(globalSections(juezGeneral)).toEqual([{ href: "/panel", label: "Inicio" }, { href: "/panel/notificaciones", label: "Notificaciones" }, { href: "/panel/audiciones", label: "Proyectos" }]);
    expect(panelMenu(juezMM).find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toContain("Audiciones");
  });
});

describe("registro permanente (0064)", () => {
  const perm = { id: "p", production_id: null, permanente: true };
  const general = { id: "g", production_id: null };
  const prodMM: PanelAccessData = { isDirector: false, byProduction: { mm: ["audiciones.gestionar", "audiciones.evaluar"] } };
  it("quien gestiona audiciones en una obra lo trabaja, pero no lo configura", () => {
    expect(canAudition(prodMM, perm, "audiciones.gestionar")).toBe(true);
    expect(canAudition(prodMM, perm, "audiciones.evaluar")).toBe(true);
    expect(canConfigAudition(prodMM, perm)).toBe(false);
    expect(canConfigAudition(director, perm)).toBe(true);
    expect(canAudition(prodMM, general, "audiciones.gestionar")).toBe(false);
  });
  it("taquilla o un juez de obra no lo ven", () => {
    expect(canSeeAudition(taquillaMM, perm)).toBe(false);
    expect(canSeeAudition(juezMM, perm)).toBe(false);
  });
});

describe("producción concluida (0066)", () => {
  it("solo quedan las pestañas de archivo", () => {
    expect(productionTabs(director, "hsm", true).map((t) => t.id)).toEqual(["resumen", "pagina", "elenco", "expedientes", "solicitudes", "fanzone", "difusion", "equipo", "reportes", "cierre", "permisos"].sort((x, y) => productionTabs(director, "hsm").findIndex((t) => t.id === x) - productionTabs(director, "hsm").findIndex((t) => t.id === y)));
    expect(productionTabs(taquillaMM, "mm", true).map((t) => t.id)).toEqual(["resumen", "reportes", "cierre"]);
  });
});

describe("equipo propio de eventos (0084)", () => {
  const puertaEv: PanelAccessData = { isDirector: false, byProduction: {}, byEvento: { e1: "puerta" } };
  const taquilla: PanelAccessData = { isDirector: false, byProduction: { showman: ["ventas.operar"] } };
  const contenido: PanelAccessData = { isDirector: false, byProduction: { showman: ["fanzone.editar"] } };
  it("entra al panel y ve Eventos solo con su papel", () => {
    expect(hasAnyAccess(puertaEv)).toBe(true);
    expect(hasEventoAccess(puertaEv)).toBe(true);
    expect(panelMenu(puertaEv).find((s) => s.id === "proyectos")?.subs.map((x) => x.label)).toEqual(["Eventos"]);
    expect(hasEventoAccess(taquilla)).toBe(true);
    expect(hasEventoAccess({ isDirector: false, byProduction: { showman: ["obra.ver"] } })).toBe(false);
  });
  it("permisos por evento", () => {
    const darf = { id: "e1", production_id: null };
    expect(permisosEvento(puertaEv, darf)).toEqual({ equipo: false, editar: false, puerta: true, cobros: false });
    expect(permisosEvento(puertaEv, { id: "e2", production_id: null }).puerta).toBe(false);
    expect(permisosEvento({ ...puertaEv, byEvento: { e1: "organiza" } }, darf)).toEqual({ equipo: false, editar: true, puerta: true, cobros: true });
    expect(permisosEvento(taquilla, { id: "e3", production_id: "showman" })).toEqual({ equipo: false, editar: false, puerta: false, cobros: true });
    expect(permisosEvento(contenido, { id: "e3", production_id: "showman" }).equipo).toBe(true);
    expect(permisosEvento(contenido, darf).equipo).toBe(false);
  });
});

describe("pestañas agrupadas de la obra (0085)", () => {
  const directorG: PanelAccessData = { isDirector: true, byProduction: {} };
  const puertaG: PanelAccessData = { isDirector: false, byProduction: { showman: ["puerta.validar"] } };
  const taquillaG: PanelAccessData = { isDirector: false, byProduction: { showman: ["ventas.ver", "ventas.operar", "reportes.ver"] } };
  it("el Director ve 6 grupos y boletería dentro de Boletos", () => {
    const g = productionGroups(directorG, "showman");
    expect(g.map((x) => x.label)).toEqual(["Resumen", "Personas", "Ensayos y equipo", "Boletos", "Público", "Más"]);
    expect(g.find((x) => x.id === "boletos")?.tabs.map((t) => t.label)).toEqual(["Ventas y órdenes", "Taquilla", "Funciones y precios", "Mapa de asientos", "Descuentos", "Corte de caja", "Vendedores", "Puerta"]);
    expect(g.find((x) => x.id === "publico")?.tabs.map((t) => t.label)).toEqual(["Página pública", "Programa digital", "Fan Zone y eventos", "Difusión"]);
  });
  it("con pocos permisos, pocos grupos; la liga del grupo es su primera pestaña", () => {
    expect(productionGroups(puertaG, "showman").map((x) => [x.id, x.path])).toEqual([["resumen", ""], ["boletos", "puerta"]]);
    expect(productionGroups(taquillaG, "showman").map((x) => x.id)).toEqual(["resumen", "boletos", "mas"]);
    expect(productionGroups(taquillaG, "showman").find((x) => x.id === "boletos")?.tabs.map((t) => t.id)).toEqual(["boletos", "taquilla", "funciones", "corte", "vendedores"]);
  });
  it("pestaña activa: la ruta más larga que coincide", () => {
    const g = productionGroups(directorG, "showman");
    expect(tabActiva(g, "")).toEqual({ grupo: "resumen", tab: "resumen" });
    expect(tabActiva(g, "boletos")).toEqual({ grupo: "boletos", tab: "boletos" });
    expect(tabActiva(g, "boletos/taquilla")).toEqual({ grupo: "boletos", tab: "taquilla" });
    expect(tabActiva(g, "expedientes/abc/")).toEqual({ grupo: "personas", tab: "expedientes" });
    expect(tabActiva(g, "nada")).toEqual({ grupo: null, tab: null });
  });
});

describe("Casa DARF (0102)", () => {
  const base = { isDirector: false, byProduction: {} as Record<string, string[]> };
  const subs = (a: Parameters<typeof panelMenu>[0], id: string) => panelMenu(a).find((s) => s.id === id)?.subs.map((x) => x.href) ?? [];
  it("Comunicación ve sitio, DARFY, contacto y eventos DARF; no reportes ni Casa DARF", () => {
    const a = { ...base, casa: ["casa.sitio", "casa.eventos", "casa.club", "casa.contacto"] };
    expect(hasAnyAccess(a)).toBe(true);
    expect(subs(a, "ajustes")).toEqual(["/panel/ajustes/sitio", "/panel/ajustes/darfy"]);
    expect(subs(a, "personas")).toEqual(["/panel/contacto"]);
    expect(panelMenu(a).some((s) => s.id === "reportes")).toBe(false);
    expect(hasEventoAccess(a)).toBe(true);
    expect(permisosEvento(a, { id: "e1", production_id: null }).editar).toBe(true);
    expect(permisosEvento(a, { id: "e2", production_id: "hsm" }).editar).toBe(false);
  });
  it("Talento configura audiciones generales pero no las de una obra", () => {
    const a = { ...base, casa: ["casa.audiciones", "casa.personas"] };
    expect(canConfigAudition(a, { id: "g", production_id: null })).toBe(true);
    expect(canConfigAudition(a, { id: "o", production_id: "hsm" })).toBe(false);
    expect(subs(a, "personas")).toEqual(["/panel/personas", "/panel/cumpleanos"]);
  });
  it("solo el Director ve Ajustes → Casa DARF", () => {
    expect(subs({ isDirector: true, byProduction: {} }, "ajustes")[0]).toBe("/panel/ajustes/casa");
    expect(subs({ ...base, casa: ["casa.roles"] }, "ajustes")).toEqual(["/panel/roles"]);
  });
});
