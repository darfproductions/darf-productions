import { paginasNoAplican, type ObraTipo } from "@/lib/tipo-obra-rules";

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
  { id: "ficha", label: "Ficha de la producción", path: "ficha", perms: [], etapa: null },
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
  // Guía de tu rol: la ve cualquiera de la obra.
  { id: "guia", label: "Guía de tu rol", path: "guia", perms: [], etapa: null },
];

/** Pestañas que siguen visibles cuando la producción está concluida (decisión de Diego). */
export const CONCLUIDA_TABS = ["resumen", "ficha", "pagina", "elenco", "expedientes", "solicitudes", "fanzone", "difusion", "cierre", "permisos", "reportes", "equipo", "guia"];

/** Pestañas que veo en una obra: Resumen si tengo cualquier permiso ahí; el resto según su permiso.
 *  Si la obra está concluida, solo las de CONCLUIDA_TABS. */
export function productionTabs(a: PanelAccessData, productionId: string, concluida = false): Tab[] {
  const mine = a.isDirector || (a.byProduction[productionId] ?? []).length > 0;
  if (!mine) return [];
  return PRODUCTION_TABS.filter((t) => (t.perms.length === 0 || canAny(a, productionId, t.perms)) && (!concluida || CONCLUIDA_TABS.includes(t.id)));
}

// ──────── Pestañas de la obra (0085, esqueleto nuevo 0138) ────────
// Siete pestañas fijas (Resumen · Equipo y elenco · Ensayos · Audiciones · Boletos · Página pública · Más) y, dentro de
// cada una, UNA fila de subpestañas agrupadas por sección. Tres niveles como máximo: obra → pestaña → página.
// Las rutas no cambian: solo cambia dónde se ve cada página.

export type GrupoObra = "resumen" | "gente" | "ensayos" | "audiciones" | "boletos" | "publico" | "mas";
/** Una sección de la pestaña (`items`: sus páginas) o, si no hay secciones, una página suelta. */
export type SubTab = { id: string; label: string; path: string; items?: SubTab[] };
export type GrupoTabs = { id: GrupoObra; label: string; path: string; tabs: SubTab[] };

// Secciones de cada pestaña: las páginas se juntan según para qué sirven (los ids de sección no repiten ids de
// página porque el número de pendientes se suma por página). Boletos arma las suyas aparte (0127).
const GRUPOS: { id: GrupoObra; label: string; secciones: { id: string; label: string; items: string[] }[] }[] = [
  { id: "resumen", label: "Resumen", secciones: [{ id: "sec-resumen", label: "", items: ["resumen", "ficha"] }] },
  { id: "gente", label: "Equipo y elenco", secciones: [
    { id: "sec-elenco", label: "Elenco", items: ["elenco"] },
    { id: "sec-integrantes", label: "Integrantes", items: ["expedientes", "cuotas", "adeudos", "solicitudes", "evaluaciones"] },
    { id: "sec-equipo", label: "Equipo", items: ["equipo", "permisos"] },
  ] },
  { id: "ensayos", label: "Ensayos", secciones: [{ id: "sec-ensayos", label: "", items: ["ensayos", "comunicados", "materiales"] }] },
  { id: "audiciones", label: "Audiciones", secciones: [{ id: "sec-audiciones", label: "", items: ["audiciones"] }] },
  { id: "boletos", label: "Boletos", secciones: [] },
  { id: "publico", label: "Página pública", secciones: [
    { id: "sec-pagina", label: "Página", items: ["pagina", "contenido", "imagen", "avisos"] },
    { id: "sec-promocion", label: "Promoción", items: ["difusion", "programa"] },
    { id: "sec-fans", label: "Fans", items: ["fanzone", "fotos"] },
  ] },
  { id: "mas", label: "Más", secciones: [{ id: "sec-mas", label: "", items: ["reportes", "cierre", "guia"] }] },
];
const ETIQUETA_PAGINA: Record<string, string> = {
  comunicados: "Avisos al elenco", equipo: "Notas y juntas", pagina: "Publicar", fanzone: "Fan Zone y eventos",
  cierre: "Cierre de temporada", elenco: "Elenco y equipos",
};

