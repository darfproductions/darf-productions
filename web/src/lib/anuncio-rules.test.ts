import { describe, expect, it } from "vitest";
import { leerAnuncio } from "./anuncio-rules";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const base = { lugar: "obra", tipo: "elenco", titulo: "Revelación del elenco", adelanto: "Muy pronto" };

describe("leerAnuncio", () => {
  it("arma la fila con fechas de México", () => {
    const r = leerAnuncio(form({ ...base, revela_at: "2027-01-10T20:00", registro: "1", publicado: "1", enlace: "/audiciones", boton: "Ver" }), ["obra", "fanzone"], "showman");
    expect(r.ok && r.fila).toMatchObject({ lugar: "obra", production_id: "showman", revela_at: "2027-01-10T20:00:00-06:00", registro: true, publicado: true, enlace: "/audiciones" });
  });
  it("solo los lugares permitidos", () => {
    expect(leerAnuncio(form({ ...base, lugar: "inicio" }), ["obra", "fanzone"], "showman").ok).toBe(false);
  });
  it("Avísame necesita fecha de revelación", () => {
    const r = leerAnuncio(form({ ...base, registro: "1" }), ["obra"], "showman");
    expect(r.ok ? "" : r.message).toMatch(/fecha de revelación/);
  });
  it("revisa la liga y el botón", () => {
    expect(leerAnuncio(form({ ...base, enlace: "//malo.com" }), ["obra"], "showman").ok).toBe(false);
    expect(leerAnuncio(form({ ...base, boton: "Ir" }), ["obra"], "showman").ok).toBe(false);
    const r = leerAnuncio(form({ ...base, enlace: "darf.mx/x" }), ["obra"], "showman");
    expect(r.ok && r.fila.enlace).toBe("https://darf.mx/x");
  });
  it("necesita texto", () => {
    expect(leerAnuncio(form({ lugar: "obra", tipo: "general", titulo: "Hola" }), ["obra"], "showman").ok).toBe(false);
  });
});
