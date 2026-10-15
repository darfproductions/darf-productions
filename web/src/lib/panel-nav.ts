// Reglas del panel: qué ve cada quien según sus permisos (migración 0031).
// Funciones puras (sin base ni servidor) para poder probarlas: panel-nav.test.ts.
// Ocultar algo aquí es solo comodidad: la base rechaza lo que no corresponde.

export type PanelAccessData = {
  isDirector: boolean;
  /** obra → permisos que tengo en ella. */
  byProduction: Record<string, string[]>;
  /** convocatoria → permisos por su equipo propio (0037). */
  byAudition?: Record<string, string[]>;
  /** evento → mi papel en su equipo propio (0084). */
  byEvento?: Record<string, PapelEvento>;
  /** Permisos globales de Casa DARF (0102): casa.producciones, casa.sitio… El Director los tiene todos. */
  casa?: string[];
};

/** ¿Tengo este permiso de Casa DARF? (0102; el Director siempre). */
export function casa(a: PanelAccessData, perm: string): boolean {
  return a.isDirector || (a.casa ?? []).includes(perm);
}

/** ¿Soy de Casa DARF? (cualquier permiso global) */
export function esCasa(a: PanelAccessData): boolean {
  return a.isDirector || (a.casa ?? []).length > 0;
}

export type PapelEvento = "organiza" | "puerta" | "cobros";
export const PAPELES_EVENTO: Record<PapelEvento, { label: string; ayuda: string }> = {
  organiza: { label: "Organiza", ayuda: "Abre y cierra el registro, valida en la entrada y aprueba pagos." },
  puerta: { label: "Puerta", ayuda: "Valida credenciales y marca llegadas." },
  cobros: { label: "Cobros", ayuda: "Ve la lista y aprueba o rechaza pagos." },
};

export function hasAnyAccess(a: PanelAccessData): boolean {
  return esCasa(a) || Object.values(a.byProduction).some((p) => p.length > 0) || Object.values(a.byAudition ?? {}).some((p) => p.length > 0)
    || Object.keys(a.byEvento ?? {}).length > 0;
}

const EVENTO_PERMS = ["fanzone.editar", "puerta.validar", "ventas.operar"];

/** ¿Mostrar "Eventos" en el menú? Director, quien tiene Fan Zone, puerta o taquilla en una obra, o un papel en algún evento. */
export function hasEventoAccess(a: PanelAccessData): boolean {
  return casa(a, "casa.eventos") || Object.values(a.byProduction).some((p) => p.some((x) => EVENTO_PERMS.includes(x))) || Object.keys(a.byEvento ?? {}).length > 0;
}

/** Qué puedo hacer en un evento (0084): lo de la obra más mi papel en su equipo. Igual que evento_puede() en la base. */
export function permisosEvento(a: PanelAccessData, e: { id: string; production_id: string | null }) {
  // Eventos DARF (sin obra): Casa DARF con casa.eventos (0102).
  const editor = a.isDirector || (e.production_id ? (a.byProduction[e.production_id] ?? []).includes("fanzone.editar") : casa(a, "casa.eventos"));
  const papel = a.byEvento?.[e.id];
  const obra = (perm: string) => !!e.production_id && (a.byProduction[e.production_id] ?? []).includes(perm);
  return {
    /** Armar el equipo y borrar el evento. */
    equipo: editor,
    editar: editor || papel === "organiza",
    puerta: editor || papel === "organiza" || papel === "puerta" || obra("puerta.validar"),
    cobros: editor || papel === "organiza" || papel === "cobros" || obra("ventas.operar"),
  };
}

const AUD_PERMS = ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar", "audiciones.entrevista"];

type AudRef = { id: string; production_id: string | null; permanente?: boolean };

/** ¿Gestiona audiciones en alguna obra? (puede trabajar el Registro permanente, 0064) */
export function managesProductionAuditions(a: PanelAccessData): boolean {
  return casa(a, "casa.audiciones") || Object.values(a.byProduction).some((p) => p.includes("audiciones.gestionar"));
}

/** Permiso sobre una convocatoria: el de su obra (general: solo el Director), el de su equipo propio
 *  o, en el Registro permanente, gestionar y calificar para quien gestiona audiciones en alguna obra. */
