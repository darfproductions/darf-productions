// Gafete digital (0078). Funciones puras: gafete-rules.test.ts.

/** Categoría del gafete (0087), de mayor a menor: la más alta de la persona. */
export type Franja = "manager" | "produccion" | "direccion" | "crew" | "staff";

/** Colores de la banda de abajo: Manager degradado, Producción rojo y Dirección azul del logo, Crew lila,
 *  Staff rosa. (Fan dorado y Cuenta gris están en credencial-fan-rules y credencial-rules.) */
export const FRANJAS: Record<Franja, { label: string; fondo: string; texto: string }> = {
  manager: { label: "MANAGER", fondo: "linear-gradient(120deg,#340feb,#830886 55%,#d20122)", texto: "#ffffff" },
  produccion: { label: "PRODUCCIÓN", fondo: "#d20122", texto: "#ffffff" },
  direccion: { label: "DIRECCIÓN", fondo: "#340feb", texto: "#ffffff" },
  crew: { label: "CREW", fondo: "#a48bff", texto: "#0b0910" },
  staff: { label: "STAFF", fondo: "#ff2d87", texto: "#0b0910" },
};

/** Categorías que se eligen al crear un rol del panel (Manager es el Equipo DARF y el Director). */
export const CATEGORIAS_ROL: { id: Exclude<Franja, "manager">; label: string; ayuda: string }[] = [
  { id: "produccion", label: "Producción", ayuda: "Rojo" },
  { id: "direccion", label: "Dirección", ayuda: "Azul" },
  { id: "crew", label: "Crew", ayuda: "Lila" },
  { id: "staff", label: "Staff", ayuda: "Rosa" },
];

export type GafetePublico = {
  /** 0083: la credencial es única; solo el nivel "equipo" trae papel y contacto. */
  nivel?: "equipo" | "club" | "cuenta"; socio?: { numero: number; desde: string; fundador: boolean } | null;
  nombre: string; franja: Franja; papel: string;
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
};

const DEGRADADO_LUZ: [number, string][] = [[0, "#340feb"], [0.55, "#830886"], [1, "#d20122"]];

/** Año en curso en CDMX (vigencia del gafete). */
export function anioMx(hoy: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Mexico_City" }).format(hoy);
}

/** Gafete del equipo y elencos (0080: el puesto más alto, sin obra; abajo "DARF Productions · año"). */
export function paseGafete(g: { nombre: string; fotoUrl: string | null; franja: Franja; papel: string; qr?: string; codigo?: string }, hoy: Date = new Date()): PaseVista {
  const f = FRANJAS[g.franja] ?? FRANJAS.crew;
  return {
    tema: "darf", logo: "/marca/darf-monograma.svg", logoAlt: "DARF", nombre: g.nombre, fotoUrl: g.fotoUrl,
    titulo: g.papel, pie: `DARF Productions · ${anioMx(hoy)}`,
    banda: { ...f, degradado: g.franja === "manager" ? DEGRADADO_LUZ : undefined }, qr: g.qr, codigo: g.codigo,
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