/** Páginas de la obra que veo: sus pestañas más las páginas que viven dentro de otra (Cuotas, Contenido, Fotos…). */
function paginasObra(a: PanelAccessData, pid: string, mias: Map<string, Tab>): Map<string, SubTab> {
  const out = new Map<string, SubTab>([...mias.values()].map((t) => [t.id, { id: t.id, label: ETIQUETA_PAGINA[t.id] ?? ETIQUETA[t.id] ?? t.label, path: t.path }]));
  const extra = (id: string, label: string, path: string, show: boolean) => { if (show) out.set(id, { id, label, path }); };
  const cobra = mias.has("expedientes") && can(a, pid, "mensualidades.gestionar");
  extra("cuotas", "Cuotas y recaudación", "expedientes/cuotas", cobra);
  extra("adeudos", "Adeudos", "expedientes/adeudos", cobra);
  const edita = mias.has("pagina") && can(a, pid, "obra.editar");
  extra("contenido", "Textos", "pagina/contenido", edita);
  extra("imagen", "Imágenes", "pagina/imagen", edita);
  extra("avisos", "Avisos", "pagina/avisos", edita);
  extra("fotos", "Fotos y galería", "fanzone/fotos", mias.has("fanzone"));
  return out;
}
const ETIQUETA: Record<string, string> = {};

/** Las páginas de boletería que veo (antes eran pastillas dentro de "Funciones y boletos"). */
export function boletosSubtabs(a: PanelAccessData, pid: string): SubTab[] {
  return [
    { id: "boletos", label: "Ventas y órdenes", path: "boletos", show: can(a, pid, "ventas.ver") },
    { id: "taquilla", label: "Taquilla", path: "boletos/taquilla", show: can(a, pid, "ventas.operar") },
    { id: "funciones", label: "Funciones y horarios", path: "boletos/funciones", show: can(a, pid, "funciones.gestionar") || can(a, pid, "ventas.operar") },
    { id: "mapa", label: "Mapa de asientos", path: "boletos/mapa", show: can(a, pid, "funciones.gestionar") },
    // 0122: beneficios por zona (VIP: acceso anticipado, póster…) y su reporte de entregas.
    // 0123: códigos de preventa privada (antes de la del Club Fan).
    { id: "preventa", label: "Preventa privada", path: "boletos/preventa", show: can(a, pid, "funciones.gestionar") || can(a, pid, "ventas.ver") },
    { id: "beneficios", label: "Beneficios", path: "boletos/beneficios", show: can(a, pid, "funciones.gestionar") || can(a, pid, "ventas.ver") },
    { id: "descuentos", label: "Descuentos", path: "boletos/descuentos", show: can(a, pid, "descuentos.gestionar") },
    { id: "corte", label: "Corte de caja", path: "boletos/corte", show: can(a, pid, "ventas.ver") || can(a, pid, "reportes.ver") },
    { id: "vendedores", label: "Vendedores", path: "boletos/vendedores", show: can(a, pid, "ventas.ver") || can(a, pid, "vendedores.gestionar") },
  ].filter((t) => t.show).map(({ id, label, path }) => ({ id, label, path }));
}

// 0127: Boletos en 3 secciones según el momento en que se usa cada cosa. Las rutas no cambian.
const SECCIONES_BOLETOS: { id: string; label: string; items: string[] }[] = [
  { id: "preparar", label: "Preparar", items: ["funciones", "mapa", "beneficios", "preventa", "descuentos"] },
  { id: "vender", label: "Vender", items: ["boletos", "taquilla", "vendedores", "corte"] },
  { id: "dia", label: "Día de función", items: ["hoy", "puerta", "entregas"] },
];
const ETIQUETA_BOLETOS: Record<string, string> = {
  funciones: "Funciones y horarios", mapa: "Zonas y mapa", boletos: "Órdenes", preventa: "Preventa privada",
};

