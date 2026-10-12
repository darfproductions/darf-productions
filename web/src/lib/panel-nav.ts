// Reglas del panel: qué ve cada quien según sus permisos (migración 0031).
// Funciones puras (sin base ni servidor) para poder probarlas: panel-nav.test.ts.
// Ocultar algo aquí es solo comodidad: la base rechaza lo que no corresponde.

export type PanelAccessData = {
  isDirector: boolean;
  /** obra → permisos que tengo en ella. */
  byProduction: Record<string, string[]>;
  /** convocatoria → permisos por su equipo propio (0037). */
  byAudition?: Record<string, string[]>;
};

export function hasAnyAccess(a: PanelAccessData): boolean {
  return a.isDirector || Object.values(a.byProduction).some((p) => p.length > 0) || Object.values(a.byAudition ?? {}).some((p) => p.length > 0);
}

const AUD_PERMS = ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"];

type AudRef = { id: string; production_id: string | null; permanente?: boolean };

/** ¿Gestiona audiciones en alguna obra? (puede trabajar el Registro permanente, 0064) */
export function managesProductionAuditions(a: PanelAccessData): boolean {
  return a.isDirector || Object.values(a.byProduction).some((p) => p.includes("audiciones.gestionar"));
}

/** Permiso sobre una convocatoria: el de su obra (general: solo el Director), el de su equipo propio
 *  o, en el Registro permanente, gestionar y calificar para quien gestiona audiciones en alguna obra. */
export function canAudition(a: PanelAccessData, aud: AudRef, perm: string): boolean {
  if (a.isDirector) return true;
  if (aud.production_id && can(a, aud.production_id, perm)) return true;
  if (aud.permanente && (perm === "audiciones.gestionar" || perm === "audiciones.evaluar") && managesProductionAuditions(a)) return true;
  return (a.byAudition?.[aud.id] ?? []).includes(perm);
}

/** Configurar la convocatoria (datos, preguntas, equipo, borrarla): la regla de siempre; el permanente, solo el Director. */
export function canConfigAudition(a: PanelAccessData, aud: AudRef): boolean {
  if (a.isDirector) return true;
  if (aud.production_id && can(a, aud.production_id, "audiciones.gestionar")) return true;
  return (a.byAudition?.[aud.id] ?? []).includes("audiciones.gestionar");
}

export function canSeeAudition(a: PanelAccessData, aud: AudRef): boolean {
  return AUD_PERMS.some((p) => canAudition(a, aud, p));
}

/** ¿Mostrar "Audiciones" en el menú general? */
export function hasAuditionAccess(a: PanelAccessData): boolean {
  return a.isDirector
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
  { id: "audiciones", label: "Audiciones", path: "audiciones", perms: ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"], etapa: null },
  { id: "elenco", label: "Elenco y equipos", path: "elenco", perms: ["elenco.gestionar", "obra.editar"], etapa: null },
  { id: "expedientes", label: "Expedientes", path: "expedientes", perms: ["expedientes.ver", "mensualidades.gestionar"], etapa: null },
  { id: "ensayos", label: "Ensayos", path: "ensayos", perms: ["ensayos.gestionar"], etapa: null },
  { id: "materiales", label: "Materiales", path: "materiales", perms: ["materiales.gestionar", "materiales.ver"], etapa: null },
  { id: "comunicados", label: "Comunicados", path: "comunicados", perms: ["comunicados.enviar"], etapa: null },
  { id: "evaluaciones", label: "Evaluaciones", path: "evaluaciones", perms: ["rubrica.gestionar"], etapa: null },
  { id: "boletos", label: "Funciones y boletos", path: "boletos", perms: ["ventas.ver", "ventas.operar", "funciones.gestionar", "descuentos.gestionar", "vendedores.gestionar"], etapa: null },
  { id: "puerta", label: "Puerta", path: "puerta", perms: ["puerta.validar"], etapa: null },
  { id: "programa", label: "Programa digital", path: "programa", perms: ["programa.editar"], etapa: null },
  { id: "reportes", label: "Reportes", path: "reportes", perms: ["reportes.ver"], etapa: null },
  { id: "fanzone", label: "Fan Zone", path: "fanzone", perms: ["fanzone.editar"], etapa: null },
  { id: "cierre", label: "Cierre de temporada", path: "cierre", perms: ["obra.publicar", "reportes.ver"], etapa: null },
  { id: "permisos", label: "Permisos", path: "permisos", perms: ["permisos.gestionar"], etapa: null },
];

/** Pestañas que veo en una obra: Resumen si tengo cualquier permiso ahí; el resto según su permiso. */
export function productionTabs(a: PanelAccessData, productionId: string): Tab[] {
  const mine = a.isDirector || (a.byProduction[productionId] ?? []).length > 0;
  if (!mine) return [];
  return PRODUCTION_TABS.filter((t) => t.perms.length === 0 || canAny(a, productionId, t.perms));
}

export type Section = { href: string; label: string };

export type NavSection = {
  id: "inicio" | "proyectos" | "personas" | "reportes" | "ajustes";
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
  return a.isDirector || Object.values(a.byProduction).some((p) => p.includes("reportes.ver"));
}

/**
 * Menú del panel en cuatro secciones (más Ajustes para el Director):
 * Inicio · Proyectos (Producciones, Audiciones) · Personas (Directorio, Cumpleaños, Equipo DARF) · Reportes (General, Por producción) · Ajustes.
 * Las direcciones viejas (/panel/usuarios, /panel/talento…) siguen funcionando.
 */
export function panelMenu(a: PanelAccessData): NavSection[] {
  const out: NavSection[] = [{ id: "inicio", label: "Inicio", href: "/panel", subs: [], match: [] }];
  // Quien solo está en el equipo de una convocatoria general no tiene obras: solo ve Audiciones.
  const proyectos: Section[] = a.isDirector || myProductionIds(a).length ? [{ href: "/panel/producciones", label: "Producciones" }] : [];
  if (hasAuditionAccess(a)) proyectos.push({ href: "/panel/audiciones", label: "Audiciones" });
  out.push({ id: "proyectos", label: "Proyectos", href: proyectos[0].href, subs: proyectos, match: ["/panel/producciones", "/panel/audiciones"] });
  if (a.isDirector) {
    out.push({
      id: "personas", label: "Personas", href: "/panel/personas",
      subs: [{ href: "/panel/personas", label: "Directorio" }, { href: "/panel/cumpleanos", label: "Cumpleaños" }, { href: "/panel/personas/equipo", label: "Equipo DARF" }],
      match: ["/panel/personas", "/panel/talento", "/panel/usuarios", "/panel/cumpleanos"],
    });
  }
  if (hasReportAccess(a)) {
    const subs: Section[] = a.isDirector ? [{ href: "/panel/reportes", label: "General" }] : [];
    subs.push({ href: "/panel/reportes/obras", label: "Por producción" });
    out.push({ id: "reportes", label: "Reportes", href: subs[0].href, subs, match: ["/panel/reportes"] });
  }
  if (a.isDirector) {
    out.push({
      id: "ajustes", label: "Ajustes", href: "/panel/roles",
      subs: [{ href: "/panel/roles", label: "Roles y permisos" }, { href: "/panel/bitacora", label: "Bitácora" }],
      match: ["/panel/roles", "/panel/bitacora"],
    });
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