export function canAudition(a: PanelAccessData, aud: AudRef, perm: string): boolean {
  if (a.isDirector) return true;
  // Generales y registro permanente: Casa DARF con casa.audiciones (0102).
  if (!aud.production_id && casa(a, "casa.audiciones")) return true;
  if (aud.production_id && can(a, aud.production_id, perm)) return true;
  if (aud.permanente && (perm === "audiciones.gestionar" || perm === "audiciones.evaluar") && managesProductionAuditions(a)) return true;
  return (a.byAudition?.[aud.id] ?? []).includes(perm);
}

/** Configurar la convocatoria (datos, preguntas, equipo, borrarla): la regla de siempre; el permanente, solo el Director. */
export function canConfigAudition(a: PanelAccessData, aud: AudRef): boolean {
  if (a.isDirector) return true;
  if (!aud.production_id && casa(a, "casa.audiciones")) return true;
  if (aud.production_id && can(a, aud.production_id, "audiciones.gestionar")) return true;
  return (a.byAudition?.[aud.id] ?? []).includes("audiciones.gestionar");
}

export function canSeeAudition(a: PanelAccessData, aud: AudRef): boolean {
  return AUD_PERMS.some((p) => canAudition(a, aud, p));
}

/** ¿Mostrar "Audiciones" en el menú general? */
export function hasAuditionAccess(a: PanelAccessData): boolean {
  return casa(a, "casa.audiciones")
    || Object.values(a.byProduction).some((p) => p.some((x) => AUD_PERMS.includes(x)))
    || Object.values(a.byAudition ?? {}).some((p) => p.length > 0);
}

export function can(a: PanelAccessData, productionId: string, perm: string): boolean {
  return a.isDirector || (a.byProduction[productionId] ?? []).includes(perm);
}

export function canAny(a: PanelAccessData, productionId: string, perms: string[]): boolean {
  return perms.some((p) => can(a, productionId, p));
}

/** Obras en las que tengo al menos un permiso. */
export function myProductionIds(a: PanelAccessData): string[] {
  return Object.entries(a.byProduction).filter(([, p]) => p.length > 0).map(([id]) => id);
}

export type Tab = {
  id: string;
  label: string;
  /** Ruta relativa al espacio de la obra ("" = Resumen). */
  path: string;
  /** Cualquiera de estos permisos muestra la pestaña. */
  perms: string[];
  /** Etapa en la que se construye; null = ya funciona. */
  etapa: string | null;
};

