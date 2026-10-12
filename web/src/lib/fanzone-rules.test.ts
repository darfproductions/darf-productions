import { describe, expect, it } from "vitest";
import { categoriaSugerida, dominio, fanRow, numeroSocio, ordenFanzone } from "./fanzone-rules";

const base = { tipo: "video", titulo: "Ensayo", descripcion: "", enlace: "", archivo: null };

describe("fanRow", () => {
  it("video desde un enlace de YouTube", () => {
    const r = fanRow("mm", { ...base, enlace: "https://youtu.be/dQw4w9WgXcQ" });
    expect(r.ok && r.row.youtube_id).toBe("dQw4w9WgXcQ");
    expect(fanRow("mm", { ...base, enlace: "https://vimeo.com/1" }).ok).toBe(false);
  });
  it("enlace solo https", () => {
    expect(fanRow("mm", { ...base, tipo: "enlace", enlace: "http://x.com" }).ok).toBe(false);
    const r = fanRow("mm", { ...base, tipo: "enlace", enlace: " https://open.spotify.com/p " });
    expect(r.ok && r.row.url).toBe("https://open.spotify.com/p");
  });
  it("archivo en la carpeta de la obra", () => {
    expect(fanRow("mm", { ...base, tipo: "documento", archivo: "hsm/fanzone/a.pdf" }).ok).toBe(false);
    expect(fanRow("mm", { ...base, tipo: "foto", archivo: "mm/fanzone/a.jpg" }).ok).toBe(true);
  });
  it("texto necesita texto y título", () => {
    expect(fanRow("mm", { ...base, tipo: "texto" }).ok).toBe(false);
    expect(fanRow("mm", { ...base, tipo: "texto", titulo: " ", descripcion: "Hola" }).ok).toBe(false);
    expect(fanRow("mm", { ...base, tipo: "texto", descripcion: "Hola" }).ok).toBe(true);
    expect(fanRow("mm", { ...base, tipo: "audio" }).ok).toBe(false);
  });
});

describe("orden", () => {
  it("destacados primero, luego orden", () => {
    const xs = [
      { id: "a", destacado: false, orden: 1, created_at: "1" },
      { id: "b", destacado: true, orden: 5, created_at: "1" },
      { id: "c", destacado: false, orden: 0, created_at: "1" },
    ];
    expect(ordenFanzone(xs).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("dominio", () => {
    expect(dominio("https://www.instagram.com/darf")).toBe("instagram.com");
  });
});

describe("Club Fan", () => {
  it("número de socio y categoría sugerida", () => {
    expect(numeroSocio(1)).toBe("#0001");
    expect(numeroSocio(12345)).toBe("#12345");
    expect(categoriaSugerida("video")).toBe("ensayo");
    expect(categoriaSugerida("foto")).toBe("fotos");
    expect(categoriaSugerida("enlace")).toBe("otro");
  });
});
