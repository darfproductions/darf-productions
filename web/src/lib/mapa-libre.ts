// Mapa de asientos libre (0113): el teatro se diseña en la página con un escenario (rectángulos y óvalos que se
// mueven y giran) y bloques de asientos (rectos o en arco). De los bloques salen los asientos con su posición.
// La numeración es fila + número ("A12") y nunca se repite en todo el mapa. Funciones puras: mapa-libre.test.ts.

export type Forma = { id: string; tipo: "rect" | "elipse"; etiqueta: string; x: number; y: number; ancho: number; alto: number; rot: number };

export type Bloque = {
  id: string;
  nombre: string;
  forma: "recto" | "arco";
  /** Recto: centro de la primera fila. Arco: centro del círculo (el escenario). */
  x: number;
  y: number;
  /** Recto: giro en grados (0 = las filas se alejan hacia abajo). */
  rot: number;
  filas: number;
  /** Asientos de la primera fila. */
  asientos: number;
  /** Asientos que suma cada fila. */
  crece: number;
  /** Distancia entre asientos y entre filas. */
  paso: number;
  sepFila: number;
  /** Recto: curvatura de las filas (-100 a 100; 0 = recta). */
  curva: number;
  /** Arco: radio de la primera fila y ángulos (grados; 0 = arriba, en el sentido del reloj). */
  radio: number;
  desde: number;
  hasta: number;
  /** Primera fila: "A" (letras) o "1" (números). */
  filaInicial: string;
  /** Primer número; vacío = sigue después del último número que tiene esa fila en los bloques anteriores. */
  numInicial: number | null;
  /** Numerar de izquierda a derecha o al revés (viendo desde el escenario hacia el público: izq = izquierda del dibujo). */
  sentido: "izq" | "der";
  zona: string | null;
  /** Asientos de cada fila (si una fila no tiene dato, se usa asientos + crece). */
  porFila?: number[] | null;
  /** Zona propia de un asiento: clave "fila:lugar" (fila del bloque desde 0, lugar en el orden en que se numera). */
  zonasAsiento?: Record<string, string>;
  /** Lugares quitados ("fila:lugar"): no se crean y la numeración se recorre. */
  quitados?: string[];
};

export type Diseno = { version: 1; formas: Forma[]; bloques: Bloque[] };

export type AsientoLibre = { fila: string; numero: number; etiqueta: string; x: number; y: number; zona: string | null; seccion: string; bloque: string; clave: string };

/** Un lugar quitado (solo para dibujarlo punteado en el editor). */
export type LugarQuitado = { x: number; y: number; bloque: string; clave: string };

/** Asientos de la fila f de un bloque. */
export function asientosFila(b: Bloque, f: number): number {
  const v = b.porFila?.[f];
  return Math.max(0, Math.floor(typeof v === "number" && Number.isFinite(v) ? v : b.asientos + f * b.crece));
}

export const MAX_ASIENTOS_LIBRE = 2000;
const rad = (g: number) => (g * Math.PI) / 180;
const r1 = (n: number) => Math.round(n * 10) / 10 || 0;

/** Nombre de la fila i (0 = la primera) a partir de "A" o de un número. */
export function nombreFila(inicial: string, i: number): string {
  const t = inicial.trim().toUpperCase();
  if (/^\d+$/.test(t)) return String(Number(t) + i);
  const base = /^[A-Z]$/.test(t) ? t.charCodeAt(0) - 65 : 0;
  let n = base + i;
  let s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** Posiciones de un bloque, fila por fila, en el orden en que se numeran. */
export function posicionesBloque(b: Bloque): { fila: number; puntos: { x: number; y: number }[] }[] {
  const out: { fila: number; puntos: { x: number; y: number }[] }[] = [];
  for (let f = 0; f < Math.max(0, Math.floor(b.filas)); f++) {
    const n = asientosFila(b, f);
    const puntos: { x: number; y: number }[] = [];
    if (b.forma === "arco") {
      const r = b.radio + f * b.sepFila;
      const span = b.hasta - b.desde;
      const completo = Math.abs(span) >= 359.5;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? b.desde + span / 2 : b.desde + (completo ? (span / n) * i : (span / (n - 1)) * i);
        puntos.push({ x: r1(b.x + r * Math.sin(rad(a))), y: r1(b.y - r * Math.cos(rad(a))) });
      }
    } else {
      const ancho = (n - 1) * b.paso;
      const k = (b.curva / 100) * 0.004;
      const c = Math.cos(rad(b.rot)), s = Math.sin(rad(b.rot));
      for (let i = 0; i < n; i++) {
        const lx = -ancho / 2 + i * b.paso;
        const ly = f * b.sepFila + k * lx * lx;
        puntos.push({ x: r1(b.x + lx * c - ly * s), y: r1(b.y + lx * s + ly * c) });
      }
    }
    out.push({ fila: f, puntos: b.sentido === "der" ? puntos.reverse() : puntos });
  }
  return out;
}

