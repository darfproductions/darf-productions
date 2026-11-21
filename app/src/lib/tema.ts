import { contrastRatio } from "@/lib/kit-rules";
import type { KitColumns } from "@/lib/themes";

// Temas de la app: modo noche y modo día (preferencia de cada persona) y la paleta de cada obra.
// Cada obra trae su kit de colores (productions.color_*, el mismo que usa la web). Ese kit es UN modo; el otro
// se deriva aquí: una versión aclarada (día) u oscurecida (noche) de los mismos colores, para que la obra se
// siga reconociendo en ambos modos. Todo se valida con contraste WCAG. Pruebas: tema.test.ts.

export type Modo = "noche" | "dia";
export type Preferencia = "auto" | Modo;

/** Variables que lee la interfaz (estilos.css). */
export type Paleta = {
  fondo: string;
  superficie: string;
  texto: string;
  suave: string;
  linea: string;
  /** Acento para TEXTO (etiquetas, íconos): ajustado a 4.5:1 sobre el fondo. */
  acento: string;
  /** Texto sobre `acento`. */
  sobreAcento: string;
  /** Relleno de botones y píldoras: el acento original de la obra (el dorado de Showman se queda dorado en día). */
  boton: string;
  /** Texto sobre `boton`. */
  sobreBoton: string;
};

type Hsl = { h: number; s: number; l: number };

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color inválido: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function hex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
}

export function aHsl(color: string): Hsl {
  const [r, g, b] = rgb(color).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function deHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Acerca `color` a blanco o a negro (lo que más contraste dé contra `fondo`) hasta llegar a `minimo`. */
export function ajustar(color: string, fondo: string, minimo: number): string {
  if (contrastRatio(color, fondo) >= minimo) return color;
  const destino = contrastRatio("#ffffff", fondo) > contrastRatio("#000000", fondo) ? "#ffffff" : "#000000";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mezclar(color, destino, t);
    if (contrastRatio(c, fondo) >= minimo) return c;
  }
  return destino;
}

export function esClaro(fondo: string): boolean {
  return contrastRatio(fondo, "#000000") > contrastRatio(fondo, "#ffffff");
}

/** Negro o blanco, el que mejor se lea sobre `color`. */
export function textoSobre(color: string): string {
  return sobre(color);
}

function sobre(color: string): string {
  return contrastRatio("#0b0b0b", color) >= contrastRatio("#ffffff", color) ? "#0b0b0b" : "#ffffff";
}

/** Completa una paleta a partir de fondo, superficie, texto y acento. */
function completar(fondo: string, superficie: string, texto: string, acento: string): Paleta {
  const t = ajustar(texto, fondo, 4.5);
  const a = ajustar(acento, fondo, 4.5);
  return {
    fondo,
    superficie,
    texto: ajustar(t, superficie, 4.5),
    suave: ajustar(mezclar(t, fondo, 0.3), fondo, 4.5),
    linea: mezclar(t, fondo, 0.8),
    acento: a,
    sobreAcento: sobre(a),
    // El relleno de un botón conserva el color de la obra: lo que debe leerse es su texto, y `sobreBoton`
    // garantiza ese contraste. Así el dorado de Showman sigue dorado sobre su azul aclarado.
    boton: acento,
    sobreBoton: sobre(acento),
  };
}

type Kit = Pick<KitColumns, "color_fondo" | "color_superficie" | "color_texto" | "color_acento">;

/** Paleta de la obra para el modo pedido; null si el kit está incompleto (la pantalla usa la de DARF). */
export function paletaObra(kit: Kit, modo: Modo): Paleta | null {
  const { color_fondo: fondo, color_superficie: sup, color_texto: texto, color_acento: acento } = kit;
  if (!fondo || !sup || !texto || !acento) return null;
  const claro = esClaro(fondo);

  // El kit ya es de ese modo: se usa tal cual (solo se garantiza el contraste).
  if (claro === (modo === "dia")) return completar(fondo, sup, texto, acento);

  if (modo === "dia") {
    // Obra oscura en modo día: el mismo tono del fondo, aclarado (Diego: "una versión aclarada de los colores
    // de la obra", no un fondo neutro). La saturación se modera para que no encandile. Si el fondo es neutro
    // (negro puro, como Greased Lightning), el tono sale de la superficie, que es donde la obra pone su color.
    const base = aHsl(fondo).s >= 0.15 ? aHsl(fondo) : aHsl(sup);
    const s = Math.min(base.s, 0.55);
    return completar(
      deHsl({ h: base.h, s, l: 0.87 }),
      deHsl({ h: base.h, s, l: 0.93 }),
      contrastRatio(fondo, "#ffffff") >= 10 ? fondo : deHsl({ h: base.h, s, l: 0.14 }),
      acento,
    );
  }

  // Obra clara en modo noche: fondo oscuro con el tono del texto de la obra (su color "de tinta").
  const tinta = aHsl(texto);
  const s = Math.min(tinta.s, 0.6);
  return completar(deHsl({ h: tinta.h, s, l: 0.1 }), deHsl({ h: tinta.h, s, l: 0.16 }), fondo, acento);
}

/** Variables CSS de una paleta (se ponen en el contenedor de la pantalla de la obra). */
export function variables(p: Paleta): Record<string, string> {
  return {
    "--fondo": p.fondo,
    "--superficie": p.superficie,
    "--tarjeta": p.superficie,
    "--texto": p.texto,
    "--suave": p.suave,
    "--linea": p.linea,
    "--acento": p.acento,
    "--sobre-acento": p.sobreAcento,
    "--boton": p.boton,
    "--sobre-boton": p.sobreBoton,
  };
}
