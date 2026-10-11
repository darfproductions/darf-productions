// Reglas del panel: qué ve cada quien según sus permisos (migración 0031).
// Funciones puras (sin base ni servidor) para poder probarlas: panel-nav.test.ts.
// Ocultar algo aquí es solo comodidad: la base rechaza lo que no corresponde.

export type PanelAccessData = {
  isDirector: boolean;
  /** obra → permisos que tengo en ella. */
  byProduction: Record<string, string[]>;
};

export function hasAnyAccess(a: PanelAccessData): boolean {
  return a.isDirector || Object.values(a.byProduction).some((p) => p.length > 0);
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
  { id: "pagina", label: "Página pública", path: "pagina", perms: ["obra.editar", "obra.publicar"], etapa: "3B" },
  { id: "audiciones", label: "Audiciones", path: "audiciones", perms: ["audiciones.gestionar", "audiciones.registro", "audiciones.evaluar"], etapa: "3D" },
  { id: "elenco", label: "Elenco y equipos", path: "elenco", perms: ["elenco.gestionar", "expedientes.ver", "mensualidades.gestionar"], etapa: "3B" },
  { id: "ensayos", label: "Ensayos", path: "ensayos", perms: ["ensayos.gestionar"], etapa: "3E" },
  { id: "materiales", label: "Materiales", path: "materiales", perms: ["materiales.gestionar", "materiales.ver"], etapa: "3E" },
  { id: "comunicados", label: "Comunicados", path: "comunicados", perms: ["comunicados.enviar"], etapa: "3E" },
  { id: "boletos", label: "Funciones y boletos", path: "boletos", perms: ["ventas.ver", "ventas.operar", "descuentos.gestionar", "reportes.ver"], etapa: "3C" },
  { id: "puerta", label: "Puerta", path: "puerta", perms: ["puerta.validar"], etapa: "3C" },
  { id: "programa", label: "Programa digital", path: "programa", perms: ["programa.editar"], etapa: "3F" },
  { id: "fanzone", label: "Fan Zone", path: "fanzone", perms: ["fanzone.editar"], etapa: "3B" },
  { id: "permisos", label: "Permisos", path: "permisos", perms: ["permisos.gestionar"], etapa: null },
];

/** Pestañas que veo en una obra: Resumen si tengo cualquier permiso ahí; el resto según su permiso. */
export function productionTabs(a: PanelAccessData, productionId: string): Tab[] {
  const mine = a.isDirector || (a.byProduction[productionId] ?? []).length > 0;
  if (!mine) return [];
  return PRODUCTION_TABS.filter((t) => t.perms.length === 0 || canAny(a, productionId, t.perms));
}

export type Section = { href: string; label: string };

/** Secciones generales del panel. Usuarios, Roles y Bitácora: solo el Director. */
export function globalSections(a: PanelAccessData): Section[] {
  const base: Section[] = [
    { href: "/panel", label: "Inicio" },
    { href: "/panel/producciones", label: "Producciones" },
  ];
  if (!a.isDirector) return base;
  return [
    ...base,
    { href: "/panel/usuarios", label: "Usuarios" },
    { href: "/panel/roles", label: "Roles" },
    { href: "/panel/bitacora", label: "Bitácora" },
  ];
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
