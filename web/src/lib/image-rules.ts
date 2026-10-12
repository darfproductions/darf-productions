// Reglas de las imágenes que se suben desde el panel (docs/DARF-2.0-PRODUCCIONES.md §2).
// Funciones puras para poder probarlas: image-rules.test.ts. El navegador mide la
// imagen antes de subirla; la base además limita tipo y tamaño del archivo.

export type ImageKind = "logo" | "ambiente" | "retrato" | "galeria" | "patrocinador";

export type ImageInfo = {
  type: string;
  size: number;
  width: number;
  height: number;
  /** Fracción de píxeles (casi) transparentes, de 0 a 1. Solo se mide en logos. */
  transparent?: number;
};

export type ImageCheck = { ok: boolean; errors: string[]; warnings: string[] };

const MB = 1024 * 1024;

export const IMAGE_RULES: Record<ImageKind, { types: string[]; maxSize: number; label: string; hint: string }> = {
  logo: { types: ["image/png", "image/webp"], maxSize: 8 * MB, label: "Logo", hint: "PNG o WebP con fondo transparente, mínimo 1200 px de ancho." },
  ambiente: { types: ["image/jpeg", "image/webp", "image/png"], maxSize: 8 * MB, label: "Imagen de ambiente", hint: "Horizontal 16:9, ideal 1920×1080, sin texto ni logos." },
  retrato: { types: ["image/jpeg", "image/webp", "image/png"], maxSize: 8 * MB, label: "Retrato", hint: "Vertical 3:4, ideal 900×1200, de la sesión de esta obra." },
  galeria: { types: ["image/jpeg", "image/webp", "image/png"], maxSize: 5 * MB, label: "Foto", hint: "JPG o WebP, máximo 5 MB." },
  patrocinador: { types: ["image/png", "image/webp", "image/jpeg"], maxSize: 4 * MB, label: "Logo del patrocinador", hint: "PNG, WebP o JPG, de preferencia con fondo transparente o blanco; mínimo 300 px de ancho." },
};

export function checkImage(kind: ImageKind, i: ImageInfo): ImageCheck {
  const rule = IMAGE_RULES[kind];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rule.types.includes(i.type)) errors.push(`Formato no permitido. ${rule.hint}`);
  if (i.size > rule.maxSize) errors.push(`El archivo pesa más de ${Math.round(rule.maxSize / MB)} MB.`);
  const ratio = i.width / i.height;

  if (kind === "logo") {
    if (i.width < 600) errors.push("El logo es muy pequeño (mínimo 600 px de ancho).");
    else if (i.width < 1200) warnings.push("El logo mide menos de 1200 px de ancho; puede verse borroso.");
    if (i.transparent !== undefined && i.transparent < 0.01) errors.push("El logo no tiene fondo transparente.");
  }
  if (kind === "ambiente") {
    if (ratio < 1.6) errors.push("La imagen de ambiente debe ser horizontal 16:9.");
    if (i.width < 1280) errors.push("La imagen de ambiente es muy pequeña (mínimo 1280 px de ancho).");
    else if (i.width < 1920) warnings.push("Mide menos de 1920 px de ancho; en pantallas grandes puede verse suave.");
  }
  if (kind === "retrato") {
    if (i.width < 400) errors.push("El retrato es muy pequeño (mínimo 400 px de ancho).");
    if (ratio < 0.6 || ratio > 0.9) warnings.push("No es vertical 3:4; se recortará para que todas las fotos se vean iguales.");
    else if (i.width < 900) warnings.push("Mide menos de 900 px de ancho; ideal 900×1200.");
  }
  if (kind === "patrocinador" && i.width < 300) errors.push("El logo es muy pequeño (mínimo 300 px de ancho).");
  return { ok: errors.length === 0, errors, warnings };
}

/** Nombre de archivo seguro y único dentro de la carpeta de la obra. */
export function storagePath(productionId: string, carpeta: "kit" | "creditos" | "galeria" | "programa", base: string, type: string): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const slug = base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "imagen";
  return `${productionId}/${carpeta}/${slug}-${Date.now().toString(36)}.${ext}`;
}
