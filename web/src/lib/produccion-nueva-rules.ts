// Crear una producción paso a paso (0135): puestos sugeridos con sus permisos, opciones de los personajes,
// fechas tentativas por mes y colores sugeridos a partir del logo. Puro, con pruebas en produccion-nueva-rules.test.ts.
import { contrastRatio } from "@/lib/kit-rules";
import { themeProblems } from "@/lib/themes";

export const PASOS = [
  { n: 1, titulo: "Identidad", que: "Logo, imagen de fondo y colores" },
  { n: 2, titulo: "Ficha", que: "Duración, sinopsis, fechas y lugares" },
  { n: 3, titulo: "Equipo", que: "Puestos y permisos" },
  { n: 4, titulo: "Personajes", que: "Protagonistas, apoyo y ensamble" },
  { n: 5, titulo: "Revisar", que: "Todo junto antes de crear" },
] as const;

export type Area = "creativo" | "produccion" | "crew" | "tecnico";
export const AREAS: { valor: Area; label: string }[] = [
  { valor: "creativo", label: "Equipo creativo" },
  { valor: "produccion", label: "Producción" },
  { valor: "crew", label: "Crew" },
  { valor: "tecnico", label: "Técnico" },
];

/** Puestos que se ofrecen al armar el equipo, con los permisos del panel que suelen llevar (se pueden cambiar). */
export const PUESTOS_SUGERIDOS: { puesto: string; area: Area; roles: string[] }[] = [
  { puesto: "Dirección general", area: "creativo", roles: ["direccion_general"] },
  { puesto: "Dirección escénica", area: "creativo", roles: ["direccion", "juez"] },
  { puesto: "Dirección musical", area: "creativo", roles: ["direccion", "juez"] },
  { puesto: "Dirección vocal", area: "creativo", roles: ["asistente", "juez"] },
  { puesto: "Dirección artística", area: "creativo", roles: ["direccion", "juez"] },
  { puesto: "Coreografía", area: "creativo", roles: ["asistente", "juez"] },
  { puesto: "Asistente de dirección", area: "creativo", roles: ["asistente"] },
  { puesto: "Producción", area: "produccion", roles: ["productor"] },
  { puesto: "Stage manager", area: "produccion", roles: ["staff"] },
  { puesto: "Host de audición", area: "produccion", roles: ["host"] },
  { puesto: "Vestuario", area: "crew", roles: ["maquillaje"] },
  { puesto: "Maquillaje y peinado", area: "crew", roles: ["maquillaje"] },
  { puesto: "Escenografía", area: "crew", roles: ["staff"] },
  { puesto: "Iluminación", area: "tecnico", roles: ["staff"] },
  { puesto: "Sonido", area: "tecnico", roles: ["staff"] },
];

export type Categoria = "protagonista" | "apoyo" | "ensamble";
export const CATEGORIAS: { valor: Categoria; label: string; ayuda: string }[] = [
  { valor: "protagonista", label: "Protagonistas", ayuda: "Los papeles principales." },
  { valor: "apoyo", label: "Personajes de apoyo", ayuda: "Papeles con nombre que acompañan a los protagonistas." },
  { valor: "ensamble", label: "Ensamble", ayuda: "Grupos: por ejemplo «Porristas · 6 mujeres» o «Motociclistas · 4 hombres»." },
];
export const TESITURAS = [
  { valor: "soprano", label: "Soprano" }, { valor: "mezzosoprano", label: "Mezzosoprano" }, { valor: "contralto", label: "Contralto" },
  { valor: "tenor", label: "Tenor" }, { valor: "baritono", label: "Barítono" }, { valor: "bajo", label: "Bajo" },
] as const;
export const NIVELES = [{ valor: "no", label: "No" }, { valor: "basico", label: "Básico" }, { valor: "fuerte", label: "Fuerte" }] as const;
export const GENEROS = [{ valor: "mujer", label: "Mujer" }, { valor: "hombre", label: "Hombre" }, { valor: "cualquiera", label: "Cualquiera" }] as const;
export const HABILIDADES = ["Danza aérea", "Acrobacia", "Gimnasia", "Patines", "Tap", "Ballet", "Hip hop", "Toca un instrumento", "Combate escénico", "Acento", "Malabares"];

export const etiqueta = <T extends { valor: string; label: string }>(lista: readonly T[], v: string | null | undefined) => lista.find((x) => x.valor === v)?.label ?? null;

export type PersonajeFicha = {
  id: string; nombre: string; descripcion: string | null; categoria: Categoria; cupo: number; genero: string | null;
  edad_min: number | null; edad_max: number | null; tesituras: string[]; canto: string | null; baile: string | null;
  actuacion: string | null; habilidades: string[]; rasgos: string | null; canciones: string[]; orden: number;
};

