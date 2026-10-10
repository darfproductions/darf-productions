import type { StaticImageData } from "next/image";
import { contrastRatio } from "@/lib/kit-rules";
import showmanLogo from "@/assets/producciones/showman-title.webp";
import showmanCartel from "@/assets/producciones/showman-poster.jpg";
import showmanAmbiente from "@/assets/producciones/showman-stage.jpg";
import mmLogo from "@/assets/producciones/mm-title.webp";
import mmCartel from "@/assets/producciones/mm-key.jpg";
import mmAmbiente from "@/assets/producciones/mm-flowers.jpg";
import hsmLogo from "@/assets/producciones/hsm-title.webp";
import hsmCartel from "@/assets/producciones/hsm-poster.jpg";
import hsmAmbiente from "@/assets/producciones/hsm-curtain.jpg";

// ─── Kit de producción (plantilla obligatoria) ───────────────────────────
// Toda producción se presenta con las MISMAS piezas, siempre acomodadas igual
// por la plantilla. Ver docs/DARF-2.0-PRODUCCIONES.md. En la Fase 2 el kit se
// guarda en la base (con estas mismas reglas como restricciones) y se edita
// desde el panel; por ahora vive aquí para las tres producciones existentes.

export type ProductionTheme = {
  /** Claro u oscuro según la identidad de la obra. */
  modo: "claro" | "oscuro";
  fondo: string;
  superficie: string;
  texto: string;
  acento: string;
  /** Logo del título, fondo transparente, legible sobre `fondo`. Obligatorio. */
  logo: StaticImageData;
  /** Cartel oficial (vertical o cuadrado). Obligatorio. */
  cartel: StaticImageData;
  /** Imagen de ambiente para el fondo del hero. Opcional: si falta, cartel desenfocado. */
  ambiente?: StaticImageData;
  tagline: string;
};

export const THEMES: Record<string, ProductionTheme> = {
  showman: {
    modo: "oscuro",
    fondo: "#08101f",
    superficie: "#0f1c36",
    texto: "#f7eedb",
    acento: "#e8be45",
    logo: showmanLogo,
    cartel: showmanCartel,
    ambiente: showmanAmbiente,
    tagline: "Bienvenidos al espectáculo más grande.",
  },
  mm: {
    modo: "claro",
    fondo: "#fbfaf8",
    superficie: "#ffffff",
    texto: "#13235c",
    acento: "#c2255c",
    logo: mmLogo,
    cartel: mmCartel,
    ambiente: mmAmbiente,
    tagline: "Una boda, tres posibles padres y la música de ABBA.",
  },
  hsm: {
    modo: "oscuro",
    fondo: "#1a0607",
    superficie: "#2a0c0e",
    texto: "#fcebd0",
    acento: "#f2b544",
    logo: hsmLogo,
    cartel: hsmCartel,
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
  return out;
}

/** Variables CSS que el tema de la obra sobreescribe (ver globals.css). */
export function themeStyle(theme: ProductionTheme | null): React.CSSProperties {
  if (!theme) return {};
  return {
    "--obra-fondo": theme.fondo,
    "--obra-superficie": theme.superficie,
    "--obra-texto": theme.texto,
    "--obra-acento": theme.acento,
  } as React.CSSProperties;
}

