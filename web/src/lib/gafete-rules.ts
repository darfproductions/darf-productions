// Gafete digital (0078). Funciones puras: gafete-rules.test.ts.

import { cuantas, medallaSrc, nivelDe } from "@/lib/lealtad-rules";

/** Categoría del gafete (0087), de mayor a menor: la más alta de la persona. */
export type Franja = "casa" | "direccion_general" | "produccion" | "direccion" | "crew" | "staff";

/** Colores de la banda de abajo: Casa DARF holográfica (0102), Dirección general plata (0101), Producción rojo y Dirección azul del logo, Crew lila,
 *  Staff rosa. (Fan dorado y Cuenta gris están en credencial-fan-rules y credencial-rules.) */
export const FRANJAS: Record<Franja, { label: string; fondo: string; texto: string }> = {
  casa: { label: "CASA DARF", fondo: "linear-gradient(115deg,#ffb8ec 0%,#c9b2ff 25%,#9fe2ff 50%,#b9ffe0 72%,#ffe6a8 100%)", texto: "#1a1030" },
  direccion_general: { label: "DIRECCIÓN GENERAL", fondo: "linear-gradient(120deg,#8e959e,#e6e9ee 45%,#b8bec7 70%,#f4f6f8)", texto: "#0b0910" },
  produccion: { label: "PRODUCCIÓN", fondo: "#d20122", texto: "#ffffff" },
  direccion: { label: "DIRECCIÓN", fondo: "#340feb", texto: "#ffffff" },
  crew: { label: "CREW", fondo: "#a48bff", texto: "#0b0910" },
  staff: { label: "STAFF", fondo: "#ff2d87", texto: "#0b0910" },
};

/** Categorías que se eligen al crear un rol de obra (Casa DARF y Dirección general son de sistema). */
export const CATEGORIAS_ROL: { id: Exclude<Franja, "casa" | "direccion_general">; label: string; ayuda: string }[] = [
  { id: "produccion", label: "Producción", ayuda: "Rojo" },
  { id: "direccion", label: "Dirección", ayuda: "Azul" },
  { id: "crew", label: "Crew", ayuda: "Lila" },
  { id: "staff", label: "Staff", ayuda: "Rosa" },
];

export type GafetePublico = {
  /** 0083: la credencial es única; solo el nivel "equipo" trae papel y contacto. */
  nivel?: "equipo" | "club" | "cuenta"; socio?: { numero: number; desde: string; fundador: boolean } | null;
  nombre: string; franja: Franja; papel: string; casa_desde?: number | null;
  /** DARF Loyalty (0103): número de producciones. */
  lealtad?: number | null;
  /** Medalla de fan (0104): funciones y eventos a los que entró. */
  fan_visitas?: number | null;
  retrato_path: string | null; telefono: string | null; correo: string | null; instagram: string | null; perfil: string | null;
};

/** Banda de color de abajo (gafete y credencial del Club Fan). `degradado` es para el canvas del PDF. */
export type Banda = { label: string; fondo: string; texto: string; degradado?: [number, string][] };

/** Lo que se dibuja (pantalla y PDF): gafete del equipo o credencial del Club Fan. */
export type PaseVista = {
  tema: "darf" | "fan"; logo: string; logoAlt: string; nombre: string; fotoUrl: string | null;
  titulo: string; pie: string; banda: Banda; qr?: string; codigo?: string;
  /** Equipo que también es socio del Club Fan (0083): "Socio #0001" y el sello del club. */
  sello?: string;
  /** Casa DARF (0102): "Casa DARF · desde 2024" y su sello holográfico (va antes que el del club). */
  casa?: string;
  /** DARF Loyalty (0103): número de producciones; desde 3 lleva medalla (va después del club). */
  lealtad?: number | null;
  /** Medalla de fan (0104): funciones y eventos a los que entró; solo se ve si es socio del club. */
  fanVisitas?: number | null;
};

/** Holográfico iridiscente de Casa DARF (0102): mismo trazo que el CSS de FRANJAS. */
const DEGRADADO_HOLO: [number, string][] = [[0, "#ffb8ec"], [0.25, "#c9b2ff"], [0.5, "#9fe2ff"], [0.72, "#b9ffe0"], [1, "#ffe6a8"]];
/** Plata metálica de Dirección general (0101): mismo trazo que el CSS de FRANJAS. */
const DEGRADADO_PLATA: [number, string][] = [[0, "#8e959e"], [0.45, "#e6e9ee"], [0.7, "#b8bec7"], [1, "#f4f6f8"]];
/** Degradados de las franjas que no son de un solo color (para el canvas del PDF y las imágenes de Wallet). */
export const DEGRADADOS: Partial<Record<Franja, [number, string][]>> = { casa: DEGRADADO_HOLO, direccion_general: DEGRADADO_PLATA };

