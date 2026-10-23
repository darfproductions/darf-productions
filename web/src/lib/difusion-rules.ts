// Diseños de difusión (0111): textos de cada diseño para redes, con el estilo de la tarjeta del elenco.
// Funciones puras: difusion-rules.test.ts. El dibujo está en difusion.tsx.

export type TipoDifusion = "faltan" | "adquiere" | "venta" | "preventa" | "hoy" | "ultima" | "ultimos" | "nueva" | "agotadas" | "gracias";

/** `funcion`: el diseño habla de una función en particular (se elige en la página). */
export const DISENOS: { id: TipoDifusion; label: string; ayuda: string; funcion: boolean }[] = [
  { id: "faltan", label: "Faltan X días", ayuda: "Cuenta regresiva a la función que elijas.", funcion: true },
  { id: "venta", label: "Boletos ya a la venta", ayuda: "Para anunciar que ya se pueden comprar.", funcion: false },
  { id: "adquiere", label: "Adquiere tus boletos", ayuda: "Recordatorio de compra con las fechas de la temporada.", funcion: false },
  { id: "preventa", label: "Preventa Club Fan", ayuda: "Si la función tiene preventa: hasta cuándo es exclusiva del club.", funcion: true },
  { id: "nueva", label: "Nueva función", ayuda: "Para anunciar una fecha que se abrió.", funcion: true },
  { id: "ultimos", label: "Últimos boletos", ayuda: "Cuando quedan pocos lugares.", funcion: true },
  { id: "hoy", label: "Hoy es la función", ayuda: "El día de la función, con la hora y el lugar.", funcion: true },
  { id: "ultima", label: "Última función", ayuda: "Para la última fecha de la temporada.", funcion: true },
  { id: "agotadas", label: "Funciones agotadas", ayuda: "Sin función elegida: toda la temporada. Con función: solo esa.", funcion: true },
  { id: "gracias", label: "Gracias", ayuda: "Cierre de temporada.", funcion: false },
];

export function tipoValido(v: unknown): TipoDifusion | null {
  return DISENOS.some((d) => d.id === v) ? (v as TipoDifusion) : null;
}

export type FuncionDifusion = { starts_at: string; venue?: string | null; preventa_hasta?: string | null; preventa_desde?: string | null };
export type DatosDifusion = {
  /** La función elegida (si el diseño la usa). */
  funcion?: FuncionDifusion | null;
  /** Funciones de la temporada (no canceladas), para las fechas. */
  funciones: FuncionDifusion[];
  venue?: string | null;
  hoy?: Date;
};
export type TextoDifusion = {
  /** Línea chica arriba del mensaje (color de acento). */
  arriba: string | null;
  /** El mensaje grande ("\n" = cambio de renglón). Con `numero`, es un número enorme (cuenta regresiva). */
  grande: string;
  numero: boolean;
  /** Línea abajo del mensaje grande. */
  abajo: string | null;
  /** Fecha y hora (o las fechas de la temporada). */
  detalle: string;
  /** Lugar, en su propio renglón. */
  lugar: string | null;
  /** Franja itálica (estilo sello). */
  banda: string;
  /** Dorado del Club Fan en la franja. */
  oro: boolean;
};

const TZ = "America/Mexico_City";
const diaMx = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(d);
const parte = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...o, timeZone: TZ }).format(new Date(iso));

/** Días que faltan (en días de calendario de CDMX). */
export function diasFaltan(startsAt: string, hoy: Date = new Date()): number {
  const a = Date.parse(`${diaMx(hoy)}T00:00:00Z`);
  const b = Date.parse(`${diaMx(new Date(startsAt))}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "Sábado 7 de noviembre". */
export function fechaLarga(iso: string): string {
  const s = `${parte(iso, { weekday: "long" })} ${parte(iso, { day: "numeric", month: "long" })}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5:00 p.m." */
export function hora(iso: string): string {
  return parte(iso, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, " ").replace("a. m.", "a.m.").replace("p. m.", "p.m.");
}

/** Fechas de la temporada: "7 al 22 de noviembre", "28 de noviembre al 6 de diciembre" o una sola fecha. */
export function rangoFechas(funciones: FuncionDifusion[]): string {
  const xs = [...funciones].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!xs.length) return "Próximamente";
  const ini = xs[0].starts_at;
  const fin = xs[xs.length - 1].starts_at;
  if (diaMx(new Date(ini)) === diaMx(new Date(fin))) return fechaLarga(ini);
  const dia = (iso: string) => parte(iso, { day: "numeric" });
  const mes = (iso: string) => parte(iso, { month: "long" });
  const anio = (iso: string) => parte(iso, { year: "numeric" });
  if (anio(ini) === anio(fin) && mes(ini) === mes(fin)) return `${dia(ini)} al ${dia(fin)} de ${mes(fin)}`;
  return `${dia(ini)} de ${mes(ini)} al ${dia(fin)} de ${mes(fin)}`;
}

export function textoDifusion(tipo: TipoDifusion, d: DatosDifusion): TextoDifusion {
  const f = d.funcion ?? null;
  const lugar = (f?.venue ?? d.venue)?.trim() || null;
  const fecha = f ? `${fechaLarga(f.starts_at)} · ${hora(f.starts_at)}` : rangoFechas(d.funciones);
  const base = { arriba: null, numero: false, abajo: null, detalle: fecha, lugar, banda: "Adquiere tus boletos", oro: false };
  switch (tipo) {
    case "faltan": {
      if (!f) return { ...base, grande: "Muy pronto", banda: "Espérala" };
      const n = diasFaltan(f.starts_at, d.hoy);
      if (n > 1) return { ...base, arriba: "Faltan", grande: String(n), numero: true, abajo: "días" };
      if (n === 1) return { ...base, arriba: "Falta 1 día", grande: "¡Es mañana!" };
      return { ...base, grande: "¡Es hoy!", banda: "Te esperamos" };
    }
    case "adquiere":
      return { ...base, arriba: "No te quedes sin el tuyo", grande: "Adquiere\ntus boletos", banda: "Compra en línea" };
    case "venta":
      return { ...base, grande: "Boletos\nya a la venta" };
    case "preventa": {
      const hasta = f?.preventa_hasta ? `Exclusiva hasta el ${fechaLarga(f.preventa_hasta).toLowerCase()}` : null;
      return { ...base, arriba: "Solo para socios", grande: "Preventa\nClub Fan", abajo: hasta, banda: "Únete gratis al Club Fan", oro: true };
    }
    case "hoy":
      return { ...base, grande: "Hoy es\nla función", detalle: f ? hora(f.starts_at) : fecha, banda: "Te esperamos" };
    case "ultima":
      return { ...base, grande: "Última\nfunción", banda: "No te la pierdas" };
    case "ultimos":
      return { ...base, arriba: "¡Corre!", grande: "Últimos\nboletos", banda: "Adquiere los tuyos" };
    case "nueva":
      return { ...base, arriba: "¡Abrimos otra fecha!", grande: "Nueva\nfunción" };
    case "agotadas":
      return { ...base, grande: f ? "Función\nagotada" : "Funciones\nagotadas", banda: "¡Gracias por su apoyo!" };
    case "gracias":
      return { ...base, grande: "¡Gracias!", abajo: "por acompañarnos esta temporada", detalle: rangoFechas(d.funciones), banda: "Nos vemos pronto" };
  }
}
