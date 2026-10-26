// Mapa de la taquilla para mandar por WhatsApp (2026-10-26): asientos con su número, letra de fila y ocupados.
// Puro, con pruebas en taquilla-mapa-rules.test.ts. El dibujo está en taquilla-mapa.tsx.
import type { Forma } from "@/lib/mapa-libre";
import { etiquetasFila } from "@/lib/mapa-filas";

export type AsientoTaquilla = { id: string; x: number | null; y: number | null; fila: string | null; numero: number | null; lado: string | null; zona: string | null; /** Bloque del mapa libre. */ grupo?: string | null };
export type PuntoTaquilla = { id: string; x: number; y: number; zona: string | null; fila: string; numero: number | null };
/** Letra de fila en una punta de la fila (en las dos puntas de cada fila de cada bloque). */
export type FilaEtiqueta = { fila: string; x: number; y: number };
export type FormaTaquilla = { x: number; y: number; ancho: number; alto: number; rot: number; etiqueta: string };
export type Plano = { puntos: PuntoTaquilla[]; filas: FilaEtiqueta[]; formas: FormaTaquilla[]; ancho: number; alto: number; radio: number; escenarioArriba: boolean };

/** Separación mínima entre dos asientos (para escalar el mapa libre). Con muchos asientos revisa una muestra. */
function distanciaMinima(ps: { x: number; y: number }[]): number {
  let d = Infinity;
  const paso = Math.max(1, Math.floor(ps.length / 600));
  for (let i = 0; i < ps.length; i += paso) {
    for (let j = 0; j < ps.length; j++) {
      if (i === j) continue;
      const dd = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
      if (dd > 0.001 && dd < d) d = dd;
    }
  }
  return Number.isFinite(d) ? d : 20;
}

/** Plano con tamaño fijo por asiento (radio en px): el número cabe en cada círculo y el mapa crece lo que haga falta.
 *  Con posiciones (mapa libre) usa las suyas; si no, la cuadrícula de filas como la compra (izquierda, central,
 *  derecha con pasillos). Deja lugar a los lados para la letra de cada fila. */
export function planoTaquilla(asientos: AsientoTaquilla[], formas: Forma[], radio = 20): Plano {
  const libre = asientos.some((a) => a.x != null);
  type Crudo = { a: AsientoTaquilla; x: number; y: number; n?: number };
  let crudos: Crudo[] = [];
  let fs: FormaTaquilla[] = [];
  let k: number;
  if (libre) {
    crudos = asientos.filter((a) => a.x != null).map((a) => ({ a, x: a.x!, y: a.y ?? 0 }));
    fs = formas.map((f) => ({ x: f.x, y: f.y, ancho: f.ancho, alto: f.alto, rot: f.rot, etiqueta: f.etiqueta }));
    k = (radio * 2 + 6) / distanciaMinima(crudos);
  } else {
    const filas = [...new Set(asientos.map((a) => a.fila ?? "?"))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    filas.forEach((f, fi) => {
      let col = 0;
      for (const lado of ["izquierda", "central", "derecha"]) {
        const xs = asientos.filter((a) => (a.fila ?? "?") === f && (a.lado ?? "central") === lado).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
        if (!xs.length) continue;
        if (col) col += 2;
        for (const a of xs) { crudos.push({ a, x: col * 20, y: fi * 20, n: col }); col++; }
      }
    });
    const ancho0 = Math.max(0, ...crudos.map((p) => p.x));
    for (const fy of new Set(crudos.map((p) => p.y))) {
      const fila = crudos.filter((p) => p.y === fy);
      const dx = (ancho0 - Math.max(...fila.map((p) => p.x))) / 2;
      for (const p of fila) p.x += dx;
    }
    k = (radio * 2 + 8) / 20;
  }
  if (!crudos.length) return { puntos: [], filas: [], formas: [], ancho: 0, alto: 0, radio, escenarioArriba: !libre };
  const xs = [...crudos.map((p) => p.x), ...fs.flatMap((f) => [f.x - f.ancho / 2, f.x + f.ancho / 2])];
  const ys = [...crudos.map((p) => p.y), ...fs.flatMap((f) => [f.y - f.alto / 2, f.y + f.alto / 2])];
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  // Margen: letra de fila a cada lado (y medio asiento); arriba, el escenario si no es mapa libre.
  const lado = radio * 2 + 40;
  const arriba = libre ? radio + 10 : radio * 4 + 40;
  const puntos = crudos.map((p) => ({ id: p.a.id, x: lado + (p.x - x0) * k, y: arriba + (p.y - y0) * k, zona: p.a.zona, fila: p.a.fila ?? "?", numero: p.a.numero }));
  const formasP = fs.map((f) => ({ ...f, x: lado + (f.x - x0) * k, y: arriba + (f.y - y0) * k, ancho: f.ancho * k, alto: f.alto * k }));
  const ancho = Math.ceil(lado * 2 + (Math.max(...xs) - x0) * k);
  const alto = Math.ceil(arriba + (Math.max(...ys) - y0) * k + radio + 10);
  // Letras de fila con la misma regla que el mapa de la página: en las dos puntas de cada fila de cada bloque (sirve
  // también para los bloques en ángulo del mapa libre). Se calculan sin escalar y luego se colocan igual que los asientos.
  const filas: FilaEtiqueta[] = etiquetasFila(
    crudos.map((p) => ({ x: p.x, y: p.y, numero: p.n ?? p.a.numero, fila: p.a.fila, grupo: libre ? p.a.grupo ?? undefined : "fila" })),
    (radio + 24) / k,
  ).map((e) => ({ fila: e.fila, x: lado + (e.x - x0) * k, y: arriba + (e.y - y0) * k }));
  return { puntos, filas, formas: formasP, ancho, alto, radio, escenarioArriba: !libre };
}

/** Texto negro o blanco según qué tan claro es el color de la zona. */
export function tintaSobre(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111018" : "#ffffff";
}

/** "Quedan 132 de 400" (o "Agotado"). */
export function textoQuedan(libres: number, total: number): string {
  return libres <= 0 ? "Agotado" : `Quedan ${libres} de ${total}`;
}