/** Páginas de boletería que veo agrupadas en Preparar · Vender · Día de función (solo las que tienen algo). */
export function boletosSecciones(a: PanelAccessData, pid: string, conPuerta: boolean): SubTab[] {
  const paginas = new Map(boletosSubtabs(a, pid).map((t) => [t.id, { ...t, label: ETIQUETA_BOLETOS[t.id] ?? t.label }]));
  // "Hoy" junta el día de función para quien lo coordina; quien solo escanea entra directo a Puerta.
  const dia = can(a, pid, "ventas.ver") || can(a, pid, "funciones.gestionar") || can(a, pid, "ensayos.gestionar");
  if (dia) paginas.set("hoy", { id: "hoy", label: "Hoy", path: "boletos/hoy" });
  if (conPuerta) paginas.set("puerta", { id: "puerta", label: "Puerta", path: "puerta" });
  if (can(a, pid, "ventas.ver") || can(a, pid, "puerta.validar") || can(a, pid, "funciones.gestionar")) {
    paginas.set("entregas", { id: "entregas", label: "Entregas de beneficios", path: "boletos/beneficios/entregas" });
  }
  return SECCIONES_BOLETOS.map((sec) => {
    const items = sec.items.flatMap((id) => (paginas.has(id) ? [paginas.get(id)!] : []));
    return { id: sec.id, label: sec.label, path: items[0]?.path ?? "", items };
  }).filter((sec) => sec.items.length > 0);
}

/** A dónde mandar a quien abre una página de boletería que no le toca: su primera sub-pestaña
 *  permitida o el Resumen de la obra (nunca de regreso a /boletos, que causaba un ciclo). */
export function salidaBoletos(a: PanelAccessData, pid: string, desde: string): string {
  const t = boletosSubtabs(a, pid).find((x) => x.path !== desde);
  return t ? `/panel/producciones/${pid}/${t.path}` : `/panel/producciones/${pid}`;
}

/** Pestañas que veo en una obra (solo las que tienen algo), cada una con sus secciones y páginas, y su primera
 *  página como liga. */
export function productionGroups(a: PanelAccessData, pid: string, concluida = false, obra?: ObraTipo | null): GrupoTabs[] {
  const mias = new Map(productionTabs(a, pid, concluida).map((t) => [t.id, t]));
  const paginas = paginasObra(a, pid, mias);
  // 0139: lo que no aplica al tipo de obra sale de su pestaña y se junta en Más, marcado. Nada se pierde.
  const fuera = obra ? paginasNoAplican(obra) : new Set<string>();
  const noAplica: SubTab[] = [];
  const quitar = (sec: SubTab): SubTab => {
    const items = (sec.items ?? []).filter((i) => { if (fuera.has(i.id)) { noAplica.push(i); return false; } return true; });
    return { ...sec, path: items[0]?.path ?? sec.path, items };
  };
  const grupos = GRUPOS.map((g) => {
    let tabs: SubTab[];
    if (g.id === "boletos") {
      // La puerta va dentro de "Día de función"; sin acceso a boletería, esa sección sale sola.
      tabs = mias.has("boletos") ? boletosSecciones(a, pid, mias.has("puerta")) : mias.has("puerta") ? boletosSecciones(a, pid, true) : [];
    } else {
      tabs = g.secciones.map((sec) => {
        const items = sec.items.flatMap((id) => (paginas.has(id) ? [paginas.get(id)!] : []));
        return { id: sec.id, label: sec.label, path: items[0]?.path ?? "", items };
      });
    }
    tabs = tabs.map(quitar).filter((sec) => (sec.items?.length ?? 0) > 0);
    return { id: g.id, label: g.label, path: tabs[0]?.path ?? "", tabs };
  });
  if (noAplica.length) {
    const mas = grupos.find((g) => g.id === "mas")!;
    mas.tabs.push({ id: "sec-no-aplica", label: "No aplica a este tipo", path: noAplica[0].path, items: noAplica });
    if (!mas.path) mas.path = noAplica[0].path;
  }
  return grupos.filter((g) => g.tabs.length > 0);
}