/** Todos los asientos del diseño. Numeración automática: sigue por fila a través de los bloques, en orden. */
export function generarLibre(d: Diseno): AsientoLibre[] {
  const ultimo = new Map<string, number>();
  const out: AsientoLibre[] = [];
  for (const b of d.bloques) {
    const fuera = new Set(b.quitados ?? []);
    for (const { fila, puntos } of posicionesBloque(b)) {
      const nombre = nombreFila(b.filaInicial || "A", fila);
      let num = b.numInicial && b.numInicial > 0 ? Math.floor(b.numInicial) : (ultimo.get(nombre) ?? 0) + 1;
      for (const [i, p] of puntos.entries()) {
        const k = `${fila}:${i}`;
        if (fuera.has(k)) continue; // quitado: no gasta número (la numeración se recorre)
        out.push({ fila: nombre, numero: num, etiqueta: `${nombre}${num}`, x: p.x, y: p.y, zona: b.zonasAsiento?.[k] ?? b.zona,
          seccion: b.nombre.trim() || "Bloque", bloque: b.id, clave: `${b.id}|${k}` });
        ultimo.set(nombre, Math.max(ultimo.get(nombre) ?? 0, num));
        num++;
      }
    }
  }
  return out;
}

/** Lugares quitados del diseño, con su posición (para dibujarlos punteados y poder volver a ponerlos). */
export function lugaresQuitados(d: Diseno): LugarQuitado[] {
  const out: LugarQuitado[] = [];
  for (const b of d.bloques) {
    const fuera = new Set(b.quitados ?? []);
    if (!fuera.size) continue;
    for (const { fila, puntos } of posicionesBloque(b)) {
      puntos.forEach((p, i) => { const k = `${fila}:${i}`; if (fuera.has(k)) out.push({ x: p.x, y: p.y, bloque: b.id, clave: `${b.id}|${k}` }); });
    }
  }
  return out;
}

/** Separa "bloque|fila:lugar" en el bloque y la clave dentro del bloque. */
export function partirClave(clave: string): { bloque: string; k: string } {
  const i = clave.lastIndexOf("|");
  return { bloque: clave.slice(0, i), k: clave.slice(i + 1) };
}

