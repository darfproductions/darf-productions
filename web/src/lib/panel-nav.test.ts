import { describe, expect, it } from "vitest";
import { activeNav, can, canAudition, canConfigAudition, canSeeAudition, globalSections, groupMembers, hasAnyAccess, hasEventoAccess, myProductionIds, paginasDePestana, permisosEvento, productionGroups, productionIdFrom, panelMenu, productionTabs, tabActiva, roleDiff, roleIdFromName, type PanelAccessData } from "./panel-nav";

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
    expect(ids(taquillaMM, "mm")).toEqual(["resumen", "ficha", "boletos", "reportes", "cierre", "guia"]);
  });
  it("un juez solo ve Resumen y Audiciones", () => {
    expect(ids(juezMM, "mm")).toEqual(["resumen", "ficha", "audiciones", "guia"]);
  });
  it("sin permisos en la obra no hay pestañas", () => {
    expect(ids(taquillaMM, "hsm")).toEqual([]);
  });
  it("el Director ve todas, con Permisos y la Guía al final", () => {
    const tabs = ids(director, "hsm");
    expect(tabs[0]).toBe("resumen");
    expect(tabs.slice(-2)).toEqual(["permisos", "guia"]);
    expect(tabs).toHaveLength(21);
  });
});

describe("menú del panel (esqueleto nuevo, 0138)", () => {
  it("taquilla: Hoy, Mis obras, Ventas y Sitio (eventos); un juez: Hoy y Mis obras; el Director, las seis", () => {
    expect(globalSections(taquillaMM).map((s) => s.label)).toEqual(["Hoy", "Mis obras", "Ventas", "Sitio"]);
    expect(globalSections(juezMM).map((s) => s.label)).toEqual(["Hoy", "Mis obras"]);
    expect(globalSections(director).map((s) => s.label)).toEqual(["Hoy", "Mis obras", "Personas", "Ventas", "Sitio", "Ajustes"]);
  });
  it("subpestañas según permisos", () => {
    const t = panelMenu(taquillaMM);
    expect(t.find((s) => s.id === "obras")?.subs.map((x) => x.label)).toEqual(["Producciones"]);
    // 0084: taquilla aprueba pagos de eventos; los eventos viven en Sitio.
    expect(t.find((s) => s.id === "sitio")?.subs.map((x) => x.label)).toEqual(["Eventos"]);
    // Sin el reporte general, Ventas es una sola página.
    expect(t.find((s) => s.id === "ventas")?.subs.map((x) => x.href)).toEqual(["/panel/ventas"]);
    expect(panelMenu(juezMM).find((s) => s.id === "obras")?.subs.map((x) => x.label)).toEqual(["Producciones", "Audiciones"]);
    expect(panelMenu(director).find((s) => s.id === "personas")?.subs.map((x) => x.label)).toEqual(["Directorio", "Cumpleaños", "Portal del equipo"]);
    expect(panelMenu(director).find((s) => s.id === "ventas")?.subs.map((x) => x.label)).toEqual(["Ventas", "Reporte general"]);
    expect(panelMenu(director).find((s) => s.id === "sitio")?.subs.map((x) => x.label)).toEqual(["Sitio", "Club Fan", "Difusión DARF", "Contacto", "DARFY", "Eventos", "Showcases"]);
    expect(panelMenu(director).find((s) => s.id === "ajustes")?.subs.map((x) => x.label)).toEqual(["Casa DARF", "Roles y permisos", "Bitácora"]);
    expect(activeNav(panelMenu(director), "/panel/personas/equipo/portal").sub?.label).toBe("Portal del equipo");
  });
  it("sección activa: las direcciones viejas caen en su sección nueva", () => {
    const m = panelMenu(director);
    expect(activeNav(m, "/panel").section?.id).toBe("hoy");
    expect(activeNav(m, "/panel/talento/abc").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/usuarios").section?.id).toBe("personas");
    expect(activeNav(m, "/panel/producciones/mm/boletos").section?.id).toBe("obras");
    expect(activeNav(m, "/panel/audiciones/x").section?.id).toBe("obras");
    expect(activeNav(m, "/panel/reportes/obras").section?.id).toBe("ventas");
    expect(activeNav(m, "/panel/ventas").section?.id).toBe("ventas");
    expect(activeNav(m, "/panel/notificaciones").section?.id).toBe("hoy");
    expect(activeNav(m, "/panel/ajustes/sitio").section?.id).toBe("sitio");
    expect(activeNav(m, "/panel/eventos").section?.id).toBe("sitio");
    expect(activeNav(m, "/panel/showcases/medios").section?.id).toBe("sitio");
    expect(activeNav(m, "/panel/contacto").section?.id).toBe("sitio");
    expect(activeNav(m, "/panel/ajustes/casa").section?.id).toBe("ajustes");
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
    expect(globalSections(juezGeneral)).toEqual([{ href: "/panel", label: "Hoy" }, { href: "/panel/audiciones", label: "Mis obras" }]);
    expect(panelMenu(juezMM).find((s) => s.id === "obras")?.subs.map((x) => x.label)).toContain("Audiciones");
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
    expect(productionTabs(director, "hsm", true).map((t) => t.id)).toEqual(["resumen", "ficha", "pagina", "elenco", "expedientes", "solicitudes", "fanzone", "difusion", "equipo", "reportes", "cierre", "permisos", "guia"].sort((x, y) => productionTabs(director, "hsm").findIndex((t) => t.id === x) - productionTabs(director, "hsm").findIndex((t) => t.id === y)));
    expect(productionTabs(taquillaMM, "mm", true).map((t) => t.id)).toEqual(["resumen", "ficha", "reportes", "cierre", "guia"]);
  });
});

describe("equipo propio de eventos (0084)", () => {
  const puertaEv: PanelAccessData = { isDirector: false, byProduction: {}, byEvento: { e1: "puerta" } };
  const taquilla: PanelAccessData = { isDirector: false, byProduction: { showman: ["ventas.operar"] } };
  const contenido: PanelAccessData = { isDirector: false, byProduction: { showman: ["fanzone.editar"] } };
  it("entra al panel y ve Eventos solo con su papel", () => {
    expect(hasAnyAccess(puertaEv)).toBe(true);
    expect(hasEventoAccess(puertaEv)).toBe(true);
    expect(panelMenu(puertaEv).find((s) => s.id === "sitio")?.subs.map((x) => x.label)).toEqual(["Eventos"]);
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

describe("pestañas de la obra (0085, esqueleto nuevo 0138)", () => {
  const directorG: PanelAccessData = { isDirector: true, byProduction: {} };
  const puertaG: PanelAccessData = { isDirector: false, byProduction: { showman: ["puerta.validar"] } };
  const taquillaG: PanelAccessData = { isDirector: false, byProduction: { showman: ["ventas.ver", "ventas.operar", "reportes.ver"] } };
  it("el Director ve las siete pestañas y boletería dentro de Boletos", () => {
    const g = productionGroups(directorG, "showman");
    expect(g.map((x) => x.label)).toEqual(["Resumen", "Equipo y elenco", "Ensayos", "Audiciones", "Boletos", "Página pública", "Más"]);
    // 0127: Boletos en 3 secciones, cada una con sus páginas.
    const bol = g.find((x) => x.id === "boletos")!;
    expect(bol.tabs.map((t) => t.label)).toEqual(["Preparar", "Vender", "Día de función"]);
    expect(bol.tabs.map((t) => t.items?.map((i) => i.label))).toEqual([
      ["Funciones y horarios", "Zonas y mapa", "Beneficios", "Preventa privada", "Descuentos"],
      ["Órdenes", "Taquilla", "Vendedores", "Corte de caja"],
      ["Hoy", "Puerta", "Entregas de beneficios"],
    ]);
    expect(bol.path).toBe("boletos/funciones");
  });
  it("cada pestaña trae sus páginas en secciones; una sola fila (sin tercer nivel)", () => {
    const g = productionGroups(directorG, "showman");
    const sec = (id: string) => g.find((x) => x.id === id)!.tabs.map((t) => [t.label, t.items?.map((i) => i.label)]);
    expect(sec("resumen")).toEqual([["", ["Resumen", "Ficha de la producción"]]]);
    expect(sec("gente")).toEqual([
      ["Elenco", ["Elenco y equipos"]],
      ["Integrantes", ["Expedientes", "Cuotas y recaudación", "Adeudos", "Solicitudes", "Evaluaciones"]],
      ["Equipo", ["Notas y juntas", "Permisos"]],
    ]);
    expect(sec("ensayos")).toEqual([["", ["Ensayos", "Avisos al elenco", "Materiales"]]]);
    expect(sec("audiciones")).toEqual([["", ["Audiciones"]]]);
    expect(sec("publico")).toEqual([
      ["Página", ["Publicar", "Textos", "Imágenes", "Avisos"]],
      ["Promoción", ["Difusión", "Programa digital"]],
      ["Fans", ["Fan Zone y eventos", "Fotos y galería"]],
    ]);
    expect(sec("mas")).toEqual([["", ["Reportes", "Cierre de temporada", "Guía de tu rol"]]]);
    expect(g.find((x) => x.id === "gente")!.path).toBe("elenco");
    // La fila de páginas: el nombre de la sección solo cuando la pestaña agrupa.
    expect(paginasDePestana(g.find((x) => x.id === "ensayos")!)).toEqual([{ seccion: "", paginas: [
      { id: "ensayos", label: "Ensayos", path: "ensayos" }, { id: "comunicados", label: "Avisos al elenco", path: "comunicados" }, { id: "materiales", label: "Materiales", path: "materiales" },
    ] }]);
    expect(paginasDePestana(g.find((x) => x.id === "publico")!).map((s) => [s.seccion, s.paginas.length])).toEqual([["Página", 4], ["Promoción", 2], ["Fans", 2]]);
  });
  it("sin el permiso, la página de adentro no sale (Cuotas sin mensualidades; Textos sin editar)", () => {
    const exp: PanelAccessData = { isDirector: false, byProduction: { showman: ["expedientes.ver", "obra.publicar"] } };
    const g = productionGroups(exp, "showman");
    expect(g.find((x) => x.id === "gente")!.tabs.map((t) => [t.id, t.items?.map((i) => i.id)])).toEqual([["sec-integrantes", ["expedientes", "solicitudes"]]]);
    expect(g.find((x) => x.id === "publico")!.tabs.map((t) => [t.id, t.items?.map((i) => i.id)])).toEqual([["sec-pagina", ["pagina"]], ["sec-promocion", ["difusion"]]]);
  });
  it("con pocos permisos, pocas pestañas; la liga de la pestaña es su primera página", () => {
    // Quien solo escanea: Boletos con "Día de función" (Puerta y Entregas), directo a Puerta.
    expect(productionGroups(puertaG, "showman").map((x) => [x.id, x.path])).toEqual([["resumen", ""], ["boletos", "puerta"], ["mas", "guia"]]);
    expect(productionGroups(puertaG, "showman").find((x) => x.id === "boletos")?.tabs.map((t) => [t.id, t.items?.map((i) => i.id)])).toEqual([["dia", ["puerta", "entregas"]]]);
    expect(productionGroups(taquillaG, "showman").map((x) => x.id)).toEqual(["resumen", "boletos", "mas"]);
    expect(productionGroups(taquillaG, "showman").find((x) => x.id === "boletos")?.tabs.map((t) => [t.id, t.items?.map((i) => i.id)])).toEqual([
      ["preparar", ["funciones", "beneficios", "preventa"]],
      ["vender", ["boletos", "taquilla", "vendedores", "corte"]],
      ["dia", ["hoy", "entregas"]],
    ]);
  });
  it("tipo de producción (0139): lo que no aplica se va a Más, marcado; nada se pierde", () => {
    // Escuela sin boletería: ni Boletos ni Cuotas ni Fan Zone en su lugar; todo eso en Más → No aplica a este tipo.
    const g = productionGroups(directorG, "showman", false, { tipo: "escuela", con_boleteria: false });
    expect(g.map((x) => x.id)).toEqual(["resumen", "gente", "ensayos", "audiciones", "publico", "mas"]);
    expect(g.find((x) => x.id === "gente")!.tabs.map((t) => [t.label, t.items?.map((i) => i.id)])).toEqual([
      ["Elenco", ["elenco"]], ["Integrantes", ["expedientes", "solicitudes", "evaluaciones"]], ["Equipo", ["equipo", "permisos"]],
    ]);
    expect(g.find((x) => x.id === "publico")!.tabs.map((t) => t.label)).toEqual(["Página", "Promoción"]);
    const mas = g.find((x) => x.id === "mas")!;
    expect(mas.tabs.map((t) => t.label)).toEqual(["", "No aplica a este tipo"]);
    const ids = mas.tabs[1].items!.map((i) => i.id);
    for (const id of ["cuotas", "adeudos", "fanzone", "fotos", "funciones", "boletos", "taquilla", "puerta", "hoy"]) expect(ids).toContain(id);
    // Las rutas siguen: la página escondida se marca en Más.
    expect(tabActiva(g, "boletos/taquilla")).toEqual({ grupo: "mas", tab: "sec-no-aplica", item: "taquilla" });
    // Con la boletería prendida, Boletos vuelve (sin vendedores, preventa ni beneficios).
    const gv = productionGroups(directorG, "showman", false, { tipo: "escuela", con_boleteria: true });
    expect(gv.map((x) => x.id)).toContain("boletos");
    expect(gv.find((x) => x.id === "boletos")!.tabs.map((t) => [t.id, t.items?.map((i) => i.id)])).toEqual([
      ["preparar", ["funciones", "mapa", "descuentos"]], ["vender", ["boletos", "taquilla", "corte"]], ["dia", ["hoy", "puerta", "entregas"]],
    ]);
    // Profesional (Showman): solo Cuotas, Adeudos y Evaluaciones van a Más.
    const gp = productionGroups(directorG, "showman", false, { tipo: "profesional", con_boleteria: true });
    expect(gp.find((x) => x.id === "mas")!.tabs[1].items!.map((i) => i.id)).toEqual(["cuotas", "adeudos", "evaluaciones"]);
    // Quien solo escanea en una escuela sin boletería: Resumen y Más (Puerta ahí, marcada).
    expect(productionGroups(puertaG, "showman", false, { tipo: "escuela", con_boleteria: false }).map((x) => [x.id, x.path])).toEqual([["resumen", ""], ["mas", "guia"]]);
  });
  it("pestaña activa: la ruta más larga que coincide", () => {
    const g = productionGroups(directorG, "showman");
    expect(tabActiva(g, "")).toEqual({ grupo: "resumen", tab: "sec-resumen", item: "resumen" });
    expect(tabActiva(g, "ficha")).toEqual({ grupo: "resumen", tab: "sec-resumen", item: "ficha" });
    expect(tabActiva(g, "boletos")).toEqual({ grupo: "boletos", tab: "vender", item: "boletos" });
    expect(tabActiva(g, "boletos/taquilla")).toEqual({ grupo: "boletos", tab: "vender", item: "taquilla" });
    expect(tabActiva(g, "boletos/beneficios/entregas")).toEqual({ grupo: "boletos", tab: "dia", item: "entregas" });
    expect(tabActiva(g, "boletos/beneficios")).toEqual({ grupo: "boletos", tab: "preparar", item: "beneficios" });
    expect(tabActiva(g, "puerta/lista/x")).toEqual({ grupo: "boletos", tab: "dia", item: "puerta" });
    expect(tabActiva(g, "expedientes/abc/")).toEqual({ grupo: "gente", tab: "sec-integrantes", item: "expedientes" });
    expect(tabActiva(g, "expedientes/cuotas")).toEqual({ grupo: "gente", tab: "sec-integrantes", item: "cuotas" });
    expect(tabActiva(g, "permisos")).toEqual({ grupo: "gente", tab: "sec-equipo", item: "permisos" });
    expect(tabActiva(g, "pagina/imagen")).toEqual({ grupo: "publico", tab: "sec-pagina", item: "imagen" });
    expect(tabActiva(g, "fanzone/fotos")).toEqual({ grupo: "publico", tab: "sec-fans", item: "fotos" });
    expect(tabActiva(g, "ensayos/xyz")).toEqual({ grupo: "ensayos", tab: "sec-ensayos", item: "ensayos" });
    expect(tabActiva(g, "audiciones")).toEqual({ grupo: "audiciones", tab: "sec-audiciones", item: "audiciones" });
    expect(tabActiva(g, "nada")).toEqual({ grupo: null, tab: null });
  });
});

describe("Casa DARF (0102)", () => {
  const base = { isDirector: false, byProduction: {} as Record<string, string[]> };
  const subs = (a: Parameters<typeof panelMenu>[0], id: string) => panelMenu(a).find((s) => s.id === id)?.subs.map((x) => x.href) ?? [];
  it("Comunicación ve sitio, Difusión, DARFY, contacto y eventos DARF; no reportes ni Casa DARF", () => {
    const a = { ...base, casa: ["casa.sitio", "casa.eventos", "casa.club", "casa.contacto"] };
    expect(hasAnyAccess(a)).toBe(true);
    expect(subs(a, "sitio")).toEqual(["/panel/ajustes/sitio", "/panel/ajustes/club", "/panel/ajustes/difusion", "/panel/contacto", "/panel/ajustes/darfy", "/panel/eventos"]);
    expect(subs(a, "personas")).toEqual([]);
    expect(subs(a, "ajustes")).toEqual([]);
    expect(panelMenu(a).some((s) => s.id === "ventas")).toBe(false);
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
  it("Showcases (0121) sale en Sitio solo con su permiso", () => {
    expect(subs({ ...base, casa: ["casa.showcases"] }, "sitio")).toEqual(["/panel/showcases"]);
    expect(subs({ ...base, casa: ["casa.sitio"] }, "sitio")).not.toContain("/panel/showcases");
    expect(subs({ isDirector: true, byProduction: {} }, "sitio")).toContain("/panel/showcases");
  });
  it("solo el Director ve Ajustes → Casa DARF", () => {
    expect(subs({ isDirector: true, byProduction: {} }, "ajustes")[0]).toBe("/panel/ajustes/casa");
    expect(subs({ ...base, casa: ["casa.roles"] }, "ajustes")).toEqual(["/panel/roles"]);
  });
});