export type Sello = { id: "club" | "fan" | "lealtad" | "casa"; src: string; alt: string };

/** Sellos de la persona (todos se muestran), en el orden de la credencial web y el PDF: Club Fan, las
 *  medallas (fan y DARF Loyalty) al centro y Casa DARF (Diego 2026-10-14). Van en una fila debajo del logo. */
export function sellosDe(p: Pick<PaseVista, "tema" | "casa" | "sello" | "lealtad" | "fanVisitas">): Sello[] {
  const out: Sello[] = [];
  const socio = p.tema === "fan" || !!p.sello;
  if (socio) out.push({ id: "club", src: "/marca/sello-club.svg", alt: "Socio del Club Fan" });
  const fan = socio ? nivelDe(p.fanVisitas, "fan") : null;
  if (fan && p.fanVisitas) out.push({ id: "fan", src: medallaSrc(p.fanVisitas, "fan"), alt: `DARF Fan Zone · ${fan.nombre} · ${cuantas(p.fanVisitas, "fan")}` });
  const nivel = nivelDe(p.lealtad);
  if (nivel && p.lealtad) out.push({ id: "lealtad", src: medallaSrc(p.lealtad), alt: `DARF Loyalty · ${nivel.nombre} · ${cuantas(p.lealtad)}` });
  if (p.casa) out.push({ id: "casa", src: "/marca/sello-casa.svg", alt: "Casa DARF" });
  return out;
}

/** Fuera de la página (Wallet y PDF) no van las medallas, solo los sellos del Club Fan y de Casa DARF:
 *  las medallas se ven solo en la app o la página (Diego 2026-10-15). */
export function sellosFuera(s: Sello[]): Sello[] {
  return s.filter((x) => x.id === "club" || x.id === "casa");
}

/** Apple Wallet: el DARF cuadrado en la esquina y después los sellos, la medalla primero. */
export function sellosApple(s: Sello[]): Sello[] {
  const orden = { lealtad: 0, fan: 1, casa: 2, club: 3 };
  return [...s].sort((a, b) => orden[a.id] - orden[b.id]);
}

/** Franja de Google Wallet del gafete: el logo DARF primero y después sus sellos (Diego 2026-10-15). */
export function filaGoogle<T extends string>(ids: T[]): (T | "darf")[] {
  return ["darf", ...ids];
}

/** Año en curso en CDMX (vigencia del gafete). */
export function anioMx(hoy: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Mexico_City" }).format(hoy);
}

/** Gafete del equipo y elencos (0080: el puesto más alto, sin obra; abajo "DARF Productions · año"). */
export function paseGafete(g: { nombre: string; fotoUrl: string | null; franja: Franja; papel: string; qr?: string; codigo?: string; casaDesde?: number | null; lealtad?: number | null; fanVisitas?: number | null }, hoy: Date = new Date()): PaseVista {
  const f = FRANJAS[g.franja] ?? FRANJAS.crew;
  const casa = g.franja === "casa" ? `Casa DARF · desde ${g.casaDesde ?? anioMx(hoy)}` : undefined;
  return {
    tema: "darf", logo: "/marca/darf-principal.svg", logoAlt: "DARF Productions", nombre: g.nombre, fotoUrl: g.fotoUrl,
    titulo: g.papel, pie: `DARF Productions · ${anioMx(hoy)}`,
    banda: { ...f, degradado: DEGRADADOS[g.franja] }, qr: g.qr, codigo: g.codigo, ...(casa ? { casa } : {}), ...(g.lealtad ? { lealtad: g.lealtad } : {}), ...(g.fanVisitas ? { fanVisitas: g.fanVisitas } : {}),
  };
}

export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "D";
}

/** Liga que va dentro del QR. */
export function ligaGafete(origen: string, token: string): string {
  return `${origen.replace(/\/$/, "")}/g/${token}`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");

/** Tarjeta de contacto (vCard 3.0) con lo que la persona eligió compartir. */
export function vcard(g: Pick<GafetePublico, "nombre" | "papel" | "telefono" | "correo" | "instagram">, url: string | null): string {
  const partes = g.nombre.trim().split(/\s+/);
  const lineas = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(g.nombre.trim())}`,
    `N:${esc(partes.slice(1).join(" "))};${esc(partes[0] ?? "")};;;`,
    "ORG:DARF Productions",
    `TITLE:${esc(g.papel)}`,
  ];
  if (g.telefono) lineas.push(`TEL;TYPE=CELL:${g.telefono.replace(/[^\d+]/g, "")}`);
  if (g.correo) lineas.push(`EMAIL;TYPE=INTERNET:${g.correo}`);
  if (g.instagram) lineas.push(`X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${g.instagram.replace(/^@/, "")}`);
  if (url) lineas.push(`URL:${url}`);
  lineas.push("END:VCARD");
  return lineas.join("\r\n") + "\r\n";
}