/** Etiquetas repetidas (nunca debe haber dos "A1"). */
export function repetidos(asientos: { etiqueta: string }[]): string[] {
  const vistos = new Set<string>(), rep = new Set<string>();
  for (const a of asientos) { if (vistos.has(a.etiqueta)) rep.add(a.etiqueta); vistos.add(a.etiqueta); }
  return [...rep].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/** Asientos que quedan encimados (más cerca que medio paso): suele ser un bloque encima de otro. */
export function encimados(asientos: { x: number; y: number }[], min = 9): number {
  const celda = new Map<string, { x: number; y: number }[]>();
  let n = 0;
  for (const a of asientos) {
    const cx = Math.floor(a.x / min), cy = Math.floor(a.y / min);
    let choca = false;
    for (let dx = -1; dx <= 1 && !choca; dx++) for (let dy = -1; dy <= 1 && !choca; dy++) {
      for (const b of celda.get(`${cx + dx}:${cy + dy}`) ?? []) if (Math.hypot(a.x - b.x, a.y - b.y) < min) { choca = true; break; }
    }
    if (choca) n++;
    const k = `${cx}:${cy}`;
    celda.set(k, [...(celda.get(k) ?? []), a]);
  }
  return n;
}

/** Errores que impiden guardar. */
export function erroresDiseno(d: Diseno, asientos: AsientoLibre[]): string[] {
  const e: string[] = [];
  if (!d.bloques.length) e.push("Agrega al menos un bloque de asientos.");
  if (asientos.length > MAX_ASIENTOS_LIBRE) e.push(`Son ${asientos.length} asientos: el máximo es ${MAX_ASIENTOS_LIBRE}.`);
  const rep = repetidos(asientos);
  if (rep.length) e.push(`Hay asientos repetidos: ${rep.slice(0, 8).join(", ")}${rep.length > 8 ? "…" : ""}. Cambia la fila inicial o el primer número de algún bloque.`);
  if (asientos.some((a) => a.fila.length > 5)) e.push("Hay filas con nombre demasiado largo.");
  if (asientos.some((a) => a.numero > 9999)) e.push("Hay números de asiento demasiado grandes.");
  return e;
}

/** Caja que contiene todo (para encuadrar el dibujo). */
export function encuadre(d: Diseno, asientos: { x: number; y: number }[], margen = 40): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const a of asientos) { xs.push(a.x); ys.push(a.y); }
  for (const f of d.formas) {
    const r = Math.hypot(f.ancho, f.alto) / 2;
    xs.push(f.x - r, f.x + r); ys.push(f.y - r, f.y + r);
  }
  if (!xs.length) return { x: 0, y: 0, w: 1000, h: 800 };
  const x0 = Math.min(...xs) - margen, y0 = Math.min(...ys) - margen;
  return { x: x0, y: y0, w: Math.max(...xs) + margen - x0, h: Math.max(...ys) + margen - y0 };
}

/**
 * La base guarda posiciones entre 0 y 10000. Si el dibujo se salió hacia la izquierda o hacia arriba (o es enorme),
 * se recorre todo junto (bloques, figuras y asientos) para que quepa; el dibujo se ve igual.
 */
export function normalizarOrigen(d: Diseno): { d: Diseno; dx: number; dy: number; cabe: boolean } {
  // Solo los asientos tienen que caber (las figuras se guardan en el diseño, no en la tabla de asientos).
  const caja = encuadre({ ...d, formas: [] }, generarLibre(d), 0);
  const dx = caja.x < 20 ? Math.ceil(20 - caja.x) : 0;
  const dy = caja.y < 20 ? Math.ceil(20 - caja.y) : 0;
  const cabe = caja.w + 40 <= 9900 && caja.h + 40 <= 9900;
  if (!dx && !dy) return { d, dx, dy, cabe };
  return {
    d: { ...d, bloques: d.bloques.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })), formas: d.formas.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })) },
    dx, dy, cabe,
  };
}

// ──────── Plantillas para empezar ────────

let siguiente = 0;
export const nuevoId = (p: string) => `${p}${Date.now().toString(36)}${(siguiente++).toString(36)}`;

export function bloqueBase(parcial: Partial<Bloque> = {}): Bloque {
  return {
    id: nuevoId("b"), nombre: "Bloque", forma: "recto", x: 500, y: 200, rot: 0, filas: 8, asientos: 12, crece: 0, paso: 22, sepFila: 26,
    curva: 0, radio: 180, desde: -45, hasta: 45, filaInicial: "A", numInicial: null, sentido: "izq", zona: null, ...parcial,
  };
}

export const forma = (parcial: Partial<Forma>): Forma =>
  ({ id: nuevoId("f"), tipo: "rect", etiqueta: "Escenario", x: 500, y: 80, ancho: 360, alto: 70, rot: 0, ...parcial });

export type Plantilla = "frontal" | "pasarela" | "redondo" | "arena";
export const PLANTILLAS: { id: Plantilla; label: string; ayuda: string }[] = [
  { id: "frontal", label: "Frontal", ayuda: "Escenario al frente y tres bloques con pasillos." },
  { id: "pasarela", label: "Con pasarela", ayuda: "Escenario con pasarela al centro y público a los lados." },
  { id: "redondo", label: "360°", ayuda: "Escenario redondo al centro y público alrededor." },
  { id: "arena", label: "Arena", ayuda: "Escenario rectangular al centro y cuatro tribunas." },
];