/** Las páginas de una pestaña en una sola fila, con el nombre de su sección (vacío si la pestaña no las agrupa). */
export function paginasDePestana(g: GrupoTabs): { seccion: string; paginas: SubTab[] }[] {
  const conNombre = g.tabs.length > 1;
  return g.tabs.map((t) => ({ seccion: conNombre ? t.label : "", paginas: t.items ?? [t] }));
}

/** Todas las páginas de los grupos en una lista (para el buscador del panel). */
export function paginasDeGrupos(grupos: GrupoTabs[]): { grupo: string; label: string; path: string }[] {
  return grupos.flatMap((g) => g.tabs.flatMap((t) => (t.items ?? [t]).map((i) => ({ grupo: g.label, label: i.label, path: i.path }))));
}

/** Qué grupo, pestaña y página están abiertos: la ruta más larga que coincide (Resumen solo exacto).
 *  En Boletos (0127) la pestaña es la sección (Preparar, Vender, Día de función) y `item` la página. */
export function tabActiva(grupos: GrupoTabs[], sub: string): { grupo: GrupoObra | null; tab: string | null; item?: string | null } {
  const limpio = sub.replace(/^\/+|\/+$/g, "");
  const coincide = (path: string) => (path === "" ? limpio === "" : limpio === path || limpio.startsWith(`${path}/`));
  let mejor: { grupo: GrupoObra; tab: string; item: string | null; largo: number } | null = null;
  for (const g of grupos) for (const t of g.tabs) {
    for (const it of t.items ?? []) {
      if (coincide(it.path) && (!mejor || it.path.length > mejor.largo)) mejor = { grupo: g.id, tab: t.id, item: it.id, largo: it.path.length };
    }
    if (!t.items && coincide(t.path) && (!mejor || t.path.length > mejor.largo)) mejor = { grupo: g.id, tab: t.id, item: null, largo: t.path.length };
  }
  if (!mejor) return { grupo: null, tab: null };
  return mejor.item ? { grupo: mejor.grupo, tab: mejor.tab, item: mejor.item } : { grupo: mejor.grupo, tab: mejor.tab };
}

export type Section = { href: string; label: string };

