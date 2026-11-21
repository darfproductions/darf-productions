// Fechas y dinero como los muestra la web: en español de México y con la hora de Querétaro.

const ZONA = "America/Mexico_City";

export function fechaLarga(iso: string): string {
  const s = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, day: "numeric", month: "short" }).format(new Date(iso)).replace(".", "");
}

export function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(/\s?a\.\s?m\./, " a. m.").replace(/\s?p\.\s?m\./, " p. m.");
}

export function dinero(n: number): string {
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

/** Saludo según la hora de Querétaro. */
export function saludo(ahora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "numeric", hour12: false }).format(ahora));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}
