import { describe, expect, it } from "vitest";
import { checkImage, storagePath } from "./image-rules";

const MB = 1024 * 1024;

describe("reglas de imágenes", () => {
  it("logo: transparente y suficientemente grande", () => {
    expect(checkImage("logo", { type: "image/png", size: MB, width: 1400, height: 400, transparent: 0.4 }).ok).toBe(true);
    expect(checkImage("logo", { type: "image/jpeg", size: MB, width: 1400, height: 400 }).ok).toBe(false);
    expect(checkImage("logo", { type: "image/png", size: MB, width: 1400, height: 400, transparent: 0 }).errors).toContain("El logo no tiene fondo transparente.");
    expect(checkImage("logo", { type: "image/webp", size: MB, width: 900, height: 300, transparent: 0.3 }).warnings).toHaveLength(1);
  });
  it("ambiente: horizontal 16:9", () => {
    expect(checkImage("ambiente", { type: "image/jpeg", size: MB, width: 1920, height: 1080 }).ok).toBe(true);
    expect(checkImage("ambiente", { type: "image/jpeg", size: MB, width: 1600, height: 1600 }).ok).toBe(false);
    const chica = checkImage("ambiente", { type: "image/jpeg", size: MB, width: 1545, height: 869 });
    expect(chica.ok).toBe(true);
    expect(chica.warnings).toHaveLength(1);
  });
  it("retrato: avisa si no es 3:4 pero lo acepta", () => {
    const r = checkImage("retrato", { type: "image/jpeg", size: MB, width: 1200, height: 1200 });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/3:4/);
  });
  it("galería: máximo 5 MB", () => {
    expect(checkImage("galeria", { type: "image/jpeg", size: 6 * MB, width: 2000, height: 1300 }).ok).toBe(false);
  });
  it("ruta dentro de la carpeta de la obra", () => {
    expect(storagePath("mm", "creditos", "Adriana Alarcón", "image/jpeg")).toMatch(/^mm\/creditos\/adriana-alarcon-[a-z0-9]+\.jpg$/);
  });
});