export type NavSection = {
  id: "hoy" | "obras" | "personas" | "ventas" | "sitio" | "ajustes";
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

const VENTAS_PERMS = ["ventas.ver", "ventas.operar", "reportes.ver"];

/** ¿Vendo o veo ventas en alguna obra? (sección Ventas del menú) */
export function hasVentasAccess(a: PanelAccessData): boolean {
  return casa(a, "casa.reportes") || Object.values(a.byProduction).some((p) => p.some((x) => VENTAS_PERMS.includes(x)));
}

/**
 * Menú del panel (esqueleto nuevo, 0138): seis entradas iguales para todos; cada quien ve solo las que le tocan.
 * Hoy · Mis obras (Producciones, Audiciones) · Personas (Directorio, Cumpleaños, Portal del equipo) ·
 * Ventas (todas las obras, Reporte general) · Sitio (Sitio, Club Fan, Difusión, Contacto, DARFY, Eventos, Showcases) · Ajustes.
 * Las direcciones viejas (/panel/usuarios, /panel/reportes…) siguen funcionando y caen en su sección.
 */
export function panelMenu(a: PanelAccessData): NavSection[] {
  const out: NavSection[] = [
    // Notificaciones vive en Hoy (sus últimas, "Ver todas" y el número de nuevas): no es una entrada aparte.
    { id: "hoy", label: "Hoy", href: "/panel", subs: [], match: ["/panel/notificaciones"] },
  ];
  // Quien solo está en el equipo de una convocatoria general no tiene obras: solo ve Audiciones.
  const obras: Section[] = a.isDirector || casa(a, "casa.producciones") || myProductionIds(a).length ? [{ href: "/panel/producciones", label: "Producciones" }] : [];
  if (hasAuditionAccess(a)) obras.push({ href: "/panel/audiciones", label: "Audiciones" });
  if (obras.length) out.push({ id: "obras", label: "Mis obras", href: obras[0].href, subs: obras, match: ["/panel/producciones", "/panel/audiciones"] });
  // Personas y Ajustes: cada subpestaña con su permiso de Casa DARF (0102).
  const personas: Section[] = [
    ...(casa(a, "casa.personas") ? [{ href: "/panel/personas", label: "Directorio" }, { href: "/panel/cumpleanos", label: "Cumpleaños" }] : []),
    // 0105: el equipo de la empresa es Casa DARF (Ajustes); aquí queda su portal (avisos, material, juntas).
    ...(casa(a, "casa.equipo") ? [{ href: "/panel/personas/equipo/portal", label: "Portal del equipo" }] : []),
  ];
  if (personas.length) {
    out.push({
      id: "personas", label: "Personas", href: personas[0].href, subs: personas,
      match: ["/panel/personas", "/panel/talento", "/panel/usuarios", "/panel/cumpleanos"],
    });
  }
  // Ventas: todas las obras juntas (órdenes por aprobar, taquilla, corte) y el Reporte general de Casa DARF.
  if (hasVentasAccess(a)) {
    const ventas: Section[] = [{ href: "/panel/ventas", label: "Ventas" }, ...(casa(a, "casa.reportes") ? [{ href: "/panel/reportes", label: "Reporte general" }] : [])];
    out.push({ id: "ventas", label: "Ventas", href: "/panel/ventas", subs: ventas, match: ["/panel/ventas", "/panel/reportes"] });
  }
  // Sitio: lo que ve y pregunta el público de DARF, más los eventos y los showcases.
  const sitio: Section[] = [
    ...(casa(a, "casa.sitio") ? [{ href: "/panel/ajustes/sitio", label: "Sitio" }] : []),
    // 0112: base de socios del Club Fan.
    ...(casa(a, "casa.club") ? [{ href: "/panel/ajustes/club", label: "Club Fan" }] : []),
    // Guías para redes de DARF (cómo unirte al Club Fan, cómo crear tu cuenta).
    ...(casa(a, "casa.sitio") || casa(a, "casa.club") ? [{ href: "/panel/ajustes/difusion", label: "Difusión DARF" }] : []),
    ...(casa(a, "casa.contacto") ? [{ href: "/panel/contacto", label: "Contacto" }, { href: "/panel/ajustes/darfy", label: "DARFY" }] : []),
    // Eventos (0081/0084): Director, Fan Zone, puerta o taquilla de una obra, o equipo de un evento.
    ...(hasEventoAccess(a) ? [{ href: "/panel/eventos", label: "Eventos" }] : []),
    // Showcases (0121): planes, página y solicitudes de DARF Showcase Shows.
    ...(casa(a, "casa.showcases") ? [{ href: "/panel/showcases", label: "Showcases" }] : []),
  ];
  if (sitio.length) {
    out.push({ id: "sitio", label: "Sitio", href: sitio[0].href, subs: sitio,
      match: ["/panel/ajustes/sitio", "/panel/ajustes/club", "/panel/ajustes/difusion", "/panel/ajustes/darfy", "/panel/contacto", "/panel/eventos", "/panel/showcases"] });
  }
  const ajustes: Section[] = [
    ...(a.isDirector ? [{ href: "/panel/ajustes/casa", label: "Casa DARF" }] : []),
    ...(casa(a, "casa.roles") ? [{ href: "/panel/roles", label: "Roles y permisos" }] : []),
    ...(casa(a, "casa.bitacora") ? [{ href: "/panel/bitacora", label: "Bitácora" }] : []),
  ];
  if (ajustes.length) {
    out.push({ id: "ajustes", label: "Ajustes", href: ajustes[0].href, subs: ajustes, match: ["/panel/roles", "/panel/bitacora", "/panel/ajustes/casa"] });
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