/** Resumen de una línea: "Mujer · 16–22 años · Soprano o Mezzosoprano · Baila fuerte · Acrobacia". */
export function resumenPersonaje(p: Pick<PersonajeFicha, "categoria" | "cupo" | "genero" | "edad_min" | "edad_max" | "tesituras" | "canto" | "baile" | "actuacion" | "habilidades">): string {
  const partes: string[] = [];
  if (p.categoria === "ensamble" && p.cupo > 1) partes.push(`${p.cupo} personas`);
  const g = etiqueta(GENEROS, p.genero);
  if (g && p.genero !== "cualquiera") partes.push(p.categoria === "ensamble" && p.cupo > 1 ? (p.genero === "mujer" ? "Mujeres" : "Hombres") : g);
  if (p.edad_min != null && p.edad_max != null) partes.push(p.edad_min === p.edad_max ? `${p.edad_min} años` : `${p.edad_min}–${p.edad_max} años`);
  else if (p.edad_min != null) partes.push(`${p.edad_min}+ años`);
  else if (p.edad_max != null) partes.push(`hasta ${p.edad_max} años`);
  if (p.canto === "no") partes.push("No canta");
  else if (p.tesituras.length) partes.push(p.tesituras.map((t) => etiqueta(TESITURAS, t) ?? t).join(" o "));
  else if (p.canto) partes.push(`Canta ${etiqueta(NIVELES, p.canto)!.toLowerCase()}`);
  if (p.baile && p.baile !== "no") partes.push(`Baila ${etiqueta(NIVELES, p.baile)!.toLowerCase()}`);
  else if (p.baile === "no") partes.push("No baila");
  if (p.actuacion === "fuerte") partes.push("Actuación fuerte");
  partes.push(...p.habilidades);
  return partes.join(" · ");
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2027-03" (de <input type="month">) → "2027-03-01"; vacío o raro → null. */
export function mesDeInput(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(v ?? "").trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}
/** "2027-03-01" → "2027-03" para <input type="month">. */
export const mesAInput = (d: string | null | undefined) => (d ? d.slice(0, 7) : "");

/** "Marzo 2027", "Marzo – Abril 2027" o "Noviembre 2026 – Enero 2027". */
export function textoMeses(desde: string | null | undefined, hasta?: string | null): string | null {
  if (!desde) return null;
  const [ay, am] = desde.split("-").map(Number);
  const a = `${may(MESES[am - 1])} ${ay}`;
  if (!hasta || hasta.slice(0, 7) === desde.slice(0, 7)) return a;
  const [by, bm] = hasta.split("-").map(Number);
  return ay === by ? `${may(MESES[am - 1])} – ${may(MESES[bm - 1])} ${by}` : `${a} – ${may(MESES[bm - 1])} ${by}`;
}

/** Valida el rango tentativo (null si está bien). */
export function validarMeses(desde: string | null, hasta: string | null): string | null {
  if (hasta && !desde) return "Pon primero el mes de inicio.";
  if (desde && hasta && hasta < desde) return "El mes final no puede ser antes del inicial.";
  return null;
}

// ──────── Colores sugeridos a partir del logo ────────
type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
const mezcla = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function hsl([r, g, b]: RGB) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}

/** Colores principales de una imagen (RGBA en bruto): cubetas de 32 niveles, sin pixeles transparentes. */
export function coloresPrincipales(px: ArrayLike<number>, max = 6): { rgb: RGB; peso: number }[] {
  const cubetas = new Map<number, { suma: RGB; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const k = ((px[i] >> 5) << 6) | ((px[i + 1] >> 5) << 3) | (px[i + 2] >> 5);
    const c = cubetas.get(k) ?? { suma: [0, 0, 0] as RGB, n: 0 };
    c.suma[0] += px[i]; c.suma[1] += px[i + 1]; c.suma[2] += px[i + 2]; c.n++;
    cubetas.set(k, c);
    total++;
  }
  return [...cubetas.values()].sort((a, b) => b.n - a.n).slice(0, max)
    .map((c) => ({ rgb: [c.suma[0] / c.n, c.suma[1] / c.n, c.suma[2] / c.n] as RGB, peso: c.n / Math.max(1, total) }));
}

/** Los 4 colores del kit a partir del logo: fondo oscuro teñido del color principal, acento el color más vivo, y
 *  texto claro. Siempre cumple las reglas de legibilidad de la plantilla (si no, aclara el acento). */