export function plantilla(p: Plantilla): Diseno {
  switch (p) {
    case "frontal":
      return { version: 1, formas: [forma({ x: 500, y: 70, ancho: 460, alto: 70 })], bloques: [
        bloqueBase({ nombre: "Izquierda", x: 270, y: 170, rot: 8, asientos: 8, filas: 12, curva: 0 }),
        bloqueBase({ nombre: "Centro", x: 500, y: 160, asientos: 14, filas: 12, curva: 20 }),
        bloqueBase({ nombre: "Derecha", x: 730, y: 170, rot: -8, asientos: 8, filas: 12 }),
      ] };
    case "pasarela":
      return { version: 1, formas: [forma({ x: 500, y: 70, ancho: 480, alto: 70 }), forma({ etiqueta: "Pasarela", x: 500, y: 260, ancho: 60, alto: 310 })], bloques: [
        bloqueBase({ nombre: "Izquierda", x: 445, y: 270, rot: 90, asientos: 12, filas: 6 }),
        bloqueBase({ nombre: "Derecha", x: 555, y: 270, rot: -90, asientos: 12, filas: 6 }),
        bloqueBase({ nombre: "Frente", x: 500, y: 450, asientos: 10, filas: 5 }),
      ] };
    case "redondo":
      return { version: 1, formas: [forma({ tipo: "elipse", x: 500, y: 420, ancho: 240, alto: 240 })], bloques: [
        bloqueBase({ nombre: "Norte", forma: "arco", x: 500, y: 420, radio: 160, desde: -38, hasta: 38, asientos: 10, crece: 1, filas: 6 }),
        bloqueBase({ nombre: "Este", forma: "arco", x: 500, y: 420, radio: 160, desde: 52, hasta: 128, asientos: 10, crece: 1, filas: 6 }),
        bloqueBase({ nombre: "Sur", forma: "arco", x: 500, y: 420, radio: 160, desde: 142, hasta: 218, asientos: 10, crece: 1, filas: 6 }),
        bloqueBase({ nombre: "Oeste", forma: "arco", x: 500, y: 420, radio: 160, desde: 232, hasta: 308, asientos: 10, crece: 1, filas: 6 }),
      ] };
    case "arena":
      return { version: 1, formas: [forma({ x: 500, y: 400, ancho: 300, alto: 180 })], bloques: [
        bloqueBase({ nombre: "Norte", x: 500, y: 280, rot: 180, asientos: 12, filas: 5 }),
        bloqueBase({ nombre: "Sur", x: 500, y: 520, asientos: 12, filas: 5 }),
        bloqueBase({ nombre: "Oeste", x: 320, y: 400, rot: 90, asientos: 7, filas: 5 }),
        bloqueBase({ nombre: "Este", x: 680, y: 400, rot: -90, asientos: 7, filas: 5 }),
      ] };
  }
}

/** Diseño guardado (o vacío si no es válido). */
export function leerDiseno(v: unknown): Diseno | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Partial<Diseno>;
  if (d.version !== 1 || !Array.isArray(d.bloques) || !Array.isArray(d.formas)) return null;
  const clave = /^\d{1,3}:\d{1,3}$/;
  const limpio = (b: Partial<Bloque>): Bloque => {
    const x = bloqueBase(b);
    x.porFila = Array.isArray(b.porFila) ? b.porFila.slice(0, 60).map((n) => Math.min(120, Math.max(0, Math.floor(Number(n) || 0)))) : null;
    x.zonasAsiento = Object.fromEntries(Object.entries(b.zonasAsiento && typeof b.zonasAsiento === "object" ? b.zonasAsiento : {})
      .filter(([k, v]) => clave.test(k) && typeof v === "string" && v.length <= 40));
    x.quitados = Array.isArray(b.quitados) ? b.quitados.filter((k) => typeof k === "string" && clave.test(k)) : [];
    return x;
  };
  return { version: 1, formas: d.formas.map((f) => forma(f)), bloques: d.bloques.map((b) => limpio(b)) };
}