// Pestañas del espacio de trabajo de una obra (docs/DARF-2.0-FASE-3.md §4).
export const PRODUCTION_TABS: Tab[] = [
  { id: "resumen", label: "Resumen", path: "", perms: [], etapa: null },
  { id: "pagina", label: "Página pública", path: "pagina", perms: ["obra.editar", "obra.publicar"], etapa: null },
  { id: "audiciones", label: "Audiciones", path: "audiciones", perms: ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar", "audiciones.entrevista"], etapa: null },
  { id: "elenco", label: "Elenco y equipos", path: "elenco", perms: ["elenco.gestionar", "obra.editar"], etapa: null },
  { id: "expedientes", label: "Expedientes", path: "expedientes", perms: ["expedientes.ver", "mensualidades.gestionar"], etapa: null },
  { id: "ensayos", label: "Ensayos", path: "ensayos", perms: ["ensayos.gestionar"], etapa: null },
  { id: "solicitudes", label: "Solicitudes", path: "solicitudes", perms: ["ensayos.gestionar", "expedientes.ver", "mensualidades.gestionar"], etapa: null },
  { id: "materiales", label: "Materiales", path: "materiales", perms: ["materiales.gestionar", "materiales.ver"], etapa: null },
  { id: "comunicados", label: "Comunicados", path: "comunicados", perms: ["comunicados.enviar"], etapa: null },
  { id: "equipo", label: "Equipo", path: "equipo", perms: ["equipo.gestionar"], etapa: null },
  { id: "evaluaciones", label: "Evaluaciones", path: "evaluaciones", perms: ["rubrica.gestionar", "rubrica.proponer"], etapa: null },
  { id: "boletos", label: "Funciones y boletos", path: "boletos", perms: ["ventas.ver", "ventas.operar", "funciones.gestionar", "descuentos.gestionar", "vendedores.gestionar"], etapa: null },
  { id: "puerta", label: "Puerta", path: "puerta", perms: ["puerta.validar"], etapa: null },
  { id: "programa", label: "Programa digital", path: "programa", perms: ["programa.editar"], etapa: null },
  { id: "reportes", label: "Reportes", path: "reportes", perms: ["reportes.ver"], etapa: null },
  { id: "fanzone", label: "Fan Zone", path: "fanzone", perms: ["fanzone.editar"], etapa: null },
  { id: "difusion", label: "Difusión", path: "difusion", perms: ["obra.editar", "obra.publicar"], etapa: null },
  { id: "cierre", label: "Cierre de temporada", path: "cierre", perms: ["obra.publicar", "reportes.ver"], etapa: null },
  { id: "permisos", label: "Permisos", path: "permisos", perms: ["permisos.gestionar"], etapa: null },
];

/** Pestañas que siguen visibles cuando la producción está concluida (decisión de Diego). */
export const CONCLUIDA_TABS = ["resumen", "pagina", "elenco", "expedientes", "solicitudes", "fanzone", "difusion", "cierre", "permisos", "reportes", "equipo"];

/** Pestañas que veo en una obra: Resumen si tengo cualquier permiso ahí; el resto según su permiso.
 *  Si la obra está concluida, solo las de CONCLUIDA_TABS. */
export function productionTabs(a: PanelAccessData, productionId: string, concluida = false): Tab[] {
  const mine = a.isDirector || (a.byProduction[productionId] ?? []).length > 0;
  if (!mine) return [];
  return PRODUCTION_TABS.filter((t) => (t.perms.length === 0 || canAny(a, productionId, t.perms)) && (!concluida || CONCLUIDA_TABS.includes(t.id)));
}

// ──────── Pestañas agrupadas de la obra (0085) ────────
// Las 18 pestañas se ordenan en 6 grupos; cada grupo con sus sub-pestañas. Las rutas no cambian.

export type GrupoObra = "resumen" | "personas" | "ensayos" | "boletos" | "publico" | "mas";
export type SubTab = { id: string; label: string; path: string };
export type GrupoTabs = { id: GrupoObra; label: string; path: string; tabs: SubTab[] };

const GRUPOS: { id: GrupoObra; label: string; tabs: string[] }[] = [
  { id: "resumen", label: "Resumen", tabs: ["resumen"] },
  { id: "personas", label: "Personas", tabs: ["elenco", "audiciones", "expedientes", "solicitudes", "evaluaciones"] },
  { id: "ensayos", label: "Ensayos y equipo", tabs: ["ensayos", "equipo", "materiales", "comunicados"] },
  { id: "boletos", label: "Boletos", tabs: ["boletos", "puerta"] },
  { id: "publico", label: "Público", tabs: ["pagina", "programa", "fanzone", "difusion"] },
  { id: "mas", label: "Más", tabs: ["reportes", "cierre", "permisos"] },
];
const ETIQUETA: Record<string, string> = { fanzone: "Fan Zone y eventos", elenco: "Elenco y equipos" };

/** Las páginas de boletería que veo (antes eran pastillas dentro de "Funciones y boletos"). */
export function boletosSubtabs(a: PanelAccessData, pid: string): SubTab[] {
  return [
    { id: "boletos", label: "Ventas y órdenes", path: "boletos", show: can(a, pid, "ventas.ver") },
    { id: "taquilla", label: "Taquilla", path: "boletos/taquilla", show: can(a, pid, "ventas.operar") },
    { id: "funciones", label: "Funciones y precios", path: "boletos/funciones", show: can(a, pid, "funciones.gestionar") || can(a, pid, "ventas.operar") },
    { id: "mapa", label: "Mapa de asientos", path: "boletos/mapa", show: can(a, pid, "funciones.gestionar") },
    { id: "descuentos", label: "Descuentos", path: "boletos/descuentos", show: can(a, pid, "descuentos.gestionar") },
    { id: "corte", label: "Corte de caja", path: "boletos/corte", show: can(a, pid, "ventas.ver") || can(a, pid, "reportes.ver") },
    { id: "vendedores", label: "Vendedores", path: "boletos/vendedores", show: can(a, pid, "ventas.ver") || can(a, pid, "vendedores.gestionar") },
  ].filter((t) => t.show).map(({ id, label, path }) => ({ id, label, path }));
}

/** A dónde mandar a quien abre una página de boletería que no le toca: su primera sub-pestaña
 *  permitida o el Resumen de la obra (nunca de regreso a /boletos, que causaba un ciclo). */
export function salidaBoletos(a: PanelAccessData, pid: string, desde: string): string {
  const t = boletosSubtabs(a, pid).find((x) => x.path !== desde);
  return t ? `/panel/producciones/${pid}/${t.path}` : `/panel/producciones/${pid}`;
}

/** Grupos de pestañas que veo en una obra (solo los que tienen algo), con su primera pestaña como liga. */
export function productionGroups(a: PanelAccessData, pid: string, concluida = false): GrupoTabs[] {
  const mias = new Map(productionTabs(a, pid, concluida).map((t) => [t.id, t]));
  return GRUPOS.map((g) => {
    const tabs = g.tabs.flatMap((id): SubTab[] => {
      const t = mias.get(id);
      if (!t) return [];
      if (id === "boletos") return boletosSubtabs(a, pid);
      return [{ id, label: ETIQUETA[id] ?? t.label, path: t.path }];
    });
    return { id: g.id, label: g.label, path: tabs[0]?.path ?? "", tabs };
  }).filter((g) => g.tabs.length > 0);
}

/** Qué grupo y qué pestaña están abiertos: la ruta más larga que coincide (Resumen solo exacto). */
export function tabActiva(grupos: GrupoTabs[], sub: string): { grupo: GrupoObra | null; tab: string | null } {
  const limpio = sub.replace(/^\/+|\/+$/g, "");
  let mejor: { grupo: GrupoObra; tab: string; largo: number } | null = null;
  for (const g of grupos) for (const t of g.tabs) {
    const ok = t.path === "" ? limpio === "" : limpio === t.path || limpio.startsWith(`${t.path}/`);
    if (ok && (!mejor || t.path.length > mejor.largo)) mejor = { grupo: g.id, tab: t.id, largo: t.path.length };
  }
  return mejor ? { grupo: mejor.grupo, tab: mejor.tab } : { grupo: null, tab: null };
}

export type Section = { href: string; label: string };

export type NavSection = {
  id: "inicio" | "notificaciones" | "proyectos" | "personas" | "reportes" | "ajustes";
  label: string;
  /** A dónde lleva la sección (su primera subpestaña). */
  href: string;
  /** Subpestañas que se muestran arriba de la página. */
  subs: Section[];
  /** Rutas que pertenecen a la sección (para marcarla como activa). */
  match: string[];
};

/** ¿Tengo reportes de al menos una obra? */
export function hasReportAccess(a: PanelAccessData): boolean {
  return casa(a, "casa.reportes") || Object.values(a.byProduction).some((p) => p.includes("reportes.ver"));
}

/**
 * Menú del panel en cuatro secciones (más Ajustes para el Director):
 * Inicio · Proyectos (Producciones, Audiciones) · Personas (Directorio, Cumpleaños, Equipo DARF) · Reportes (General, Por producción) · Ajustes.
 * Las direcciones viejas (/panel/usuarios, /panel/talento…) siguen funcionando.
 */
export function panelMenu(a: PanelAccessData): NavSection[] {
  const out: NavSection[] = [
    { id: "inicio", label: "Inicio", href: "/panel", subs: [], match: [] },
    // 0085: las notificaciones tienen su lugar en el menú (antes solo se llegaba desde Inicio).
    { id: "notificaciones", label: "Notificaciones", href: "/panel/notificaciones", subs: [], match: ["/panel/notificaciones"] },
  ];
  // Quien solo está en el equipo de una convocatoria general no tiene obras: solo ve Audiciones.
  const proyectos: Section[] = a.isDirector || casa(a, "casa.producciones") || myProductionIds(a).length ? [{ href: "/panel/producciones", label: "Producciones" }] : [];
  if (hasAuditionAccess(a)) proyectos.push({ href: "/panel/audiciones", label: "Audiciones" });
  // Eventos (0081/0084): Director, Fan Zone, puerta o taquilla de una obra, o equipo de un evento.
  if (hasEventoAccess(a)) proyectos.push({ href: "/panel/eventos", label: "Eventos" });
  // Casa DARF sin obras ni audiciones (p. ej. solo Roles o Bitácora) no ve Proyectos.
  if (proyectos.length) out.push({ id: "proyectos", label: "Proyectos", href: proyectos[0].href, subs: proyectos, match: ["/panel/producciones", "/panel/audiciones", "/panel/eventos"] });
  // Personas y Ajustes: cada subpestaña con su permiso de Casa DARF (0102).
  const personas: Section[] = [
    ...(casa(a, "casa.personas") ? [{ href: "/panel/personas", label: "Directorio" }, { href: "/panel/cumpleanos", label: "Cumpleaños" }] : []),
    // 0105: el equipo de la empresa es Casa DARF (Ajustes); aquí queda su portal (avisos, material, juntas).
    ...(casa(a, "casa.equipo") ? [{ href: "/panel/personas/equipo/portal", label: "Portal del equipo" }] : []),
    ...(casa(a, "casa.contacto") ? [{ href: "/panel/contacto", label: "Contacto" }] : []),
  ];
  if (personas.length) {
    out.push({
      id: "personas", label: "Personas", href: personas[0].href, subs: personas,
      match: ["/panel/personas", "/panel/talento", "/panel/usuarios", "/panel/cumpleanos", "/panel/contacto"],
    });
  }
  if (hasReportAccess(a)) {
    const subs: Section[] = casa(a, "casa.reportes") ? [{ href: "/panel/reportes", label: "General" }] : [];
    subs.push({ href: "/panel/reportes/obras", label: "Por producción" });
    out.push({ id: "reportes", label: "Reportes", href: subs[0].href, subs, match: ["/panel/reportes"] });
  }
  const ajustes: Section[] = [
    ...(a.isDirector ? [{ href: "/panel/ajustes/casa", label: "Casa DARF" }] : []),
    ...(casa(a, "casa.roles") ? [{ href: "/panel/roles", label: "Roles y permisos" }] : []),
    ...(casa(a, "casa.sitio") ? [{ href: "/panel/ajustes/sitio", label: "Sitio" }] : []),
    // 0112: base de socios del Club Fan.
    ...(casa(a, "casa.club") ? [{ href: "/panel/ajustes/club", label: "Club Fan" }] : []),
    ...(casa(a, "casa.contacto") ? [{ href: "/panel/ajustes/darfy", label: "DARFY" }] : []),
    ...(casa(a, "casa.bitacora") ? [{ href: "/panel/bitacora", label: "Bitácora" }] : []),
  ];
  if (ajustes.length) {
    out.push({ id: "ajustes", label: "Ajustes", href: ajustes[0].href, subs: ajustes, match: ["/panel/roles", "/panel/bitacora", "/panel/ajustes"] });
  }
  return out;
}

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Sección activa según la dirección, y si se muestran sus subpestañas (solo en las páginas principales). */
export function activeNav(menu: NavSection[], pathname: string): { section: NavSection | null; sub: Section | null; showSubs: boolean } {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/panel") return { section: menu[0] ?? null, sub: null, showSubs: false };
  const section = menu.find((s) => s.match.some((m) => under(path, m))) ?? null;
  if (!section) return { section: null, sub: null, showSubs: false };
  const sub = section.subs.find((x) => x.href === path) ?? null;
  return { section, sub, showSubs: !!sub && section.subs.length > 1 };
}

/** Secciones generales del panel, en una lista simple (compatibilidad). */
export function globalSections(a: PanelAccessData): Section[] {
  return panelMenu(a).map((s) => ({ href: s.href, label: s.label }));
}

/** Id de un rol personalizado a partir de su nombre ("Vestuario y Utilería" → "vestuario_y_utileria"). */
export function roleIdFromName(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export type MemberRow = { id: string; user_id: string; nombre: string | null; email: string; role_id: string; role_nombre: string };
export type MemberGroup = { user_id: string; nombre: string | null; email: string; roles: { rowId: string; role_id: string; role_nombre: string }[] };

/** Una tarjeta por persona con todos sus roles en la obra (la base guarda una fila por rol). */
export function groupMembers(rows: MemberRow[]): MemberGroup[] {
  const byUser = new Map<string, MemberGroup>();
  for (const r of rows) {
    const g = byUser.get(r.user_id) ?? { user_id: r.user_id, nombre: r.nombre, email: r.email, roles: [] };
    g.roles.push({ rowId: r.id, role_id: r.role_id, role_nombre: r.role_nombre });
    byUser.set(r.user_id, g);
  }
  return [...byUser.values()];
}

/** Qué roles agregar y cuáles quitar para pasar de los actuales a los deseados. */
export function roleDiff(actuales: string[], deseados: string[]): { agregar: string[]; quitar: string[] } {
  const a = new Set(actuales);
  const d = new Set(deseados);
  return { agregar: [...d].filter((r) => !a.has(r)), quitar: [...a].filter((r) => !d.has(r)) };
}

/** Identificador de una obra para su dirección web ("Teen Beach Movie", "2027" → "teen-beach-movie-2027"). */
export function productionIdFrom(nombre: string, temporada = ""): string {
  return `${nombre} ${temporada}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