export function sugerirColores(px: ArrayLike<number>): { fondo: string; superficie: string; texto: string; acento: string } {
  const cols = coloresPrincipales(px, 8);
  const negro: RGB = [12, 12, 20];
  if (!cols.length) return { fondo: "#14121f", superficie: "#221f33", texto: "#f7f5ff", acento: "#c4b5fd" };
  // Acento: el más saturado con peso razonable; base: el más pesado que tenga algo de color.
  const vivos = cols.filter((c) => c.peso >= 0.03).sort((a, b) => hsl(b.rgb).s - hsl(a.rgb).s);
  const acentoBase = (vivos[0] ?? cols[0]).rgb;
  const base = (cols.find((c) => hsl(c.rgb).s > 0.25) ?? cols[0]).rgb;
  const fondoRgb = mezcla(negro, base, 0.18);
  const fondo = hex(fondoRgb);
  const superficie = hex(mezcla(fondoRgb, base, 0.14));
  const texto = hex(mezcla([250, 248, 255], base, 0.05));
  let acentoRgb = acentoBase;
  for (let i = 0; i < 12 && contrastRatio(hex(acentoRgb), fondo) < 3.2; i++) acentoRgb = mezcla(acentoRgb, [255, 255, 255], 0.2);
  const out = { fondo, superficie, texto, acento: hex(acentoRgb) };
  return themeProblems(out).length ? { ...out, texto: "#ffffff" } : out;
}

// ──────── Audiciones: ficha del personaje vs. perfil de la persona (pop-up del juez) ────────
export type FichaAudicion = {
  id: string; nombre: string; descripcion: string | null; categoria: string | null; cupo: number | null; genero: string | null;
  edad_min: number | null; edad_max: number | null; tesituras: string[]; canto: string | null; baile: string | null;
  actuacion: string | null; habilidades: string[]; rasgos: string | null;
};
export type PerfilAspirante = { tesitura: string | null; canto: string | null; baile: string | null; genero: string | null; habilidades: string[] | null };
export type Comparacion = { que: string; pide: string; tiene: string; ok: boolean | null };

const RANGO: Record<string, number> = { no: 0, basico: 1, fuerte: 2 };
const nivel = (v: string | null) => (v ? etiqueta(NIVELES, v) ?? v : "—");
export const TESITURA_NO_SE = { valor: "no_se", label: "No sé" };

/** Lo que pide el personaje junto a lo que dijo la persona: ✓ cumple, ✗ no cumple, null = no se puede saber. */
export function compararPerfil(f: FichaAudicion, p: PerfilAspirante | null, edad: number | null): Comparacion[] {
  const out: Comparacion[] = [];
  const g = f.genero && f.genero !== "cualquiera" ? f.genero : null;
  if (g) out.push({ que: "Interpreta", pide: etiqueta(GENEROS, g)!, tiene: p?.genero ? (p.genero === "otro" ? "Otro" : etiqueta(GENEROS, p.genero) ?? p.genero) : "—", ok: p?.genero ? p.genero === g : null });
  if (f.edad_min != null || f.edad_max != null) {
    const pide = f.edad_min != null && f.edad_max != null ? `${f.edad_min}–${f.edad_max} años` : f.edad_min != null ? `${f.edad_min}+ años` : `hasta ${f.edad_max} años`;
    out.push({ que: "Edad que aparenta", pide, tiene: edad != null ? `${edad} años` : "—",
      ok: edad == null ? null : (f.edad_min == null || edad >= f.edad_min - 2) && (f.edad_max == null || edad <= f.edad_max + 2) });
  }
  if (f.canto !== "no" && f.tesituras.length) {
    const t = p?.tesitura && p.tesitura !== "no_se" ? p.tesitura : null;
    out.push({ que: "Tesitura", pide: f.tesituras.map((x) => etiqueta(TESITURAS, x) ?? x).join(" o "),
      tiene: p?.tesitura === "no_se" ? "No sabe" : t ? etiqueta(TESITURAS, t) ?? t : "—", ok: t ? f.tesituras.includes(t) : null });
  }
  for (const [k, que] of [["canto", "Canto"], ["baile", "Baile"]] as const) {
    const pide = f[k];
    if (!pide || pide === "no") continue;
    const tiene = p?.[k] ?? null;
    out.push({ que, pide: nivel(pide), tiene: nivel(tiene), ok: tiene ? RANGO[tiene] >= RANGO[pide] : null });
  }
  const suyas = new Set((p?.habilidades ?? []).map((h) => h.toLowerCase()));
  for (const h of f.habilidades) out.push({ que: h, pide: "Sí", tiene: p ? (suyas.has(h.toLowerCase()) ? "Sí" : "No dijo") : "—", ok: p ? suyas.has(h.toLowerCase()) : null });
  return out;
}
