import { contrastRatio } from "@/lib/kit-rules";

// ─── Kit de producción (plantilla obligatoria) ───────────────────────────
// Toda producción se presenta con las MISMAS piezas, siempre acomodadas igual
// por la plantilla. Ver docs/DARF-2.0-PRODUCCIONES.md. El kit vive en la tabla
// productions (migración 0029) y la base no deja publicar una obra sin él.
// Funciones puras (sin base ni servidor) para poder probarlas: kits.test.ts.

export type ProductionTheme = {
  /** Fondo de la página de la obra: lo elige cada obra (claro u oscuro). */
  fondo: string;
  superficie: string;
  texto: string;
  acento: string;
  /** URL del logo del título (transparente, legible sobre `fondo`). */
  logo: string;
  /** URL de la imagen de ambiente horizontal 16:9, sin texto. */
  ambiente: string;
  tagline: string;
};

/** Columnas del kit en productions. */
export type KitColumns = {
  color_fondo: string | null;
  color_superficie: string | null;
  color_texto: string | null;
  color_acento: string | null;
  logo_path: string | null;
  ambiente_path: string | null;
  frase: string | null;
};

/** Arma el tema de una obra; null si su kit está incompleto. */
export function themeFromKit(k: KitColumns, assetUrl: (path: string) => string): ProductionTheme | null {
  if (!k.color_fondo || !k.color_superficie || !k.color_texto || !k.color_acento || !k.logo_path || !k.ambiente_path) {
    return null;
  }
  return {
    fondo: k.color_fondo,
    superficie: k.color_superficie,
    texto: k.color_texto,
    acento: k.color_acento,
    logo: assetUrl(k.logo_path),
    ambiente: assetUrl(k.ambiente_path),
    tagline: k.frase ?? "",
  };
}

/** Reglas de legibilidad del kit (las mismas que production_kit_problems en la base). */
export function themeProblems(t: Pick<ProductionTheme, "fondo" | "superficie" | "texto" | "acento">): string[] {
  const out: string[] = [];
  if (contrastRatio(t.texto, t.fondo) < 4.5) out.push("El texto no se lee sobre el fondo (mínimo 4.5:1).");
  if (contrastRatio(t.texto, t.superficie) < 4.5) out.push("El texto no se lee sobre la superficie (mínimo 4.5:1).");
  if (contrastRatio(t.acento, t.fondo) < 3) out.push("El acento no se distingue del fondo (mínimo 3:1).");
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
