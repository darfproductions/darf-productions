// Más diseños de Difusión: mapa de zonas, cómo comprar, invitación, calendario de funciones y lo que incluye cada
// zona. Funciones puras: difusion-extra-rules.test.ts. El dibujo está en difusion-extra.tsx.
import { fechaLarga, hora } from "@/lib/difusion-rules";
import type { Forma } from "@/lib/mapa-libre";

export type DisenoExtra = "mapa" | "comprar" | "invitacion" | "calendario" | "incluye";
export const DISENOS_EXTRA: { id: DisenoExtra; label: string; ayuda: string; funcion: boolean }[] = [
  { id: "invitacion", label: "Invitación", ayuda: "\"DARF Productions te invita a…\" con todas las funciones, WhatsApp, página y QR.", funcion: false },
  { id: "mapa", label: "Mapa de zonas", ayuda: "El mapa del teatro con el color y precio de cada zona.", funcion: true },
  { id: "comprar", label: "¿Cómo aseguro mi lugar?", ayuda: "Dos opciones: por WhatsApp o en la página.", funcion: false },
  { id: "calendario", label: "Calendario de funciones", ayuda: "Todas las fechas y horarios de la temporada.", funcion: false },
  { id: "incluye", label: "Lo que incluye cada zona", ayuda: "Zonas con sus beneficios (acceso anticipado, souvenirs…).", funcion: false },
];
export const esDisenoExtra = (x: unknown): x is DisenoExtra => DISENOS_EXTRA.some((d) => d.id === x);

// ──────── Mapa ────────
export type AsientoMapa = { x: number | null; y: number | null; fila: string | null; numero: number | null; lado: string | null; zona: string | null };
export type PuntoMapa = { x: number; y: number; zona: string | null };
export type FormaMapa = { x: number; y: number; ancho: number; alto: number; rot: number; etiqueta: string };

/** Puntos del mapa en un lienzo de ancho×alto (con margen), y el escenario. Con posiciones (mapa libre) usa las
 *  suyas; si no, arma la cuadrícula de filas como la compra (izquierda, central, derecha con pasillos). */
export function puntosMapa(asientos: AsientoMapa[], formas: Forma[], ancho: number, alto: number): { puntos: PuntoMapa[]; formas: FormaMapa[]; radio: number; escenarioArriba: boolean } {
  const libre = asientos.some((a) => a.x != null);
  let crudos: PuntoMapa[];
  let fs: FormaMapa[] = [];
  if (libre) {
    crudos = asientos.filter((a) => a.x != null).map((a) => ({ x: a.x!, y: a.y ?? 0, zona: a.zona }));
    fs = formas.map((f) => ({ x: f.x, y: f.y, ancho: f.ancho, alto: f.alto, rot: f.rot, etiqueta: f.etiqueta }));
  } else {
    const filas = [...new Set(asientos.map((a) => a.fila ?? "?"))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    crudos = [];
    filas.forEach((f, fi) => {
      let col = 0;
      for (const lado of ["izquierda", "central", "derecha"]) {
        const xs = asientos.filter((a) => (a.fila ?? "?") === f && (a.lado ?? "central") === lado).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
        if (!xs.length) continue;
        if (col) col += 2;
        for (const a of xs) crudos.push({ x: col++ * 20, y: fi * 22, zona: a.zona });
      }
    });
    // Centra cada fila sobre la más ancha.
    const ancho0 = Math.max(0, ...crudos.map((p) => p.x));
    for (const fi of new Set(crudos.map((p) => p.y))) {
      const fila = crudos.filter((p) => p.y === fi);
      const dx = (ancho0 - Math.max(...fila.map((p) => p.x))) / 2;
      for (const p of fila) p.x += dx;
    }
  }
  if (!crudos.length) return { puntos: [], formas: [], radio: 0, escenarioArriba: !libre };
  const xs = [...crudos.map((p) => p.x), ...fs.flatMap((f) => [f.x - f.ancho / 2, f.x + f.ancho / 2])];
  const ys = [...crudos.map((p) => p.y), ...fs.flatMap((f) => [f.y - f.alto / 2, f.y + f.alto / 2])];
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w0 = Math.max(1, Math.max(...xs) - x0), h0 = Math.max(1, Math.max(...ys) - y0);
  // Espacio para el escenario arriba cuando no hay mapa libre.
  const reservaArriba = libre ? 0 : Math.round(alto * 0.14);
  const esc = Math.min((ancho - 20) / w0, (alto - reservaArriba - 20) / h0);
  // Con escenario arriba, los asientos van pegados a él (sin hueco); el mapa libre se centra.
  const ox = (ancho - w0 * esc) / 2, oy = libre ? (alto - h0 * esc) / 2 : reservaArriba + 10;
  const radio = Math.max(2, Math.min(14, esc * (libre ? 7 : 8.5)));
  return {
    puntos: crudos.map((p) => ({ x: ox + (p.x - x0) * esc, y: oy + (p.y - y0) * esc, zona: p.zona })),
    formas: fs.map((f) => ({ ...f, x: ox + (f.x - x0) * esc, y: oy + (f.y - y0) * esc, ancho: f.ancho * esc, alto: f.alto * esc })),
    radio,
    escenarioArriba: !libre,
  };
}

/** "$350" (sin centavos ni MXN, para el diseño). */
export function precioCorto(n: number | null | undefined): string {
  return n == null ? "" : `$${Math.round(Number(n)).toLocaleString("es-MX")}`;
}

// ──────── Cómo comprar ────────
/** "446 522 0560" desde "524465220560". */
export function telefonoLegible(wa: string): string {
  const d = wa.replace(/\D/g, "").replace(/^52(?=\d{10}$)/, "");
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

export type OpcionCompra = { titulo: string; pasos: string[] };
export function pasosComprar(o: { whatsapp: string; liga: string; modo?: string | null }): OpcionCompra[] {
  const wa: OpcionCompra = { titulo: "Por WhatsApp", pasos: [
    `Escríbenos al ${telefonoLegible(o.whatsapp) || "WhatsApp de DARF"}`,
    "Dinos la función y cuántos lugares quieres",
    "Paga y recibe tu boleto con QR",
  ] };
  if (o.modo === "whatsapp") return [wa];
  return [
    wa,
    { titulo: "En la página", pasos: [
      `Entra a ${o.liga}`,
      "Elige tu función y aparta tus lugares",
      "Cierra tu compra por WhatsApp y recibe tu QR",
    ] },
  ];
}

// ──────── Calendario ────────
/** Renglones del calendario (las que caben) y cuántas más hay. */
export function renglonesCalendario(funciones: { starts_at: string }[], max: number, hoy: Date = new Date()): { renglones: { fecha: string; hora: string }[]; mas: number } {
  const futuras = funciones.filter((f) => Date.parse(f.starts_at) > hoy.getTime() - 3 * 3600_000).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const xs = futuras.length ? futuras : funciones;
  return { renglones: xs.slice(0, max).map((f) => ({ fecha: fechaLarga(f.starts_at), hora: hora(f.starts_at) })), mas: Math.max(0, xs.length - max) };
}

// ──────── Invitación ────────
export function textoInvitacion(o: { funcion?: { starts_at: string } | null; rango: string }): { fecha: string; hora: string | null } {
  return o.funcion ? { fecha: fechaLarga(o.funcion.starts_at), hora: hora(o.funcion.starts_at) } : { fecha: o.rango, hora: null };
}
