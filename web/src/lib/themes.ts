import type { StaticImageData } from "next/image";
import { contrastRatio } from "@/lib/kit-rules";
import showmanLogo from "@/assets/producciones/showman-title.webp";
import showmanAmbiente from "@/assets/producciones/showman-ambiente.jpg";
import mmLogo from "@/assets/producciones/mm-title.webp";
import mmAmbiente from "@/assets/producciones/mm-ambiente-claro.jpg";
import hsmLogo from "@/assets/producciones/hsm-title.webp";
import hsmAmbiente from "@/assets/producciones/hsm-ambiente.jpg";

// ─── Kit de producción (plantilla obligatoria) ───────────────────────────
// Toda producción se presenta con las MISMAS piezas, siempre acomodadas igual
// por la plantilla. Ver docs/DARF-2.0-PRODUCCIONES.md. En la Fase 2 el kit se
// guarda en la base (con estas mismas reglas como restricciones) y se edita
// desde el panel; por ahora vive aquí para las tres producciones existentes.

export type ProductionTheme = {
  /** Fondo de la página de la obra: lo elige cada obra (claro u oscuro). */
  fondo: string;
  superficie: string;
  texto: string;
  acento: string;
  /** Logo del título, transparente, en la versión que se lee sobre `fondo`. Obligatorio. */
  logo: StaticImageData;
  /** Imagen de ambiente horizontal 16:9, sin texto. Obligatoria. */
  ambiente: StaticImageData;
  tagline: string;
};

export const THEMES: Record<string, ProductionTheme> = {
  showman: {
    fondo: "#08101f",
    superficie: "#0f1c36",
    texto: "#f7eedb",
    acento: "#e8be45",
    logo: showmanLogo,
    ambiente: showmanAmbiente,
    tagline: "Bienvenidos al espectáculo más grande.",
  },
  mm: {
    // Fondo blanco con flores, como su identidad original (decisión de Johann, 2026-10-11).
    fondo: "#f8f7f5",
    superficie: "#ffffff",
    texto: "#13235c",
    acento: "#c2255c",
    logo: mmLogo,
    ambiente: mmAmbiente,
    tagline: "Una boda, tres posibles padres y la música de ABBA.",
  },
  hsm: {
    fondo: "#1a0607",
    superficie: "#2a0c0e",
    texto: "#fcebd0",
    acento: "#f2b544",
    logo: hsmLogo,
    ambiente: hsmAmbiente,
    tagline: "East High, un escenario y el valor de salirse del guion.",
  },
};

export function getTheme(id: string): ProductionTheme | null {
  return THEMES[id] ?? null;
}

/** Reglas de legibilidad del kit (las mismas que validará el panel). */
export function themeProblems(t: ProductionTheme): string[] {
  const out: string[] = [];
  if (contrastRatio(t.texto, t.fondo) < 4.5) out.push("El texto no se lee sobre el fondo (mínimo 4.5:1).");
  if (contrastRatio(t.texto, t.superficie) < 4.5) out.push("El texto no se lee sobre la superficie (mínimo 4.5:1).");
  if (contrastRatio(t.acento, t.fondo) < 3) out.push("El acento no se distingue del fondo (mínimo 3:1).");
  if (t.ambiente.width / t.ambiente.height < 1.6) out.push("La imagen de ambiente debe ser horizontal (16:9).");
  return out;
}

/** Fondo claro u oscuro: decide sombras y velos de la plantilla, no el diseño. */
export function isLight(fondo: string): boolean {
  return contrastRatio(fondo, "#000000") > contrastRatio(fondo, "#ffffff");
}

/** Variables CSS que el tema de la obra sobreescribe (ver globals.css). */
export function themeStyle(theme: ProductionTheme | null): React.CSSProperties {
  if (!theme) return {};
  return {
    // Sombra del logo: oscura sobre fondos oscuros, casi nada sobre claros.
    "--obra-sombra": isLight(theme.fondo) ? "rgb(19 35 92 / 0.12)" : "rgb(0 0 0 / 0.5)",
    "--obra-fondo": theme.fondo,
    "--obra-superficie": theme.superficie,
    "--obra-texto": theme.texto,
    "--obra-acento": theme.acento,
  } as React.CSSProperties;
}

