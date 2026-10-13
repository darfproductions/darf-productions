import { describe, expect, it } from "vitest";
import { guiaDe, textoInvitacion } from "./guia-roles";

describe("guía de tu rol", () => {
  it("un paso por permiso, con liga a su pestaña", () => {
    const g = guiaDe(["ventas.operar", "puerta.validar", "obra.ver"], "showman");
    expect(g.map((p) => p.titulo)).toEqual(["Taquilla", "Puerta"]);
    expect(g[1].href).toBe("/panel/producciones/showman/puerta");
  });
  it("quien gestiona materiales no ve además el paso de solo verlos", () => {
    expect(guiaDe(["materiales.ver", "materiales.gestionar"], "x").map((p) => p.que)).toEqual(["Subir y organizar libretos, pistas y partituras para el elenco."]);
  });
  it("sin permisos no hay pasos", () => {
    expect(guiaDe([], "x")).toEqual([]);
  });
  it("mensaje de WhatsApp con la liga", () => {
    expect(textoInvitacion("Showman", ["Taquilla"], "https://x/invitacion/abc")).toContain("equipo de Showman en DARF Productions (Taquilla)");
  });
});
