// Diseños de preventa (Club Fan en 3 momentos y preventa privada con código). Funciones puras:
// difusion-preventa-rules.test.ts. El dibujo está en difusion-preventa.tsx.
import { diasFaltan, fechaLarga, hora } from "@/lib/difusion-rules";

export type ModoFan = "ahora" | "manana" | "fechas";
export type FormatoPreventa = "cuadrado" | "post" | "historia";
export const TAMANO_PREVENTA: Record<FormatoPreventa, { w: number; h: number; label: string }> = {
  cuadrado: { w: 1080, h: 1080, label: "Cuadrado 1:1" },
  post: { w: 1080, h: 1440, label: "Post 3:4" },
  historia: { w: 1080, h: 1920, label: "Historia 9:16" },
};
export const MODOS_FAN: { id: ModoFan; label: string; ayuda: string }[] = [
  { id: "ahora", label: "Preventa: ¡ya empezó!", ayuda: "Mientras está abierta, con la fecha en que termina." },
  { id: "manana", label: "Preventa: mañana", ayuda: "Un día antes, con la hora en que abre." },
  { id: "fechas", label: "Preventa: del … al …", ayuda: "Para anunciarla con sus fechas." },
];
export const esModoFan = (x: unknown): x is ModoFan => MODOS_FAN.some((m) => m.id === x);
export const esFormatoPreventa = (x: unknown): x is FormatoPreventa => typeof x === "string" && x in TAMANO_PREVENTA;

export type TextoPreventa = {
  arriba: string | null;
  /** Mensaje grande ("\n" = renglón). */
  grande: string;
  abajo: string | null;
  /** Franja inclinada. */
  banda: string;
};

const TZ = "America/Mexico_City";
const parte = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...o, timeZone: TZ }).format(new Date(iso));

/** "Del 24 al 26 de octubre" / "Del 30 de octubre al 2 de noviembre" / "Desde el sábado 24 de octubre". */
export function rangoCorto(desde: string | null | undefined, hasta: string | null | undefined): string {
  if (!desde && !hasta) return "Muy pronto";
  if (!hasta) return `Desde el ${fechaLarga(desde!).toLowerCase()}`;
  if (!desde) return `Hasta el ${fechaLarga(hasta).toLowerCase()}`;
  const [d1, m1, d2, m2] = [parte(desde, { day: "numeric" }), parte(desde, { month: "long" }), parte(hasta, { day: "numeric" }), parte(hasta, { month: "long" })];
  return m1 === m2 ? `Del ${d1} al ${d2} de ${m2}` : `Del ${d1} de ${m1} al ${d2} de ${m2}`;
}

/** El momento que toca hoy: ya abrió → "ahora"; abre mañana → "manana"; si no → "fechas". */
export function modoSugerido(desde: string | null | undefined, hasta: string | null | undefined, hoy: Date = new Date()): ModoFan {
  const t = hoy.getTime();
  if (hasta && Date.parse(hasta) > t && (!desde || Date.parse(desde) <= t)) return "ahora";
  if (desde && Date.parse(desde) > t && diasFaltan(desde, hoy) === 1) return "manana";
  return "fechas";
}

/** Textos de la preventa del Club Fan (`sitio` sin https://). */
export function textoPreventaFan(modo: ModoFan, desde: string | null | undefined, hasta: string | null | undefined, sitio: string): TextoPreventa {
  const banda = `Únete gratis en ${sitio}/fan-zone`;
  const grande = "Preventa\nClub Fan";
  if (modo === "ahora") return { arriba: "¡Ya empezó!", grande, abajo: hasta ? `Hasta el ${fechaLarga(hasta).toLowerCase()} · ${hora(hasta)}` : "Solo para socios del Club Fan", banda };
  if (modo === "manana") return { arriba: "¡Es mañana!", grande, abajo: desde ? `Abre mañana a las ${hora(desde)}` : "Abre mañana", banda };
  return { arriba: "Solo para socios", grande, abajo: rangoCorto(desde, hasta), banda };
}

/** Textos de la preventa privada de un código. */
export function textoPreventaCodigo(c: { nombre: string; codigo: string; desde?: string | null; hasta?: string | null; sitio: string }): TextoPreventa & { codigo: string; liga: string } {
  // El nombre en dos renglones si es largo ("Familias del elenco" → "Familias\ndel elenco").
  const palabras = c.nombre.trim().split(/\s+/);
  const grande = c.nombre.length > 12 && palabras.length > 1 ? `${palabras[0]}\n${palabras.slice(1).join(" ")}` : c.nombre.trim();
  return {
    arriba: "Preventa privada para",
    grande,
    abajo: c.desde || c.hasta ? rangoCorto(c.desde, c.hasta) : null,
    banda: "Antes que nadie",
    codigo: c.codigo,
    liga: `${c.sitio}/preventa/${c.codigo}`,
  };
}

/** "darfproductions.com" desde la URL del sitio (sin https:// ni / final). */
export function sitioCorto(url: string | null | undefined): string {
  return (url || "https://darfproductions.com").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
